/* ============================================================
 * NodeFM Station — Bulk Import Workspace
 *
 * Role-neutral staging UI used by both Admin and Listener entry
 * points. Browser File/Blob/object-URL material lives only in the
 * in-memory transient registry; the durable batch never contains
 * it. Async analysis is epoch- and source-generation guarded so a
 * stale operation cannot mutate a replaced/removed row, survive an
 * account/scope change, or leak a preview URL.
 * ============================================================ */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isBridgeAvailable } from '../../../qortium/bridge';
import {
  addLocalStagingFiles,
  applyBulkImportExtraction,
  createBulkImportBatch,
  getBulkImportRow,
  markBulkImportRowAnalysisFailed,
  markBulkImportRowAnalyzing,
  removeBulkImportRow,
  setBulkImportMetadataField,
  setBulkImportRowCover,
  setBulkImportRowSelected,
  setBulkImportRowSource,
} from '../batchStore';
import { getBulkImportBatchSummary, getBulkImportPublicationStatus } from '../selectors';
import { publishBulkSelection } from '../publishBulkSelection';
import { upsertTrackLocally } from '../../library/services/libraryService';
import {
  PublicationProgress,
  type PublicationProgressState,
} from '../../../components/PublicationProgress';
import { mapBulkImportRoleToPublicationIntent } from '../publicationAdapter';
import type { BulkPublicationCapability, BulkPublicationIntent } from '../publicationAdapter';
import { computeMetadataContentRevision, stableContentFingerprint } from '../contentRevision';
import { sourceDescriptorsMatch } from '../sourceIdentity';
import { createQortalBulkPublicationAdapter } from '../qortalBulkPublicationAdapter';
import type { QortalBulkPublicationAdapter } from '../qortalBulkPublicationAdapter';
import { applyBulkPublicationRowResultToBatch } from '../home2PublicationReducer';
import { type BulkImportMetadataArtifact } from '../metadataExport';
import {
  clearTransientRegistry,
  createBulkImportTransientRegistry,
  deleteTransientEntry,
  getTransientEntry,
  setTransientEntry,
  transientSourceKey,
} from '../transientRegistry';
import { BULK_IMPORT_MAX_TOTAL_BYTES } from '../limits';
import { extractEmbeddedAudioMetadata } from '../services/audioMetadata';
import { resolveLocalAudioDurationMs, shouldAttemptLocalAudioDecode } from '../services/localAudio';
import { loadBulkImportBatch, saveBulkImportBatch } from '../services/bulkImportStorage';
import type {
  BulkImportBatch,
  BulkImportDurationSource,
  BulkImportMetadataField,
  BulkImportRole,
  BulkImportRow,
  EmbeddedAudioMetadata,
} from '../types';
import { BulkImportRowEditor } from './BulkImportRowEditor';
import { BulkImportSummary } from './BulkImportSummary';

type BulkImportWorkspaceProps = {
  role: BulkImportRole;
  scope: string;
  onClose?: () => void;
  showHeader?: boolean;
  actorName?: string | null;
  actorAddress?: string | null;
  stationOwnerAddress?: string | null;
};

type AnalysisEntry = { rowId: string; file: File };

/**
 * Key/remount the workspace by canonical role + scope. This makes an
 * account/scope transition a synchronous remount, so the previous
 * account's batch can never render under the new scope, even for one
 * React render.
 */
export function BulkImportWorkspace(props: BulkImportWorkspaceProps) {
  return <BulkImportWorkspaceInner key={`${props.role}:${props.scope}`} {...props} />;
}

