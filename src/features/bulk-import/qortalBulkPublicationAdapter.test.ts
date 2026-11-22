import { describe, expect, it, vi } from 'vitest';
import {
  createQortalBulkPublicationAdapter,
  QortalReconciliationRequiredError,
} from './qortalBulkPublicationAdapter';
import {
  createEmptyPublicationJournal,
  createPublishedPublicationStep,
  createUnknownPublicationStep,
  getRequiredPublicationContentRevision,
} from './publicationJournal';
import type { BulkPublicationIntent, BulkPublicationRowResult } from './publicationAdapter';
import { QdnPublicationUnknownError, type PublishInput } from '../../qortium/qdn';

const file = new File(['actual audio'], 'song.mp3', { type: 'audio/mpeg' });
function fixture(): BulkPublicationIntent {
  return {
    batchId: 'batch',
    role: 'admin',
    scope: 'Owner',
    actor: { name: 'Owner', address: 'Q-owner' },
    rows: [
      {
        rowId: 'row-uuid',
        sourceGeneration: 1,
        roleIntent: 'track',
        source: { fileName: file.name, mimeType: file.type, sizeBytes: file.size },
        metadata: {
          title: 'Song',
          artist: 'Artist',
          album: '',
          releaseDate: '',
          genres: [],
          tags: [],
        },
        durationMs: 1000,
        cover: null,
        publication: createEmptyPublicationJournal(),
      },
    ],
  };
}
function adopt(intent: BulkPublicationIntent, result: BulkPublicationRowResult) {
  for (const step of result.steps) {
    if (step.step === 'source') continue;
    if (step.status === 'unknown')
      intent.rows[0].publication[step.step] = createUnknownPublicationStep({
        intent: step.intent,
        attemptId: step.attemptId,
        contentRevision: step.contentRevision,
        sourceGeneration: 1,
      });
    if (step.status === 'published')
      intent.rows[0].publication[step.step] = createPublishedPublicationStep({
        intent: step.intent,
        attemptId: step.attemptId,
        contentRevision: step.contentRevision,
        confirmed: step.reference,
        confirmedAt: step.confirmedAt,
        transactionSignature: step.transactionSignature,
      });
  }
}
function setup(extra: Partial<Parameters<typeof createQortalBulkPublicationAdapter>[0]> = {}) {
  const publish = vi.fn(async (input: PublishInput) => ({
    accepted: true as const,
    action: 'PUBLISH_QDN_RESOURCE' as const,
    resource: { service: input.service, name: input.name, identifier: input.identifier ?? null },
    transactionSignature: 'sig',
  }));
  const accountGate = vi.fn(async () => ({ address: 'Q-owner' }));
  const adapter = createQortalBulkPublicationAdapter({
    getSource: () => ({ file, fileName: file.name }),
    publish,
    accountGate,
    ...extra,
  });
  return { adapter, publish, accountGate };
}
describe('Qortal bulk publication and recovery', () => {
  it('publishes the staged bytes to stable coordinates and skips confirmed audio', async () => {
    const intent = fixture();
    const { adapter, publish } = setup();
    const source = (await adapter.acquireRowSource(intent, 'row-uuid')).sources[0];
    const result = await adapter.publishRow(intent, source);
    expect(result.status).toBe('partial');
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        file,
        name: 'Owner',
        service: 'AUDIO',
        identifier: 'nodefm-audio-row-uuid',
      }),
    );
    adopt(intent, result);
    expect((await adapter.publishRow(intent, source)).status).toBe('no-op');
    expect(publish).toHaveBeenCalledTimes(1);
  });
  it('records pending evidence before dispatch and refuses to publish if persistence fails', async () => {
    const events: string[] = [];
    const intent = fixture();
    const { adapter, publish } = setup({
      onAttempt: () => {
        events.push('saved');
        throw new Error('storage full');
      },
    });
    const source = (await adapter.acquireRowSource(intent, 'row-uuid')).sources[0];
    await expect(adapter.publishRow(intent, source)).rejects.toThrow('storage full');
    expect(events).toEqual(['saved']);
    expect(publish).not.toHaveBeenCalled();
  });
  it('blocks stale generations, mismatched roles and missing duration before a write', async () => {
    const intent = fixture();
    const { adapter, publish } = setup();
    const source = (await adapter.acquireRowSource(intent, 'row-uuid')).sources[0];
    intent.rows[0].sourceGeneration = 2;
    await expect(adapter.publishRow(intent, source)).rejects.toThrow(/Stale/);
    intent.rows[0].sourceGeneration = 1;
    intent.rows[0].roleIntent = 'submission';
    await expect(adapter.publishRow(intent, source)).rejects.toThrow(/role/);
    intent.rows[0].roleIntent = 'track';
    intent.rows[0].durationMs = null;
    await expect(adapter.publishRow(intent, source)).rejects.toThrow(/duration/);
    expect(publish).not.toHaveBeenCalled();
  });
  it('requires current published audio before publishing metadata', async () => {
    const intent = fixture();
    const json = new Blob(['{}'], { type: 'application/json' });
    const { adapter, publish } = setup({
      getSource: () => ({ file: json, fileName: 'track.json' }),
    });
    const expected = { fileName: 'track.json', mimeType: 'application/json', sizeBytes: json.size };
    const source = (await adapter.acquireMetadataSource(intent, 'row-uuid', expected)).sources[0];
    await expect(adapter.publishMetadata(intent, source, expected)).rejects.toThrow(
      /current audio/,
    );
    expect(publish).not.toHaveBeenCalled();
  });
  it('keeps unknown publications blocked until exact read-back confirms them without another transaction', async () => {
    const intent = fixture();
    const verify = vi.fn().mockResolvedValue(false);
    const rejectedPublisher = vi.fn().mockRejectedValue(
      new QdnPublicationUnknownError({
        service: 'AUDIO',
        name: 'Owner',
        identifier: 'nodefm-audio-row-uuid',
      }),
    );
    const { adapter } = setup({ publish: rejectedPublisher, verify });
    const source = (await adapter.acquireRowSource(intent, 'row-uuid')).sources[0];
    const result = await adapter.publishRow(intent, source);
    adopt(intent, result);
    await expect(adapter.publishRow(intent, source)).rejects.toBeInstanceOf(
      QortalReconciliationRequiredError,
    );
    expect((await adapter.reconcileBatch(intent)).rows[0].steps).toEqual([]);
    verify.mockResolvedValue(true);
    const recovered = (await adapter.reconcileBatch(intent)).rows[0];
    expect(recovered.steps[0]).toMatchObject({ status: 'published', transactionSignature: null });
    expect(rejectedPublisher).toHaveBeenCalledTimes(1);
    expect(verify).toHaveBeenCalledTimes(2);
  });
  it('reconciles restored journals only for the same actor and content revision', async () => {
    const intent = fixture();
    const row = intent.rows[0];
    const verify = vi.fn().mockResolvedValue(true);
    const revision = getRequiredPublicationContentRevision('audio', {
      sourceGeneration: 1,
      source: row.source,
      metadata: row.metadata,
      cover: null,
    })!;
    row.publication.audio = createUnknownPublicationStep({
      intent: {
        kind: 'audio',
        service: 'AUDIO',
        name: 'Owner',
        identifier: 'nodefm-audio-row-uuid',
      },
      attemptId: 'saved-attempt',
      contentRevision: revision,
      sourceGeneration: 1,
    });
    const { adapter, publish } = setup({ verify });
    intent.actor.name = 'Visitor';
    expect((await adapter.reconcileBatch(intent)).rows[0].steps).toEqual([]);
    expect(verify).not.toHaveBeenCalled();
    intent.actor.name = 'Owner';
    expect((await adapter.reconcileBatch(intent)).rows[0].steps[0]).toMatchObject({
      status: 'published',
      attemptId: 'saved-attempt',
    });
    expect(publish).not.toHaveBeenCalled();
  });
  it('does not dispatch after the workspace closes during account approval', async () => {
    let approve: (() => void) | undefined;
    const { adapter, publish } = setup({
      accountGate: () =>
        new Promise((resolve) => {
          approve = () => resolve({ address: 'Q-owner' });
        }),
    });
    const intent = fixture();
    const source = (await adapter.acquireRowSource(intent, 'row-uuid')).sources[0];
    const pending = adapter.publishRow(intent, source);
    adapter.dispose();
    approve!();
    await expect(pending).rejects.toThrow(/workspace has closed/);
    expect(publish).not.toHaveBeenCalled();
  });
});
