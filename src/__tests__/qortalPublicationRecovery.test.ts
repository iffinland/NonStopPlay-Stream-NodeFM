import { afterEach, describe, expect, it, vi } from 'vitest';
import { publishMultipleResources } from '../qortium/qdn';
import { verifyPublishedBytes } from '../features/bulk-import/qortalBulkPublicationAdapter';
import { refreshAuth } from '../qortium/auth';
afterEach(() => {
  vi.unstubAllGlobals();
  refreshAuth();
});
describe('production bridge publication recovery', () => {
  it('retains nested Hub partial errors and never assumes omitted successes', async () => {
    let writes = 0;
    vi.stubGlobal('window', {
      qortalRequest: async (p: Record<string, unknown>) => {
        if (p.action === 'GET_USER_ACCOUNT') return { address: 'Q-owner' };
        if (p.action === 'GET_NAME_DATA') return { owner: 'Q-owner' };
        writes++;
        return {
          message: 'Some failed',
          error: {
            unsuccessfulPublishes: [
              { name: 'Owner', service: 'JSON', identifier: 'second', reason: 'Invalid data' },
            ],
          },
        };
      },
    });
    refreshAuth();
    const result = await publishMultipleResources(
      ['first', 'second'].map((identifier) => ({
        service: 'JSON',
        name: 'Owner',
        identifier,
        bytesBase64: btoa('{}'),
      })),
    );
    expect(writes).toBe(1);
    expect(result.published).toEqual([]);
    expect(result.failures).toEqual([
      expect.objectContaining({
        outcome: 'unknown',
        resource: { service: 'JSON', name: 'Owner', identifier: 'first' },
      }),
      expect.objectContaining({
        error: 'Invalid data',
        resource: { service: 'JSON', name: 'Owner', identifier: 'second' },
      }),
    ]);
  });
  it.each(['exact', 'different', 'truncated', 'too-long'] as const)(
    'compares %s streamed QDN bytes against the local file',
    async (kind) => {
      vi.stubGlobal('window', {
        qortalRequest: async (p: Record<string, unknown>) =>
          p.action === 'GET_QDN_RESOURCE_STATUS'
            ? { status: 'READY' }
            : '/arbitrary/AUDIO/Owner/id',
      });
      const local = new Blob([new Uint8Array([1, 2, 3, 4])]);
      const data =
        kind === 'different'
          ? [1, 9, 3, 4]
          : kind === 'truncated'
            ? [1, 2, 3]
            : kind === 'too-long'
              ? [1, 2, 3, 4, 5]
              : [1, 2, 3, 4];
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(data.slice(0, 2)));
          controller.enqueue(new Uint8Array(data.slice(2)));
          controller.close();
        },
      });
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stream)));
      await expect(
        verifyPublishedBytes({ service: 'AUDIO', name: 'Owner', identifier: 'id' }, local),
      ).resolves.toBe(kind === 'exact');
    },
  );
});