function BulkImportWorkspaceInner({
  role,
  scope,
  onClose,
  showHeader = true,
  actorName = null,
  actorAddress = null,
  stationOwnerAddress = null,
}: BulkImportWorkspaceProps) {
  const [batch, setBatch] = useState<BulkImportBatch>(
    () => loadBulkImportBatch(role, scope) ?? createBulkImportBatch(role, scope),
  );
  const batchRef = useRef(batch);
  batchRef.current = batch;

  const workspaceEpochRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const transientRegistryRef = useRef(createBulkImportTransientRegistry());
  const livePreviewUrlsRef = useRef<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const adapterRef = useRef<QortalBulkPublicationAdapter | null>(null);
  if (adapterRef.current === null) {
    adapterRef.current = createQortalBulkPublicationAdapter({
      onAttempt: (result) => {
        const next = applyBulkPublicationRowResultToBatch(batchRef.current, result);
        if (!saveBulkImportBatch(next)) {
          throw new Error(
            'Cannot save the publication journal. Free browser storage and try again.',
          );
        }
        batchRef.current = next;
        setBatch(next);
      },
      getSource: (intent, rowId, kind) => {
        const current = batchRef.current;
        const row = getBulkImportRow(current, rowId);
        const intended = intent.rows.find((item) => item.rowId === rowId);
        if (
          current.id !== intent.batchId ||
          !row ||
          !intended ||
          row.sourceGeneration !== intended.sourceGeneration
        )
          return null;
        const entry = getTransientEntry(
          transientRegistryRef.current,
          transientSourceKey(current.id, row.id, row.sourceGeneration),
        );
        if (kind === 'audio')
          return entry?.audioFile
            ? { file: entry.audioFile, fileName: entry.audioFile.name }
            : null;
        if (kind === 'cover')
          return entry?.coverBlob
            ? {
                file: entry.coverBlob,
                fileName:
                  row.cover?.fileName ||
                  `cover-${row.id}.${entry.coverBlob.type === 'image/png' ? 'png' : entry.coverBlob.type === 'image/webp' ? 'webp' : entry.coverBlob.type === 'image/gif' ? 'gif' : 'jpg'}`,
              }
            : null;
        let artifact = metadataArtifactsRef.current[rowId];
        if (!artifact) {
          try {
            artifact = JSON.parse(
              window.sessionStorage.getItem(`nodefm.bulk.metadata:${current.id}:${rowId}`) ||
                'null',
            );
          } catch {
            return null;
          }
        }
        return artifact &&
          artifact.sourceGeneration === row.sourceGeneration &&
          artifact.metadataRevision === computeMetadataContentRevision(row.metadata) &&
          artifact.fingerprint === stableContentFingerprint(['bulk-metadata-json', artifact.json])
          ? {
              file: new Blob([artifact.json], { type: 'application/json' }),
              fileName: artifact.fileName,
            }
          : null;
      },
    });
  }
  const publicationAdapter = adapterRef.current;

  const [capability, setCapability] = useState<BulkPublicationCapability>(
    publicationAdapter.capability(),
  );
  const metadataArtifactsRef = useRef<Record<string, BulkImportMetadataArtifact>>({});
  const [publication, setPublication] = useState<PublicationProgressState | null>(null);
  const [running, setRunning] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const runningRef = useRef(false);
  const [publicationMessage, setPublicationMessage] = useState('');

  const commitBatch = useCallback((next: BulkImportBatch) => {
    batchRef.current = next;
    setBatch(next);
  }, []);

  const isCurrent = useCallback((epoch: number, rowId: string, generation: number) => {
    if (workspaceEpochRef.current !== epoch) return false;
    const row = getBulkImportRow(batchRef.current, rowId);
    return !!row && row.sourceGeneration === generation;
  }, []);

  const abortPreviousAnalysis = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const createCoverPreviewUrl = useCallback((blob: Blob) => {
    const url = URL.createObjectURL(blob);
    livePreviewUrlsRef.current.add(url);
    return url;
  }, []);

  const revokeCoverPreviewUrl = useCallback((url: string | null) => {
    if (url && livePreviewUrlsRef.current.delete(url)) {
      URL.revokeObjectURL(url);
    }
  }, []);

  const revokeAllCoverPreviewUrls = useCallback(() => {
    livePreviewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    livePreviewUrlsRef.current.clear();
  }, []);

  useEffect(() => {
    saveBulkImportBatch(batch);
  }, [batch]);

  useEffect(
    () => () => {
      workspaceEpochRef.current += 1;
      abortPreviousAnalysis();
      revokeAllCoverPreviewUrls();
      clearTransientRegistry(transientRegistryRef.current);
      publicationAdapter.dispose();
    },
    [abortPreviousAnalysis, publicationAdapter, revokeAllCoverPreviewUrls],
  );

  useEffect(() => {
    let cancelled = false;

    if (!isBridgeAvailable()) {
      setCapability(publicationAdapter.capability());
      return;
    }

    void publicationAdapter
      .detectCapability()
      .then((nextCapability) => {
        if (!cancelled) setCapability(nextCapability);
      })
      .catch(() => {
        if (!cancelled) setCapability(publicationAdapter.capability());
      });

    return () => {
      cancelled = true;
    };
  }, [publicationAdapter]);

  const buildIntent = useCallback(
    (rows: readonly BulkImportRow[]): BulkPublicationIntent => {
      const roleIntent = mapBulkImportRoleToPublicationIntent(role);
      const current = batchRef.current;

      return {
        batchId: current.id,
        role,
        scope,
        actor: {
          name: actorName?.trim() || null,
          address: actorAddress?.trim() || null,
        },
        rows: rows.map((row) => ({
          rowId: row.id,
          sourceGeneration: row.sourceGeneration,
          roleIntent,
          source: row.localSource,
          metadata: row.metadata,
          durationMs: row.durationMs,
          cover: row.cover
            ? {
                origin: row.cover.origin,
                fileName: row.cover.fileName,
                mimeType: row.cover.mimeType,
                sizeBytes: row.cover.sizeBytes,
              }
            : null,
          publication: row.publication,
        })),
      };
    },
    [actorAddress, actorName, role, scope],
  );

  const analyzeEntries = useCallback(
    async (entries: ReadonlyArray<AnalysisEntry>) => {
      const taskEpoch = workspaceEpochRef.current;
      abortPreviousAnalysis();
      const controller = new AbortController();
      abortRef.current = controller;

      for (const entry of entries) {
        const before = batchRef.current;
        const startRow = getBulkImportRow(before, entry.rowId);
        if (!startRow) continue;

        const generation = startRow.sourceGeneration;
        if (!isCurrent(taskEpoch, entry.rowId, generation)) continue;

        commitBatch(markBulkImportRowAnalyzing(before, entry.rowId));

        let embedded: EmbeddedAudioMetadata | null = null;
        let error: string | null = null;

        if (entry.file.size > BULK_IMPORT_MAX_TOTAL_BYTES) {
          error = 'File exceeds the 100 MiB staging limit.';
        } else {
          try {
            embedded = await extractEmbeddedAudioMetadata(entry.file);
          } catch (caught) {
            error = caught instanceof Error ? caught.message : 'Audio metadata could not be read.';
          }
        }

        if (!isCurrent(taskEpoch, entry.rowId, generation)) continue;

        let durationMs: number | null = null;
        let durationSource: BulkImportDurationSource = 'none';

        if (embedded?.durationMs != null && embedded.durationMs > 0) {
          durationMs = embedded.durationMs;
          durationSource = 'embedded';
        } else if (shouldAttemptLocalAudioDecode(entry.file)) {
          const localDuration = await resolveLocalAudioDurationMs(entry.file, {
            signal: controller.signal,
          });
          if (!isCurrent(taskEpoch, entry.rowId, generation)) continue;
          if (localDuration !== null && localDuration > 0) {
            durationMs = localDuration;
            durationSource = 'local';
          }
        }

        if (!isCurrent(taskEpoch, entry.rowId, generation)) continue;

        if (embedded) {
          const latest = batchRef.current;
          const currentRow = getBulkImportRow(latest, entry.rowId);
          if (!currentRow || currentRow.sourceGeneration !== generation) continue;

          let coverPreviewUrl: string | null = null;
          let coverBlob: Blob | null = null;

          if (!currentRow.cover && embedded.picture) {
            coverBlob = new Blob([embedded.picture.data], {
              type: embedded.picture.format,
            });
            coverPreviewUrl = createCoverPreviewUrl(coverBlob);
          }

          const result = applyBulkImportExtraction(latest, entry.rowId, {
            metadata: embedded,
            durationMs,
            durationSource,
            coverPreviewUrl,
          });

          if (coverPreviewUrl && result.usedCoverPreviewUrl !== coverPreviewUrl) {
            revokeCoverPreviewUrl(coverPreviewUrl);
          }

          if (coverPreviewUrl && coverBlob && result.usedCoverPreviewUrl === coverPreviewUrl) {
            const key = transientSourceKey(latest.id, entry.rowId, generation);
            const existing = getTransientEntry(transientRegistryRef.current, key);
            if (existing) {
              setTransientEntry(transientRegistryRef.current, key, {
                ...existing,
                coverBlob,
                coverPreviewUrl,
              });
            }
          }

          commitBatch(result.batch);
        } else {
          const latest = batchRef.current;
          if (!getBulkImportRow(latest, entry.rowId)) continue;

          commitBatch(
            markBulkImportRowAnalysisFailed(
              latest,
              entry.rowId,
              error ?? 'Audio metadata could not be read.',
              durationMs,
            ),
          );
        }
      }
    },
    [abortPreviousAnalysis, commitBatch, createCoverPreviewUrl, isCurrent, revokeCoverPreviewUrl],
  );

  const handleFilesSelected = useCallback(
    (files: File[]) => {
      const result = addLocalStagingFiles(batchRef.current, files);
      commitBatch(result.batch);

      for (const added of result.added) {
        const row = getBulkImportRow(result.batch, added.rowId);
        if (!row) continue;
        setTransientEntry(
          transientRegistryRef.current,
          transientSourceKey(result.batch.id, added.rowId, row.sourceGeneration),
          {
            batchId: result.batch.id,
            rowId: added.rowId,
            sourceGeneration: row.sourceGeneration,
            audioFile: added.file,
            coverBlob: null,
            coverPreviewUrl: null,
          },
        );
      }

      void analyzeEntries(result.added);
    },
    [analyzeEntries, commitBatch],
  );

  const handleSelect = useCallback(
    (rowId: string, selected: boolean) => {
      commitBatch(setBulkImportRowSelected(batchRef.current, rowId, selected));
    },
    [commitBatch],
  );

  const handleRemove = useCallback(
    (rowId: string) => {
      const current = batchRef.current;
      const row = getBulkImportRow(current, rowId);

      if (row) {
        const key = transientSourceKey(current.id, rowId, row.sourceGeneration);
        const entry = getTransientEntry(transientRegistryRef.current, key);
        if (entry?.coverPreviewUrl) revokeCoverPreviewUrl(entry.coverPreviewUrl);
        deleteTransientEntry(transientRegistryRef.current, key);
      }

      delete metadataArtifactsRef.current[rowId];
      window.sessionStorage.removeItem(`nodefm.bulk.metadata:${current.id}:${rowId}`);
      commitBatch(removeBulkImportRow(current, rowId));
    },
    [commitBatch, revokeCoverPreviewUrl],
  );

  const handleFieldChange = useCallback(
    (rowId: string, field: BulkImportMetadataField, value: string | string[]) => {
      commitBatch(setBulkImportMetadataField(batchRef.current, rowId, field, value));
    },
    [commitBatch],
  );

  const handleCoverSelected = useCallback(
    (rowId: string, file: File) => {
      const current = batchRef.current;
      const row = getBulkImportRow(current, rowId);
      if (!row) return;

      const key = transientSourceKey(current.id, rowId, row.sourceGeneration);
      const entry = getTransientEntry(transientRegistryRef.current, key);
      if (entry?.coverPreviewUrl) revokeCoverPreviewUrl(entry.coverPreviewUrl);

      const previewUrl = createCoverPreviewUrl(file);
      setTransientEntry(transientRegistryRef.current, key, {
        batchId: current.id,
        rowId,
        sourceGeneration: row.sourceGeneration,
        audioFile: entry?.audioFile ?? null,
        coverBlob: file,
        coverPreviewUrl: previewUrl,
      });

      commitBatch(
        setBulkImportRowCover(current, rowId, {
          origin: 'manual',
          fileName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          previewUrl,
        }),
      );
    },
    [commitBatch, createCoverPreviewUrl, revokeCoverPreviewUrl],
  );

  const handleCoverRemove = useCallback(
    (rowId: string) => {
      const current = batchRef.current;
      const row = getBulkImportRow(current, rowId);
      if (!row) return;

      const key = transientSourceKey(current.id, rowId, row.sourceGeneration);
      const entry = getTransientEntry(transientRegistryRef.current, key);
      if (entry?.coverPreviewUrl) revokeCoverPreviewUrl(entry.coverPreviewUrl);
      if (entry) {
        setTransientEntry(transientRegistryRef.current, key, {
          ...entry,
          coverBlob: null,
          coverPreviewUrl: null,
        });
      }

      commitBatch(setBulkImportRowCover(current, rowId, null));
    },
    [commitBatch, revokeCoverPreviewUrl],
  );

  const handleSourceSelected = useCallback(
    (rowId: string, file: File) => {
      const current = batchRef.current;
      const row = getBulkImportRow(current, rowId);
      if (!row) return;

      const candidate = {
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      };
      const isRebind = !row.audioSourceAvailable;

      if (isRebind && !sourceDescriptorsMatch(row.localSource, candidate)) {
        const previousName = row.localSource?.fileName ?? 'the previously staged file';
        const confirmed =
          typeof window !== 'undefined' && typeof window.confirm === 'function'
            ? window.confirm(
                `"${file.name}" does not match ${previousName}. Replace this row with the new audio?`,
              )
            : true;

        if (!confirmed) return;
      }

      const oldKey = transientSourceKey(current.id, rowId, row.sourceGeneration);
      const oldEntry = getTransientEntry(transientRegistryRef.current, oldKey);
      const manualCover = row.cover?.origin === 'manual' ? oldEntry : undefined;

      if (row.cover?.origin === 'embedded' && row.cover.previewUrl) {
        revokeCoverPreviewUrl(row.cover.previewUrl);
      }

      const next = setBulkImportRowSource(current, rowId, candidate);
      commitBatch(next);

      const nextRow = getBulkImportRow(next, rowId);
      if (nextRow) {
        const nextKey = transientSourceKey(next.id, rowId, nextRow.sourceGeneration);
        setTransientEntry(transientRegistryRef.current, nextKey, {
          batchId: next.id,
          rowId,
          sourceGeneration: nextRow.sourceGeneration,
          audioFile: file,
          coverBlob: manualCover?.coverBlob ?? null,
          coverPreviewUrl: manualCover?.coverPreviewUrl ?? null,
        });

        if (oldKey !== nextKey) {
          deleteTransientEntry(transientRegistryRef.current, oldKey);
        }
      }

      void analyzeEntries([{ rowId, file }]);
    },
    [analyzeEntries, commitBatch, revokeCoverPreviewUrl],
  );

  const handleClearBatch = useCallback(() => {
    workspaceEpochRef.current += 1;
    abortPreviousAnalysis();
    revokeAllCoverPreviewUrls();
    clearTransientRegistry(transientRegistryRef.current);
    publicationAdapter.dispose();
    for (const row of batchRef.current.rows)
      window.sessionStorage.removeItem(`nodefm.bulk.metadata:${batchRef.current.id}:${row.id}`);
    metadataArtifactsRef.current = {};
    setPublicationMessage('');
    commitBatch(createBulkImportBatch(role, scope));
  }, [
    abortPreviousAnalysis,
    commitBatch,
    publicationAdapter,
    revokeAllCoverPreviewUrls,
    role,
    scope,
  ]);

  const handlePublishSelected = async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    const epoch = workspaceEpochRef.current;
    const selected = batchRef.current.rows.filter((row) => row.selected);
    setPublication({
      phase: 'publishing',
      rows: selected.map((row) => ({ id: row.id, label: row.metadata.title, status: 'active' })),
    });
    try {
      await publishBulkSelection({
        getBatch: () => batchRef.current,
        commit: (next) => {
          if (!saveBulkImportBatch(next))
            throw new Error(
              'Cannot save publication progress. Free browser storage and try again.',
            );
          commitBatch(next);
        },
        actorName: actorName ?? '',
        actorAddress: actorAddress ?? '',
        stationOwnerAddress: stationOwnerAddress ?? undefined,
        getSource: (row, kind) => {
          const entry = getTransientEntry(
            transientRegistryRef.current,
            transientSourceKey(batchRef.current.id, row.id, row.sourceGeneration),
          );
          if (kind === 'audio')
            return entry?.audioFile
              ? { file: entry.audioFile, fileName: entry.audioFile.name }
              : null;
          const file = entry?.coverBlob;
          return file
            ? {
                file,
                fileName:
                  row.cover?.fileName ||
                  `cover-${row.id}.${file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : file.type === 'image/gif' ? 'gif' : 'jpg'}`,
              }
            : null;
        },
        saveArtifact: (id, artifact) => {
          window.sessionStorage.setItem(
            `nodefm.bulk.metadata:${batchRef.current.id}:${id}`,
            JSON.stringify(artifact),
          );
          metadataArtifactsRef.current[id] = artifact;
        },
        isCurrent: () => workspaceEpochRef.current === epoch,
        onTrack: upsertTrackLocally,
        onProgress: setPublicationMessage,
      });
      setPublication((current) =>
        current
          ? {
              ...current,
              phase: 'success',
              rows: current.rows.map((row) => ({ ...row, status: 'succeeded' })),
            }
          : current,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Publication failed.';
      setPublicationMessage(message);
      setPublication((current) =>
        current
          ? {
              ...current,
              phase: 'failed',
              error: message,
              rows: current.rows.map((row) => ({
                ...row,
                status:
                  getBulkImportPublicationStatus(
                    batchRef.current.rows.find((item) => item.id === row.id)!,
                  ) === 'complete'
                    ? 'succeeded'
                    : 'failed',
              })),
            }
          : current,
      );
    } finally {
      runningRef.current = false;
      setRunning(false);
    }
  };

  const summary = useMemo(() => getBulkImportBatchSummary(batch), [batch]);
  const selectedRows = batch.rows.filter((row) => row.selected);
  const allSelectedComplete =
    selectedRows.length > 0 &&
    selectedRows.every((row) => getBulkImportPublicationStatus(row) === 'complete');
  const hasPending = batch.rows.some((row) =>
    ['audio', 'cover', 'metadata'].some(
      (kind) => row.publication[kind as 'audio' | 'cover' | 'metadata'].status === 'unknown',
    ),
  );
  const canPublish =
    summary.isPublicationReady &&
    capability.status === 'available' &&
    !running &&
    !verifying &&
    !allSelectedComplete;
  const finalLabel = allSelectedComplete
    ? role === 'admin'
      ? 'Selected tracks published'
      : 'Selected tracks submitted'
    : role === 'admin'
      ? 'Publish selected'
      : 'Submit selected';

  if (!scope.trim()) {
    return (
      <div className="bulk-import__empty">
        A Qortal identity is required to stage bulk music imports.
      </div>
    );
  }

  const handleReconcile = async () => {
    if (runningRef.current || verifying) return;
    const epoch = workspaceEpochRef.current;
    setVerifying(true);
    setPublicationMessage('Checking pending publications…');
    try {
      const result = await publicationAdapter.reconcileBatch(buildIntent(batchRef.current.rows));
      if (workspaceEpochRef.current !== epoch) return;
      for (const row of result.rows)
        if (row.steps.length) {
          const next = applyBulkPublicationRowResultToBatch(batchRef.current, row);
          if (!saveBulkImportBatch(next))
            throw new Error('Cannot save recovered publication progress.');
          commitBatch(next);
        }
      setPublicationMessage(
        result.rows.some((row) => row.steps.length)
          ? 'Confirmed resources were recovered. Continue to publish the remaining steps.'
          : 'Still waiting for confirmation. Nothing was republished.',
      );
    } catch (error) {
      if (workspaceEpochRef.current === epoch)
        setPublicationMessage(error instanceof Error ? error.message : 'Verification unavailable.');
    } finally {
      if (workspaceEpochRef.current === epoch) setVerifying(false);
    }
  };

  return (
    <div className="bulk-import">
      {showHeader ? (
        <header className="bulk-import__header">
          <div>
            <h2 className="bulk-import__title">
              {role === 'admin' ? 'Bulk Import' : 'Bulk Submit Music'}
            </h2>
            <p className="bulk-import__hint">
              Select up to 15 local audio files, review their metadata, then publish audio, optional
              cover and metadata through Qortal Hub.
            </p>
          </div>
          <div className="bulk-import__header-actions">
            {onClose ? (
              <button className="button button--secondary" type="button" onClick={onClose}>
                Close
              </button>
            ) : null}
          </div>
        </header>
      ) : null}

      {publication && (
        <PublicationProgress
          title={
            running
              ? role === 'listener'
                ? 'Submitting selected tracks'
                : 'Publishing selected tracks'
              : publication.phase === 'success'
                ? role === 'listener'
                  ? 'Tracks submitted'
                  : 'Tracks published'
                : 'Publication paused'
          }
          state={publication}
          successMessage={publicationMessage}
          progressMessage={publicationMessage}
          onClose={() => {
            if (!runningRef.current) setPublication(null);
          }}
          onSuccess={() => setPublication(null)}
        />
      )}
      {publicationMessage && <p role="status">{publicationMessage}</p>}
      <fieldset disabled={running || verifying} className="bulk-import__workspace-fields">
        <div className="bulk-import__controls">
          <button
            className="button button--primary"
            type="button"
            onClick={() => fileInputRef.current?.click()}
          >
            Add audio files
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            multiple
            hidden
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []).filter((file) => file.size > 0);
              handleFilesSelected(files);
              event.target.value = '';
            }}
          />
          <button className="button button--secondary" type="button" onClick={handleClearBatch}>
            Clear Batch
          </button>
          {hasPending && (
            <button
              className="button button--secondary"
              type="button"
              onClick={() => void handleReconcile()}
            >
              Check pending publications
            </button>
          )}
        </div>

        <BulkImportSummary
          summary={summary}
          capabilityMessage={capability.message}
          capabilityStatus={capability.status}
        />

        <div className="bulk-import__rows">
          {batch.rows.length === 0 ? (
            <p className="bulk-import__empty">No staged tracks yet. Add audio files to begin.</p>
          ) : (
            batch.rows.map((row) => (
              <BulkImportRowEditor
                key={row.id}
                row={row}
                onSelect={(selected) => handleSelect(row.id, selected)}
                onRemove={() => handleRemove(row.id)}
                onFieldChange={(field, value) => handleFieldChange(row.id, field, value)}
                onCoverSelected={(file) => handleCoverSelected(row.id, file)}
                onCoverRemove={() => handleCoverRemove(row.id)}
                onReselectSource={(file) => handleSourceSelected(row.id, file)}
              />
            ))
          )}
        </div>

        {batch.rows.length > 0 && (
          <ul className="bulk-import__publication-state-list" aria-label="Publication progress">
            {batch.rows.map((row) => (
              <li key={row.id}>
                <strong>{row.metadata.title || row.localSource?.fileName}</strong> —{' '}
                {getBulkImportPublicationStatus(row) === 'complete'
                  ? role === 'listener'
                    ? 'Submitted for review'
                    : 'Added to library'
                  : getBulkImportPublicationStatus(row) === 'unknown'
                    ? 'Awaiting confirmation'
                    : getBulkImportPublicationStatus(row) === 'partial'
                      ? 'Partly published — ready to continue'
                      : 'Ready for publication'}
              </li>
            ))}
          </ul>
        )}

        <div className="bulk-import__blockers">
          {summary.publicationBlockers.map((blocker) => (
            <p key={blocker} className="bulk-import__blocker">
              {blocker}
            </p>
          ))}
        </div>

        <footer className="bulk-import__footer">
          <button
            className="button button--primary"
            type="button"
            disabled={!canPublish}
            onClick={() => void handlePublishSelected()}
          >
            {finalLabel}
          </button>
          {!canPublish && !allSelectedComplete ? (
            <p className="bulk-import__footer-note">
              Complete the selected track details and connect to Qortal Hub before publishing.
            </p>
          ) : null}
        </footer>
      </fieldset>
    </div>
  );
}
