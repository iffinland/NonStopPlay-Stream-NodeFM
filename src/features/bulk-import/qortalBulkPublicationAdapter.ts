/** Qortal bulk publication: local files, revision-bound journals, and exact read-back reconciliation. */
import {
  publishResource,
  getQdnPublishCapability,
  ensureQdnResourceReady,
  getQdnResourceUrl,
  QdnPublicationUnknownError,
  type PublishInput,
} from '../../qortium/qdn';
import { requireAccountWrite } from '../../qortium/accountWriteGate';
import { qortalBulkCoordinate } from './qortalBulkCoordinates';
import { generateId } from '../../utils/id';
import {
  getRequiredPublicationContentRevision,
  isPublishedPublicationStep,
  isUnknownPublicationStep,
} from './publicationJournal';
import type {
  BulkImportLocalSourceDescriptor,
  BulkImportPublicationResourceIdentity,
} from './types';
import type {
  BulkPublicationAdapter,
  BulkPublicationIntent,
  BulkPublicationRowIntent,
  BulkPublicationResourceStepKind,
  BulkPublicationSourceDescriptor,
  BulkPublicationAcquisitionResult,
  BulkPublicationRowResult,
  BulkPublicationBatchResult,
  BulkPublicationStepResult,
  BulkPublicationCapability,
  BulkPublicationUnknownStepResult,
} from './publicationAdapter';

