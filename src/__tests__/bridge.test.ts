/* ============================================================
 * NodeFM Station — Bridge Transport Contract Tests
 *
 * Confirms the production bridge resolves `window.qortalRequest`
 * rather than a custom postMessage protocol.
 * ============================================================ */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolveBridge, isBridgeAvailable, sendBridgeRequest } from '../qortium/bridge';
import { deserializeNoticeFromQdn } from '../features/notices/services/noticeService';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Qortal bridge transport', () => {
  it('rejects unported Home and background actions before sending any request', async () => {
    const request = vi.fn();
    vi.stubGlobal('window', { qortalRequest: request });
    for (const action of [
      'STAGE_QDN_PUBLISH_SOURCE',
      'GET_SELECTED_ACCOUNT',
      'SET_QDN_BACKGROUND_AUDIO_QUEUE',
    ]) {
      await expect(sendBridgeRequest({ action })).rejects.toThrow(/not available/);
    }
    expect(request).not.toHaveBeenCalled();
  });

  it('does not borrow a parent frame or Qortium bridge', () => {
    vi.stubGlobal('window', {
      qdnRequest: vi.fn(),
      parent: { qortalRequest: vi.fn() },
      top: { qortalRequest: vi.fn() },
    });
    expect(isBridgeAvailable()).toBe(false);
  });

  it('does not repeat denied authentication or confirmed missing public resources', async () => {
    const request = vi
      .fn()
      .mockRejectedValue({ error: 'USER_DECLINED', message: 'Access declined' });
    vi.stubGlobal('window', { qortalRequest: request });
    await expect(sendBridgeRequest({ action: 'GET_USER_ACCOUNT' })).rejects.toThrow(
      /USER_DECLINED/,
    );
    expect(request).toHaveBeenCalledTimes(1);
    request
      .mockClear()
      .mockRejectedValue({ error: 1401, message: "Couldn't find PUT transaction" });
    await expect(
      sendBridgeRequest({ action: 'FETCH_QDN_RESOURCE', service: 'JSON', name: 'Station' }),
    ).rejects.toThrow(/1401/);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('passes a resource path with the Core filepath field', async () => {
    const request = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('window', { qortalRequest: request });
    const { fetchQdnResource } = await import('../qortium/bridge');
    await fetchQdnResource('DOCUMENT', 'Station', 'catalog', 'nested/data.json');
    expect(request).toHaveBeenCalledWith({
      action: 'FETCH_QDN_RESOURCE',
      service: 'DOCUMENT',
      name: 'Station',
      identifier: 'catalog',
      filepath: 'nested/data.json',
    });
  });

  it('resolves window.qortalRequest as the application bridge', () => {
    const qortalRequest = vi.fn();
    vi.stubGlobal('window', { qortalRequest });

    const resolution = resolveBridge();

    expect(resolution.status).toBe('AVAILABLE');
    if (resolution.status === 'AVAILABLE') {
      expect(resolution.source).toBe('window');
      expect(resolution.bridge.request).toBe(qortalRequest);
    }

    expect(isBridgeAvailable()).toBe(true);
  });

  it('reports the bridge unavailable when no qortalRequest is present', () => {
    vi.stubGlobal('window', { parent: {}, top: {} });
    expect(resolveBridge().status).toBe('UNAVAILABLE');
    expect(isBridgeAvailable()).toBe(false);
  });

  it('passes the request object through window.qortalRequest and returns its result', async () => {
    const qortalRequest = vi.fn().mockResolvedValue({ address: 'Q-owner' });
    vi.stubGlobal('window', { qortalRequest });

    await expect(sendBridgeRequest({ action: 'GET_USER_ACCOUNT' })).resolves.toEqual({
      address: 'Q-owner',
    });
    expect(qortalRequest).toHaveBeenCalledWith({ action: 'GET_USER_ACCOUNT' });
  });

  it('passes a successful FETCH_QDN_RESOURCE payload with a top-level message through', async () => {
    const notice = {
      schemaVersion: 1,
      noticeId: 'notice-1',
      message: 'This station is still in BETA testing.',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const qortalRequest = vi.fn().mockResolvedValue(notice);
    vi.stubGlobal('window', { qortalRequest });

    const result = await sendBridgeRequest({
      action: 'FETCH_QDN_RESOURCE',
      service: 'JSON',
      name: 'NodeFM',
      identifier: 'nodefm-notice-notice-1',
    });

    expect(result).toBe(notice);
    expect(deserializeNoticeFromQdn(result)).toEqual(notice);
  });

  it('still rejects an explicit FETCH_QDN_RESOURCE failure with success: false', async () => {
    const qortalRequest = vi.fn().mockResolvedValue({
      success: false,
      message: 'node read failed',
    });
    vi.stubGlobal('window', { qortalRequest });

    await expect(
      sendBridgeRequest({
        action: 'FETCH_QDN_RESOURCE',
        service: 'JSON',
        name: 'NodeFM',
        identifier: 'nodefm-notice-notice-1',
      }),
    ).rejects.toThrow(/Qortal request failed/);
  });

  it('normalizes numeric QDN error objects to a readable node error', async () => {
    const qortalRequest = vi.fn().mockResolvedValue({
      error: 1401,
      message: "Couldn't find PUT transaction for name Owner, service JSON and identifier track-t1",
    });
    vi.stubGlobal('window', { qortalRequest });

    await expect(
      sendBridgeRequest({
        action: 'FETCH_QDN_RESOURCE',
        service: 'JSON',
        name: 'Owner',
        identifier: 'track-t1',
      }),
    ).rejects.toThrow(/QDN error 1401: Couldn't find PUT transaction/);
  });

  it('normalizes rejected numeric QDN error objects instead of losing the code', async () => {
    const qortalRequest = vi.fn().mockRejectedValue({
      error: 125,
      message: 'identifier must not exceed 64 UTF-8 bytes',
    });
    vi.stubGlobal('window', { qortalRequest });

    await expect(
      sendBridgeRequest({
        action: 'GET_USER_ACCOUNT',
        service: 'JSON',
        name: 'Owner',
        identifier: 'nodefm-like-too-long',
      }),
    ).rejects.toThrow(/QDN error 125: identifier must not exceed/);
  });

  it('still treats a top-level message as an error for non-resource actions', async () => {
    const qortalRequest = vi.fn().mockResolvedValue({
      message: 'account unavailable',
    });
    vi.stubGlobal('window', { qortalRequest });

    await expect(sendBridgeRequest({ action: 'GET_USER_ACCOUNT' })).rejects.toThrow(
      /account unavailable/,
    );
  });

  it('allows time for explicit account approval while keeping public reads bounded', async () => {
    vi.useFakeTimers();
    try {
      const qortalRequest = vi.fn(() => new Promise(() => {}));
      vi.stubGlobal('window', { qortalRequest });

      const write = sendBridgeRequest({ action: 'GET_USER_ACCOUNT', service: 'JSON' });
      const writeOutcome = write.catch((error: unknown) => String(error));
      await vi.advanceTimersByTimeAsync(120_000);
      expect(qortalRequest).not.toHaveBeenCalledTimes(0);
      await vi.advanceTimersByTimeAsync(180_000);
      await expect(writeOutcome).resolves.toMatch(/timed out after 300 seconds/);

      const read = sendBridgeRequest({ action: 'GET_QDN_RESOURCE_STATUS' });
      const readOutcome = read.catch((error: unknown) => String(error));
      await vi.advanceTimersByTimeAsync(120_000);
      await expect(readOutcome).resolves.toMatch(/timed out after 120 seconds/);
    } finally {
      vi.useRealTimers();
    }
  });
});
