import { describe, expect, it, vi } from 'vitest';
import { publishBulkSelection, type BulkSelectionOptions } from './publishBulkSelection';
import { createBulkImportBatch, createBulkImportRow } from './batchStore';
import { getBulkImportPublicationStatus } from './selectors';
import {
  deserializeSubmissionFromQdn,
  validateSubmissionStructuralIntegrity,
} from '../listener-submissions/services/submissionService';
import {
  QdnPublishPreflightError,
  type PublishInput,
  type MultiplePublishResult,
} from '../../qortium/qdn';
import {
  createPublishedPublicationStep,
  getRequiredPublicationContentRevision,
} from './publicationJournal';

function setup(role: 'listener' | 'admin' = 'listener', count = 3, covers = true) {
  let batch = createBulkImportBatch(role, 'Q-owner');
  const audio = new File(['audio'], 'song.mp3', { type: 'audio/mpeg' }),
    cover = new File(['cover'], 'cover.png', { type: 'image/png' });
  batch.rows = Array.from({ length: count }, (_, i) => ({
    ...createBulkImportRow({
      id: `row-${i}`,
      fileName: audio.name,
      mimeType: audio.type,
      sizeBytes: audio.size,
    }),
    durationMs: 1000,
    durationSource: 'embedded' as const,
    metadata: {
      title: `Song ${i}`,
      artist: 'Artist',
      album: '',
      releaseDate: '',
      genres: [],
      tags: [],
    },
    cover: covers
      ? {
          origin: 'manual' as const,
          fileName: cover.name,
          mimeType: cover.type,
          sizeBytes: cover.size,
          previewUrl: null,
        }
      : null,
    coverSourceAvailable: covers,
  }));
  const requests: PublishInput[][] = [];
  const publish = vi.fn(
    async (resources: readonly PublishInput[]): Promise<MultiplePublishResult> => {
      requests.push([...resources]);
      for (const resource of resources) {
        const row = batch.rows.find((r) => resource.identifier?.endsWith(r.id))!;
        const kind =
          resource.service === 'AUDIO'
            ? 'audio'
            : resource.service === 'IMAGE'
              ? 'cover'
              : 'metadata';
        expect(row.publication[kind].status).toBe('unknown');
      }
      return {
        accepted: true,
        action: 'PUBLISH_MULTIPLE_QDN_RESOURCES',
        published: resources.map((input, index) => ({
          resource: { service: input.service, name: input.name, identifier: input.identifier! },
          transactionSignature: `sig-${index}`,
          result: {},
        })),
        failures: [],
      };
    },
  );
  const options: BulkSelectionOptions = {
    getBatch: () => batch,
    commit: (next) => {
      batch = next;
    },
    actorName: 'Owner',
    actorAddress: 'Q-owner',
    getSource: (_row, kind) =>
      kind === 'audio'
        ? { file: audio, fileName: audio.name }
        : { file: cover, fileName: cover.name },
    saveArtifact: vi.fn(),
    onProgress: vi.fn(),
    onTrack: vi.fn(),
    publish,
    gate: vi.fn(async () => ({ address: 'Q-owner' })),
  };
  return { options, requests, publish, batch: () => batch };
}
describe('one-action bulk publication', () => {
  it('continues RC.4 confirmed media without uploading it again and keeps old submissions readable', async () => {
    const s = setup('listener', 1, true);
    const row = s.batch().rows[0];
    for (const kind of ['audio', 'cover'] as const) {
      const intent = {
        kind,
        service: kind === 'audio' ? 'AUDIO' : 'IMAGE',
        name: 'Owner',
        identifier: `nodefm-${kind}-${row.id}`,
      };
      row.publication[kind] = createPublishedPublicationStep({
        intent,
        confirmed: intent,
        contentRevision: getRequiredPublicationContentRevision(kind, {
          sourceGeneration: row.sourceGeneration,
          source: row.localSource,
          metadata: row.metadata,
          cover: row.cover,
        })!,
        attemptId: 'previous',
        confirmedAt: '2026-11-22T00:00:00.000Z',
        transactionSignature: 'sig-rc4',
      });
    }
    await publishBulkSelection(s.options);
    expect(s.requests.map((resources) => resources.map((resource) => resource.service))).toEqual([
      ['JSON'],
    ]);
    const submission = deserializeSubmissionFromQdn(
      JSON.parse(atob(s.requests[0][0].bytesBase64!)),
    )!;
    expect(
      validateSubmissionStructuralIntegrity(submission, 'Owner', s.requests[0][0].identifier!),
    ).toEqual({ ok: true });
    expect(
      validateSubmissionStructuralIntegrity(
        { ...submission, audio: { ...submission.audio, identifier: 'nodefm-audio-someone-else' } },
        'Owner',
        s.requests[0][0].identifier!,
      ).ok,
    ).toBe(false);
  });
  it('publishes three tracks and covers in one approval and creates discoverable listener submissions', async () => {
    const s = setup();
    await publishBulkSelection(s.options);
    expect(s.requests.map((r) => r.length)).toEqual([9]);
    for (const input of s.requests[0].filter((resource) => resource.service === 'JSON')) {
      const submission = deserializeSubmissionFromQdn(JSON.parse(atob(input.bytesBase64!)))!;
      expect(submission).toBeTruthy();
      expect(validateSubmissionStructuralIntegrity(submission, 'Owner', input.identifier!)).toEqual(
        { ok: true },
      );
      expect(submission.audio.identifier).toBe(
        `nodefm-submission-audio-${submission.submissionId}`,
      );
    }
    expect(s.batch().rows.map(getBulkImportPublicationStatus)).toEqual([
      'complete',
      'complete',
      'complete',
    ]);
    await publishBulkSelection(s.options);
    expect(s.publish).toHaveBeenCalledTimes(1);
  });
  it('updates the admin library only after canonical track metadata is confirmed', async () => {
    const s = setup('admin', 2, false);
    await publishBulkSelection(s.options);
    expect(s.requests.map((r) => r.length)).toEqual([4]);
    expect(s.options.onTrack).toHaveBeenCalledTimes(2);
    expect(s.options.onTrack).toHaveBeenCalledWith(
      expect.objectContaining({ trackId: 'row-0', title: 'Song 0', durationMs: 1000 }),
    );
  });
  it('stops after a partial media result and never repeats an unknown write', async () => {
    const s = setup('listener', 2, false);
    s.publish.mockImplementationOnce(async (resources) => ({
      accepted: true,
      action: 'PUBLISH_MULTIPLE_QDN_RESOURCES',
      published: [
        {
          resource: { service: 'AUDIO', name: 'Owner', identifier: resources[0].identifier! },
          transactionSignature: 'sig',
          result: {},
        },
      ],
      failures: [
        {
          resource: { service: 'AUDIO', name: 'Owner', identifier: resources[1].identifier! },
          error: 'Network response lost',
          outcome: 'unknown',
        },
      ],
    }));
    await expect(publishBulkSelection(s.options)).rejects.toThrow(/not confirmed/);
    expect(s.batch().rows[0].publication.audio.status).toBe('published');
    expect(s.batch().rows[1].publication.audio.status).toBe('unknown');
    await expect(publishBulkSelection(s.options)).rejects.toThrow(/verification/);
    expect(s.publish).toHaveBeenCalledTimes(1);
    expect(s.options.onTrack).not.toHaveBeenCalled();
  });
  it('does not dispatch when saving the pre-publication journal fails', async () => {
    const s = setup();
    s.options.commit = () => {
      throw new Error('Storage full');
    };
    await expect(publishBulkSelection(s.options)).rejects.toThrow('Storage full');
    expect(s.publish).not.toHaveBeenCalled();
    expect(s.batch().rows[0].publication.audio.status).toBe('not-started');
  });
  it('keeps a refused preflight separate from an uncertain broadcast', async () => {
    const s = setup('listener', 1, false);
    s.publish.mockRejectedValueOnce(
      new QdnPublishPreflightError('The account does not own this name.'),
    );
    await expect(publishBulkSelection(s.options)).rejects.toThrow(/does not own/);
    expect(s.batch().rows[0].publication.audio.status).toBe('failed');
    await publishBulkSelection(s.options);
    expect(s.batch().rows.map(getBulkImportPublicationStatus)).toEqual(['complete']);
    expect(s.publish).toHaveBeenCalledTimes(2);
  });
  it('stops after account approval if the workspace changed', async () => {
    const s = setup();
    let active = true;
    s.options.isCurrent = () => active;
    s.options.gate = vi.fn(async () => {
      active = false;
      return { address: 'Q-owner' };
    });
    await expect(publishBulkSelection(s.options)).rejects.toThrow(/workspace changed/);
    expect(s.publish).not.toHaveBeenCalled();
  });
  it('prepares a larger selection in one batch with media ordered before metadata', async () => {
    const s = setup('admin', 12, false);
    await publishBulkSelection(s.options);
    expect(s.requests.map((r) => r.length)).toEqual([24]);
    expect(s.requests[0].map((r) => r.service)).toEqual([
      ...Array(12).fill('AUDIO'),
      ...Array(12).fill('JSON'),
    ]);
  });
});

it('does not add a station track when metadata is signed but its media is unconfirmed', async () => {
  const s = setup('admin', 1, false);
  s.publish.mockImplementationOnce(async (resources) => ({
    accepted: true,
    action: 'PUBLISH_MULTIPLE_QDN_RESOURCES',
    published: resources
      .filter((r) => r.service === 'JSON')
      .map((r) => ({
        resource: { service: r.service, name: r.name, identifier: r.identifier! },
        transactionSignature: 'metadata-sig',
        result: {},
      })),
    failures: resources
      .filter((r) => r.service === 'AUDIO')
      .map((r) => ({
        resource: { service: r.service, name: r.name, identifier: r.identifier! },
        error: 'Audio outcome unknown',
        outcome: 'unknown' as const,
      })),
  }));
  await expect(publishBulkSelection(s.options)).rejects.toThrow(/not confirmed/);
  expect(s.options.onTrack).not.toHaveBeenCalled();
  expect(getBulkImportPublicationStatus(s.batch().rows[0])).not.toBe('complete');
});
