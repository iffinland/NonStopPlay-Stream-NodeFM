import {
  publishMultipleResources,
  QORTAL_JSON_MAX_BYTES,
  QdnPublishPreflightError,
  type PublishInput,
} from '../../qortium/qdn';
import { requireAccountWrite } from '../../qortium/accountWriteGate';
import { generateId } from '../../utils/id';
import { deserializeTrackFromQdn } from '../tracks/services/trackService';
import type { Track } from '../../types/domain';
import { getBulkImportBatchSummary } from './selectors';
import {
  createBulkImportMetadataArtifact,
  type BulkImportMetadataArtifact,
} from './metadataExport';
import { getRequiredPublicationContentRevision } from './publicationJournal';
import { applyBulkPublicationRowResultToBatch } from './home2PublicationReducer';
import { qortalBulkCoordinate } from './qortalBulkCoordinates';
import type { BulkImportBatch, BulkImportRow } from './types';
import type {
  BulkPublicationRowResult,
  BulkPublicationStepResult,
  BulkPublicationResourceStepKind,
} from './publicationAdapter';

export type BulkSelectionOptions = {
  getBatch: () => BulkImportBatch;
  commit: (batch: BulkImportBatch) => void;
  actorName: string;
  actorAddress: string;
  getSource: (
    row: BulkImportRow,
    kind: 'audio' | 'cover',
  ) => { file: Blob; fileName: string } | null;
  saveArtifact: (rowId: string, artifact: BulkImportMetadataArtifact) => void;
  onProgress: (message: string) => void;
  onTrack?: (track: Track) => void;
  isCurrent?: () => boolean;
  publish?: typeof publishMultipleResources;
  gate?: typeof requireAccountWrite;
};