export class QortalReconciliationRequiredError extends Error {
  constructor(readonly attemptId: string) {
    super(`Publication ${attemptId} has an unknown outcome. Verify it before retrying.`);
  }
}
export type QortalSource = { file: Blob; fileName: string };
type Kind = BulkPublicationResourceStepKind;
type Handle = QortalSource & {
  batchId: string;
  rowId: string;
  sourceGeneration: number;
  kind: Kind;
  handleId: string;
  consumed: boolean;
  contentRevision: string;
};
type Acquisition = BulkPublicationAcquisitionResult & { canceled: boolean };
export type QortalBulkPublicationAdapter = BulkPublicationAdapter & {
  detectCapability: () => Promise<BulkPublicationCapability>;
  acquireRowSource: (intent: BulkPublicationIntent, rowId: string) => Promise<Acquisition>;
  acquireCoverSource: (intent: BulkPublicationIntent, rowId: string) => Promise<Acquisition>;
  acquireMetadataSource: (
    intent: BulkPublicationIntent,
    rowId: string,
    expected: BulkImportLocalSourceDescriptor,
  ) => Promise<Acquisition>;
  publishRow: (
    intent: BulkPublicationIntent,
    source: BulkPublicationSourceDescriptor,
  ) => Promise<BulkPublicationRowResult>;
  publishCover: (
    intent: BulkPublicationIntent,
    source: BulkPublicationSourceDescriptor,
  ) => Promise<BulkPublicationRowResult>;
  publishMetadata: (
    intent: BulkPublicationIntent,
    source: BulkPublicationSourceDescriptor,
    expected?: BulkImportLocalSourceDescriptor,
  ) => Promise<BulkPublicationRowResult>;
  dispose: () => void;
};
function revision(row: BulkPublicationRowIntent, kind: Kind): string {
  const result = getRequiredPublicationContentRevision(kind, {
    sourceGeneration: row.sourceGeneration,
    source: row.source,
    metadata: row.metadata,
    cover: row.cover ? { ...row.cover, previewUrl: null } : null,
  });
  if (!result) throw new Error('The current source has no publishable content revision.');
  return result;
}
function target(
  intent: BulkPublicationIntent,
  row: BulkPublicationRowIntent,
  kind: Kind,
): BulkImportPublicationResourceIdentity & { name: string; identifier: string } {
  if (!intent.actor.name || !intent.actor.address)
    throw new Error('A connected account and registered publishing name are required.');
  return qortalBulkCoordinate(
    { id: row.rowId, publication: row.publication },
    intent.role,
    intent.actor.name,
    kind,
  );
}
function assertIntent(intent: BulkPublicationIntent): void {
  const expected = intent.role === 'admin' ? 'track' : 'submission';
  if (intent.rows.some((row) => row.roleIntent !== expected))
    throw new Error('The batch publication role does not match its rows.');
}
/** Full streamed byte comparison, without retaining another audio-sized buffer. */
export async function verifyPublishedBytes(
  ref: { service: string; name: string; identifier?: string },
  file: Blob,
): Promise<boolean> {
  await ensureQdnResourceReady(ref);
  const response = await fetch(await getQdnResourceUrl(ref));
  if (!response.ok || !response.body) return false;
  const reader = response.body.getReader();
  let offset = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (offset + chunk.value.byteLength > file.size) return false;
      const expected = new Uint8Array(
        await file.slice(offset, offset + chunk.value.byteLength).arrayBuffer(),
      );
      if (expected.some((value, index) => value !== chunk.value[index])) return false;
      offset += chunk.value.byteLength;
    }
    return offset === file.size;
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}
export function createQortalBulkPublicationAdapter(options: {
  getSource: (
    intent: BulkPublicationIntent,
    rowId: string,
    kind: Kind,
  ) => Promise<QortalSource | null> | QortalSource | null;
  onAttempt?: (result: BulkPublicationRowResult) => void;
  publish?: typeof publishResource;
  verify?: typeof verifyPublishedBytes;
  accountGate?: typeof requireAccountWrite;
  capability?: typeof getQdnPublishCapability;
}): QortalBulkPublicationAdapter {
  const handles = new Map<string, Handle>();
  const uncertain = new Map<string, QortalSource>();
  let capability: BulkPublicationCapability = {
    status: 'unavailable',
    reason: 'qortal-unavailable',
    message: 'Checking Qortal publication support…',
  };
  let epoch = 0;
  const publish = options.publish ?? publishResource;
  const gate = options.accountGate ?? requireAccountWrite;
  async function detectCapability(): Promise<BulkPublicationCapability> {
    const value = await (options.capability ?? getQdnPublishCapability)();
    capability = value.publish
      ? { status: 'available', message: 'Qortal file publication is available.' }
      : {
          status: 'unavailable',
          reason: 'qortal-unavailable',
          message: 'Open this app in Qortal Hub with publication support.',
        };
    return capability;
  }
  async function acquire(
    intent: BulkPublicationIntent,
    rowId: string,
    kind: Kind,
    expected?: BulkImportLocalSourceDescriptor,
  ): Promise<Acquisition> {
    assertIntent(intent);
    const row = intent.rows.find((item) => item.rowId === rowId);
    if (!row) throw new Error('The staged row no longer exists.');
    const file = await options.getSource(intent, rowId, kind);
    const expectation = kind === 'audio' ? row.source : kind === 'cover' ? row.cover : expected;
    if (
      !file ||
      !expectation ||
      file.file.size <= 0 ||
      (expectation.sizeBytes !== null && file.file.size !== expectation.sizeBytes) ||
      (expectation.fileName && file.fileName !== expectation.fileName) ||
      (expectation.mimeType && file.file.type && expectation.mimeType !== file.file.type)
    ) {
      return {
        batchId: intent.batchId,
        sources: [],
        failedRows: [
          {
            batchId: intent.batchId,
            rowId,
            sourceGeneration: row.sourceGeneration,
            error: {
              code: 'SOURCE_UNAVAILABLE',
              message: 'Reattach the current local file before publishing.',
              retryable: false,
            },
          },
        ],
        canceled: false,
      };
    }
    const handle: Handle = {
      ...file,
      batchId: intent.batchId,
      rowId,
      sourceGeneration: row.sourceGeneration,
      kind,
      handleId: generateId(),
      consumed: false,
      contentRevision: revision(row, kind),
    };
    handles.set(handle.handleId, handle);
    return {
      batchId: intent.batchId,
      sources: [
        {
          rowId,
          sourceGeneration: row.sourceGeneration,
          handleId: handle.handleId,
          fileName: file.fileName,
          mimeType: file.file.type,
          sizeBytes: file.file.size,
          available: true,
        },
      ],
      failedRows: [],
      canceled: false,
    };
  }
  async function publishStep(
    intent: BulkPublicationIntent,
    source: BulkPublicationSourceDescriptor,
    kind: Kind,
    expected?: BulkImportLocalSourceDescriptor,
  ): Promise<BulkPublicationRowResult> {
    assertIntent(intent);
    const row = intent.rows.find((item) => item.rowId === source.rowId);
    if (!row || row.sourceGeneration !== source.sourceGeneration)
      throw new Error('Stale publication source.');
    const resource = target(intent, row, kind);
    const contentRevision = revision(row, kind);
    const base = {
      batchId: intent.batchId,
      rowId: row.rowId,
      sourceGeneration: row.sourceGeneration,
    };
    const previous = row.publication[kind];
    if (
      isPublishedPublicationStep(previous) &&
      previous.contentRevision === contentRevision &&
      previous.intent.name === resource.name &&
      previous.intent.identifier === resource.identifier
    )
      return {
        ...base,
        status: 'no-op',
        steps: [
          {
            ...base,
            status: 'skipped',
            reason: 'already-confirmed',
            step: kind,
            intent: previous.intent,
            contentRevision,
            confirmed: previous.confirmed,
            confirmedAt: previous.confirmedAt,
          },
        ],
      };
    if (isUnknownPublicationStep(previous))
      throw new QortalReconciliationRequiredError(previous.attempt.attemptId);
    const handle = handles.get(source.handleId);
    if (
      !handle ||
      handle.consumed ||
      handle.batchId !== intent.batchId ||
      handle.rowId !== row.rowId ||
      handle.sourceGeneration !== row.sourceGeneration ||
      handle.kind !== kind ||
      handle.contentRevision !== contentRevision
    )
      throw new Error('The local publish handle expired. Prepare this source again.');
    if (
      handle.file.size !== source.sizeBytes ||
      handle.fileName !== source.fileName ||
      handle.file.type !== source.mimeType ||
      (expected &&
        (expected.sizeBytes !== handle.file.size || expected.fileName !== handle.fileName))
    )
      throw new Error('The source no longer matches the current draft.');
    const dependencies: Kind[] =
      kind === 'audio'
        ? []
        : kind === 'cover'
          ? ['audio']
          : row.cover
            ? ['audio', 'cover']
            : ['audio'];
    for (const dependency of dependencies) {
      const step = row.publication[dependency];
      if (!isPublishedPublicationStep(step) || step.contentRevision !== revision(row, dependency))
        throw new Error('Publish the current audio and cover before metadata.');
    }
    if (!Number.isFinite(row.durationMs) || !row.durationMs || row.durationMs <= 0)
      throw new Error('A verified positive audio duration is required before publishing.');
    const attemptId = generateId();
    const startedEpoch = epoch;
    // Gate failures happen before dispatch and are safe to correct/retry.
    await gate('PUBLISH_QDN_RESOURCE', intent.actor.address!);
    if (epoch !== startedEpoch)
      throw new Error('This workspace has closed. Nothing was published.');
    const input: PublishInput = {
      service: resource.service,
      name: resource.name,
      identifier: resource.identifier!,
      file: handle.file,
      fileName: handle.fileName,
      title: row.metadata.title,
    };
    // Persist uncertainty before handing control to Hub. A closed frame cannot turn
    // an unacknowledged broadcast into a new attempt after reload.
    const pending: BulkPublicationUnknownStepResult = {
      ...base,
      status: 'unknown',
      step: kind,
      intent: resource,
      contentRevision,
      attemptId,
    };
    options.onAttempt?.({ ...base, status: 'unknown', steps: [pending] });
    try {
      const result = await publish(input);
      if (
        !result.accepted ||
        !result.transactionSignature ||
        result.resource.name !== resource.name ||
        result.resource.service !== resource.service ||
        result.resource.identifier !== resource.identifier
      )
        throw new QdnPublicationUnknownError({
          service: resource.service,
          name: resource.name,
          identifier: resource.identifier,
        });
      handle.consumed = true;
      return {
        ...base,
        status: kind === 'metadata' ? 'complete' : 'partial',
        steps: [
          {
            ...base,
            status: 'published',
            step: kind,
            intent: resource,
            contentRevision,
            attemptId,
            reference: {
              service: resource.service,
              name: resource.name,
              identifier: resource.identifier!,
            },
            confirmedContentRevision: contentRevision,
            transactionSignature: result.transactionSignature,
            confirmedAt: new Date().toISOString(),
          },
        ],
      };
    } catch (error) {
      if (error instanceof QdnPublicationUnknownError) {
        handle.consumed = true;
        uncertain.set(attemptId, { file: handle.file, fileName: handle.fileName });
        return {
          ...base,
          status: 'unknown',
          steps: [
            {
              ...base,
              status: 'unknown',
              step: kind,
              intent: resource,
              contentRevision,
              attemptId,
            },
          ],
        };
      }
      return {
        ...base,
        status: 'failed',
        steps: [
          {
            ...base,
            status: 'failed',
            step: kind,
            intent: resource,
            contentRevision,
            attemptId,
            error: {
              code: 'PUBLISH_FAILED',
              message: error instanceof Error ? error.message : 'Qortal publication failed.',
              retryable: true,
            },
          },
        ],
      };
    }
  }
  async function acquirePublicationSources(
    intent: BulkPublicationIntent,
  ): Promise<BulkPublicationAcquisitionResult> {
    const result: BulkPublicationAcquisitionResult = {
      batchId: intent.batchId,
      sources: [],
      failedRows: [],
    };
    for (const row of intent.rows) {
      const acquired = await acquire(intent, row.rowId, 'audio');
      result.sources.push(...acquired.sources);
      result.failedRows.push(...acquired.failedRows);
    }
    return result;
  }
  function batchResult(
    intent: BulkPublicationIntent,
    rows: BulkPublicationRowResult[],
  ): BulkPublicationBatchResult {
    return {
      batchId: intent.batchId,
      rows,
      publishedCount: rows.filter((row) => row.status === 'complete' || row.status === 'partial')
        .length,
      failedCount: rows.filter((row) => row.status === 'failed').length,
      unknownCount: rows.filter((row) => row.status === 'unknown').length,
    };
  }
  async function reconcileBatch(
    intent: BulkPublicationIntent,
  ): Promise<BulkPublicationBatchResult> {
    assertIntent(intent);
    const rows: BulkPublicationRowResult[] = [];
    for (const row of intent.rows) {
      const steps: BulkPublicationStepResult[] = [];
      for (const kind of ['audio', 'cover', 'metadata'] as const) {
        const step = row.publication[kind];
        if (!isUnknownPublicationStep(step)) continue;
        if (step.contentRevision !== revision(row, kind)) continue;
        const expected = target(intent, row, kind);
        if (
          step.intent.name !== expected.name ||
          step.intent.identifier !== expected.identifier ||
          step.intent.service !== expected.service
        )
          continue;
        if (!step.intent.name) continue;
        const local =
          uncertain.get(step.attempt.attemptId) ??
          (await options.getSource(intent, row.rowId, kind));
        if (!local) continue;
        const ref = {
          service: step.intent.service,
          name: step.intent.name,
          identifier: step.intent.identifier ?? undefined,
        };
        let verified = false;
        try {
          verified = await (options.verify ?? verifyPublishedBytes)(ref, local.file);
        } catch {
          /* Unavailable is still unknown, never success or permission to repeat. */
        }
        if (verified)
          steps.push({
            batchId: intent.batchId,
            rowId: row.rowId,
            sourceGeneration: row.sourceGeneration,
            status: 'published',
            step: kind,
            intent: step.intent,
            contentRevision: step.contentRevision,
            attemptId: step.attempt.attemptId,
            reference: ref,
            confirmedContentRevision: step.contentRevision,
            transactionSignature: null,
            confirmedAt: new Date().toISOString(),
          });
      }
      rows.push({
        batchId: intent.batchId,
        rowId: row.rowId,
        sourceGeneration: row.sourceGeneration,
        status: steps.length ? 'partial' : 'unknown',
        steps,
      });
    }
    return batchResult(intent, rows);
  }
  return {
    capability: () => capability,
    detectCapability,
    acquirePublicationSources,
    acquireRowSource: (i, r) => acquire(i, r, 'audio'),
    acquireCoverSource: (i, r) => acquire(i, r, 'cover'),
    acquireMetadataSource: (i, r, e) => acquire(i, r, 'metadata', e),
    publishRow: (i, s) => publishStep(i, s, 'audio'),
    publishCover: (i, s) => publishStep(i, s, 'cover'),
    publishMetadata: (i, s, e) => publishStep(i, s, 'metadata', e),
    publishBatch: async (i, sources) => {
      const rows: BulkPublicationRowResult[] = [];
      for (const source of sources) rows.push(await publishStep(i, source, 'audio'));
      return batchResult(i, rows);
    },
    reconcileBatch,
    dispose: () => {
      epoch++;
      handles.clear();
      uncertain.clear();
    },
  };
}
