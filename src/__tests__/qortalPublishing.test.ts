import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../qortium/bridge', () => ({ sendBridgeRequest: vi.fn() }));
import { sendBridgeRequest } from '../qortium/bridge';
import {
  publishResource,
  publishMultipleResources,
  QdnPublicationUnknownError,
  QdnPublishRejectedError,
} from '../qortium/qdn';
import type { PublishInput } from '../qortium/qdn';
const wire = vi.mocked(sendBridgeRequest);
const file = new File(['audio-bytes'], 'õhtu.mp3', { type: 'audio/mpeg' });
const input: PublishInput = { service: 'AUDIO', name: 'Owner', identifier: 'audio-1', file };
function tx(resource: Record<string, unknown>, index = 0) {
  return {
    signature: `signature-${index}`,
    name: resource.name,
    identifier: resource.identifier,
    service: resource.service === 'AUDIO' ? 600 : resource.service === 'IMAGE' ? 400 : 1110,
  };
}
beforeEach(() => {
  wire.mockReset();
  wire.mockImplementation(async (payload) => {
    if (payload.action === 'GET_USER_ACCOUNT') return { address: 'Q-owner', publicKey: 'key' };
    if (payload.action === 'GET_NAME_DATA') return { owner: 'Q-owner' };
    if (payload.action === 'PUBLISH_QDN_RESOURCE') return tx(payload);
    if (payload.action === 'PUBLISH_MULTIPLE_QDN_RESOURCES')
      return (payload.resources as Record<string, unknown>[]).map(tx);
    throw new Error(`Unexpected action ${payload.action}`);
  });
});
describe('Qortal Hub publication contract', () => {
  it('publishes a browser File with filename, never staging or sending source tokens', async () => {
    const result = await publishResource(input);
    expect(result).toMatchObject({
      accepted: true,
      transactionSignature: 'signature-0',
      resource: { service: 'AUDIO', name: 'Owner', identifier: 'audio-1' },
    });
    const request = wire.mock.calls
      .map(([value]) => value)
      .find((value) => value.action === 'PUBLISH_QDN_RESOURCE')!;
    expect(request.file).toBe(file);
    expect(request.filename).toBe('õhtu.mp3');
    expect(request).not.toHaveProperty('sourceToken');
    expect(wire.mock.calls.map(([value]) => value.action)).toEqual([
      'GET_USER_ACCOUNT',
      'GET_NAME_DATA',
      'GET_USER_ACCOUNT',
      'PUBLISH_QDN_RESOURCE',
    ]);
  });
  it('validates UTF-8 JSON size before any Hub approval or write', async () => {
    const bytesBase64 = btoa(
      unescape(encodeURIComponent(JSON.stringify({ text: 'õ'.repeat(13000) }))),
    );
    await expect(
      publishResource({
        service: 'JSON',
        name: 'Owner',
        identifier: 'large',
        bytesBase64,
        fileName: 'large.json',
      }),
    ).rejects.toThrow(/25 KiB/);
    expect(wire).not.toHaveBeenCalled();
  });
  it('rejects malformed JSON and legacy native tokens before requesting account access', async () => {
    await expect(
      publishResource({ service: 'JSON', name: 'Owner', bytesBase64: btoa('{broken') }),
    ).rejects.toThrow(/malformed/);
    await expect(
      publishResource({ ...input, sourceToken: 'native-token' } as PublishInput),
    ).rejects.toThrow(/sourceToken/);
    expect(wire).not.toHaveBeenCalled();
  });
  it('cannot publish under a name owned by a different account', async () => {
    wire.mockImplementation(async (request) =>
      request.action === 'GET_USER_ACCOUNT' ? { address: 'Q-visitor' } : { owner: 'Q-owner' },
    );
    await expect(publishResource(input)).rejects.toThrow(/does not own/);
    expect(wire.mock.calls.some(([request]) => request.action === 'PUBLISH_QDN_RESOURCE')).toBe(
      false,
    );
  });
  it('checks for a switched Hub wallet immediately before dispatch', async () => {
    let accounts = 0;
    wire.mockImplementation(async (request) =>
      request.action === 'GET_USER_ACCOUNT'
        ? { address: ++accounts === 1 ? 'Q-owner' : 'Q-visitor' }
        : { owner: 'Q-owner' },
    );
    await expect(publishResource(input)).rejects.toThrow(/account changed/);
    expect(wire.mock.calls.some(([request]) => request.action === 'PUBLISH_QDN_RESOURCE')).toBe(
      false,
    );
  });
  it('treats a lost publish response as unknown and never retries the write', async () => {
    const fallback = wire.getMockImplementation()!;
    wire.mockImplementation(async (request) => {
      if (request.action === 'PUBLISH_QDN_RESOURCE') throw new Error('network lost after send');
      return fallback(request);
    });
    await expect(publishResource(input)).rejects.toBeInstanceOf(QdnPublicationUnknownError);
    expect(
      wire.mock.calls.filter(([request]) => request.action === 'PUBLISH_QDN_RESOURCE'),
    ).toHaveLength(1);
  });
  it('keeps explicit approval rejection separate from unknown broadcast outcomes', async () => {
    const fallback = wire.getMockImplementation()!;
    wire.mockImplementation(async (request) => {
      if (request.action === 'PUBLISH_QDN_RESOURCE') throw new Error('User declined publication');
      return fallback(request);
    });
    await expect(publishResource(input)).rejects.toBeInstanceOf(QdnPublishRejectedError);
  });
  it('does not accept a transaction for another coordinate as success', async () => {
    const fallback = wire.getMockImplementation()!;
    wire.mockImplementation(async (request) =>
      request.action === 'PUBLISH_QDN_RESOURCE'
        ? { signature: 'sig', name: 'SomebodyElse', service: 600, identifier: 'audio-1' }
        : fallback(request),
    );
    await expect(publishResource(input)).rejects.toBeInstanceOf(QdnPublicationUnknownError);
  });
  it('normalizes the real batch transaction array and preserves resource names', async () => {
    const result = await publishMultipleResources([
      input,
      {
        service: 'JSON',
        name: 'Owner',
        identifier: 'track-1',
        bytesBase64: btoa('{"title":"Song"}'),
      },
    ]);
    expect(result.published).toHaveLength(2);
    expect(result.failures).toEqual([]);
    const request = wire.mock.calls
      .map(([value]) => value)
      .find((value) => value.action === 'PUBLISH_MULTIPLE_QDN_RESOURCES')!;
    expect((request.resources as Record<string, unknown>[])[0].file).toBe(file);
    expect((request.resources as Record<string, unknown>[])[1].data64).toBe(
      btoa('{"title":"Song"}'),
    );
    expect((request.resources as Record<string, unknown>[])[0]).not.toHaveProperty('action');
  });
  it('preserves uncertainty when Hub drops successful signatures from a partial batch', async () => {
    const fallback = wire.getMockImplementation()!;
    wire.mockImplementation(async (request) =>
      request.action === 'PUBLISH_MULTIPLE_QDN_RESOURCES'
        ? {
            error: {
              unsuccessfulPublishes: [
                { service: 'AUDIO', name: 'Owner', identifier: 'audio-2', reason: 'Invalid data' },
              ],
            },
            message: 'Some resources failed',
          }
        : fallback(request),
    );
    const result = await publishMultipleResources([input, { ...input, identifier: 'audio-2' }]);
    expect(result.published).toEqual([]);
    expect(result.failures.find((item) => item.resource.identifier === 'audio-1')?.outcome).toBe(
      'unknown',
    );
    expect(
      result.failures.find((item) => item.resource.identifier === 'audio-2')?.outcome,
    ).toBeUndefined();
    expect(
      wire.mock.calls.filter(([request]) => request.action === 'PUBLISH_MULTIPLE_QDN_RESOURCES'),
    ).toHaveLength(1);
  });
  it('submits more than ten resources in one approval without later chunk prompts', async () => {
    let batches = 0;
    wire.mockImplementation(async (request) => {
      if (request.action === 'GET_USER_ACCOUNT')
        return { address: batches ? 'Q-visitor' : 'Q-owner' };
      if (request.action === 'GET_NAME_DATA') return { owner: 'Q-owner' };
      if (request.action === 'PUBLISH_MULTIPLE_QDN_RESOURCES') {
        batches++;
        return (request.resources as Record<string, unknown>[]).map(tx);
      }
      throw new Error('unexpected');
    });
    const result = await publishMultipleResources(
      Array.from({ length: 11 }, (_, i) => ({ ...input, identifier: `audio-${i}` })),
    );
    expect(result.published).toHaveLength(11);
    expect(result.failures).toHaveLength(0);
    expect(batches).toBe(1);
  });
});

it('rejects an oversized complete action before the first permission or publish call', async () => {
  wire.mockClear();
  await expect(
    publishMultipleResources(
      Array.from({ length: 1001 }, (_, i) => ({ ...input, identifier: `audio-${i}` })),
    ),
  ).rejects.toThrow(/1,000-resource/);
  expect(wire).not.toHaveBeenCalled();
});
it('blocks an account change before the only batch is dispatched', async () => {
  let reads = 0;
  wire.mockImplementation(async (request) => {
    if (request.action === 'GET_USER_ACCOUNT')
      return { address: ++reads === 1 ? 'Q-owner' : 'Q-other' };
    if (request.action === 'GET_NAME_DATA') return { owner: 'Q-owner' };
    throw new Error('No signing expected');
  });
  await expect(publishMultipleResources([input])).rejects.toThrow(/changed/);
  expect(wire.mock.calls.some(([p]) => p.action === 'PUBLISH_MULTIPLE_QDN_RESOURCES')).toBe(false);
});