/** One user action, media batches then canonical metadata batches. No automatic write retries. */
export async function publishBulkSelection(options: BulkSelectionOptions): Promise<void> {
  const { actorName: name, actorAddress: address } = options;
  const initial = options.getBatch();
  const summary = getBulkImportBatchSummary(initial);
  if (!summary.isPublicationReady) throw new Error(summary.publicationBlockers.join(' '));
  if (!name.trim() || !address.trim())
    throw new Error('Connect a Qortal account with a registered name.');
  const ids = initial.rows.filter((row) => row.selected).map((row) => row.id);
  const assertCurrent = () => {
    if (options.isCurrent?.() === false || options.getBatch().id !== initial.id)
      throw new Error('The import workspace changed. Publication stopped.');
  };
  const revision = (row: BulkImportRow, kind: BulkPublicationResourceStepKind) =>
    getRequiredPublicationContentRevision(kind, {
      sourceGeneration: row.sourceGeneration,
      source: row.localSource,
      metadata: row.metadata,
      cover: row.cover,
    })!;
  const confirmed = (row: BulkImportRow, kind: BulkPublicationResourceStepKind) => {
    const previous = row.publication[kind];
    const ref = qortalBulkCoordinate(row, initial.role, name, kind);
    return (
      previous.status === 'published' &&
      previous.contentRevision === revision(row, kind) &&
      previous.intent.name === name &&
      previous.intent.identifier === ref.identifier &&
      previous.intent.service === ref.service
    );
  };
  for (const row of initial.rows.filter((row) => ids.includes(row.id)))
    for (const kind of ['audio', 'cover', 'metadata'] as const) {
      if (
        row.publication[kind].status === 'unknown' ||
        row.publication[kind].status === 'in-progress'
      )
        throw new Error(
          'A previous publication needs verification. Use “Check pending publications” before continuing.',
        );
    }
  type Item = {
    row: BulkImportRow;
    kind: BulkPublicationResourceStepKind;
    input: PublishInput;
    artifact?: BulkImportMetadataArtifact;
  };
  const media: Item[] = [];
  for (const row of initial.rows.filter((row) => ids.includes(row.id))) {
    if (confirmed(row, 'metadata')) continue;
    for (const kind of ['audio', 'cover'] as const) {
      if ((kind === 'cover' && !row.cover) || confirmed(row, kind)) continue;
      const source = options.getSource(row, kind);
      const expected = kind === 'audio' ? row.localSource : row.cover;
      if (
        !source ||
        !expected ||
        source.file.size <= 0 ||
        (expected.sizeBytes !== null && source.file.size !== expected.sizeBytes) ||
        (expected.fileName && source.fileName !== expected.fileName)
      )
        throw new Error(`Reattach the original ${kind} for ${row.metadata.title}.`);
      const ref = qortalBulkCoordinate(row, initial.role, name, kind);
      media.push({
        row,
        kind,
        input: { ...ref, file: source.file, fileName: source.fileName, title: row.metadata.title },
      });
    }
  }
  const apply = (item: Item, step: BulkPublicationStepResult) => {
    assertCurrent();
    const result: BulkPublicationRowResult = {
      batchId: initial.id,
      rowId: item.row.id,
      sourceGeneration: item.row.sourceGeneration,
      status:
        step.status === 'published'
          ? item.kind === 'metadata'
            ? 'complete'
            : 'partial'
          : step.status === 'failed'
            ? 'failed'
            : 'unknown',
      steps: [step],
    };
    options.commit(applyBulkPublicationRowResultToBatch(options.getBatch(), result));
  };
  async function send(items: Item[], label: string) {
    for (let offset = 0; offset < items.length; offset += 10) {
      assertCurrent();
      await (options.gate ?? requireAccountWrite)('PUBLISH_MULTIPLE_QDN_RESOURCES', address);
      assertCurrent();
      const chunk = items.slice(offset, offset + 10);
      options.onProgress(`${label} · ${Math.min(offset + 10, items.length)} / ${items.length}`);
      const steps = chunk.map((item) => ({
        batchId: initial.id,
        rowId: item.row.id,
        sourceGeneration: item.row.sourceGeneration,
        step: item.kind,
        intent: qortalBulkCoordinate(item.row, initial.role, name, item.kind),
        contentRevision: revision(item.row, item.kind),
        attemptId: generateId(),
      }));
      // Synchronous durable commit precedes dispatch; crashed requests stay unknown.
      let pending = options.getBatch();
      for (const step of steps)
        pending = applyBulkPublicationRowResultToBatch(pending, {
          batchId: initial.id,
          rowId: step.rowId,
          sourceGeneration: step.sourceGeneration,
          status: 'unknown',
          steps: [{ ...step, status: 'unknown' }],
        });
      options.commit(pending);
      let response;
      try {
        response = await (options.publish ?? publishMultipleResources)(
          chunk.map((item) => item.input),
        );
      } catch (error) {
        if (error instanceof QdnPublishPreflightError) {
          steps.forEach((step, index) =>
            apply(chunk[index], {
              ...step,
              status: 'failed',
              error: { code: 'PUBLISH_PREFLIGHT_FAILED', message: error.message, retryable: true },
            }),
          );
          throw error;
        }
        throw new Error(
          `Publication stopped: ${error instanceof Error ? error.message : 'Unknown result'}. Check pending publications before retrying.`,
        );
      }
      let incomplete = false;
      let unknown = false;
      let failureMessage = '';
      for (let index = 0; index < chunk.length; index++) {
        const item = chunk[index],
          step = steps[index];
        const success = response.published.find(
          (value) =>
            value.resource.name === name &&
            value.resource.service === step.intent.service &&
            value.resource.identifier === step.intent.identifier,
        );
        if (success?.transactionSignature) {
          apply(item, {
            ...step,
            status: 'published',
            reference: { service: step.intent.service, name, identifier: step.intent.identifier! },
            confirmedContentRevision: step.contentRevision,
            transactionSignature: success.transactionSignature,
            confirmedAt: new Date().toISOString(),
          });
          if (item.artifact && initial.role === 'admin') {
            const track = deserializeTrackFromQdn(JSON.parse(item.artifact.json));
            if (track) options.onTrack?.(track);
          }
        } else {
          incomplete = true;
          const failure = response.failures.find(
            (value) =>
              value.resource.name === name &&
              value.resource.service === step.intent.service &&
              value.resource.identifier === step.intent.identifier,
          );
          if (failure && failure.outcome !== 'unknown')
            apply(item, {
              ...step,
              status: 'failed',
              error: { code: 'PUBLISH_FAILED', message: failure.error, retryable: true },
            });
          else unknown = true;
          failureMessage ||= failure?.error ?? 'No publication result was returned.';
        }
      }
      if (incomplete)
        throw new Error(
          unknown
            ? 'Some resources were not confirmed. Confirmed uploads are saved; check pending publications before continuing.'
            : `Publication stopped: ${failureMessage}. Confirmed uploads are saved; correct the issue and continue.`,
        );
    }
  }
  await send(media, 'Publishing audio and covers');
  assertCurrent();
  const metadata: Item[] = [];
  const current = options.getBatch();
  for (const row of current.rows.filter((row) => ids.includes(row.id))) {
    if (confirmed(row, 'metadata')) continue;
    const artifact = createBulkImportMetadataArtifact(current, row, name, address);
    if (artifact.sizeBytes > QORTAL_JSON_MAX_BYTES)
      throw new Error(
        'Track details exceed the 25 KiB Qortal JSON limit. Shorten the metadata before continuing.',
      );
    options.saveArtifact(row.id, artifact);
    const ref = qortalBulkCoordinate(row, initial.role, name, 'metadata');
    metadata.push({
      row,
      kind: 'metadata',
      artifact,
      input: {
        ...ref,
        bytesBase64: btoa(unescape(encodeURIComponent(artifact.json))),
        fileName: artifact.fileName,
        title: row.metadata.title,
      },
    });
  }
  await send(
    metadata,
    initial.role === 'listener' ? 'Submitting track details' : 'Publishing track details',
  );
  options.onProgress(
    initial.role === 'listener'
      ? 'Selected tracks submitted for review.'
      : 'Selected tracks added to the library.',
  );
}
