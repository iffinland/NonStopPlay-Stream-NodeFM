/* ============================================================
 * NodeFM Station — Social Bridge Contract Tests
 *
 * Verifies direct chat, native tip, and navigation bridge shapes
 * against the audited Qortal Hub implementation.
 * ============================================================ */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../qortium/bridge', () => ({
  sendBridgeRequest: vi.fn(),
}));

import { sendBridgeRequest } from '../qortium/bridge';
import { withUnlockedTestAccount } from './support/writeGateBridge';
import { sendDirectChatMessage, sendNativeTip } from '../qortium/social';
import { buildQdnUrl, getCurrentQdnAppIdentity, openQdnAddress } from '../qortium/navigation';

const mockedSend = vi.mocked(sendBridgeRequest);

describe('SEND_CHAT_MESSAGE direct bridge path', () => {
  beforeEach(() => {
    mockedSend.mockReset();
  });

  it('sends the exact direct-recipient request and returns confirmed result', async () => {
    mockedSend.mockImplementation(
      withUnlockedTestAccount(async () => ({
        type: 'CHAT',
        signature: 'tx-1',
        recipient: 'Q-owner',
        isEncrypted: true,
      })),
    );

    const result = await sendDirectChatMessage({
      recipientAddress: 'Q-owner',
      message: 'Hello station',
    });

    expect(mockedSend).toHaveBeenCalledWith({
      action: 'SEND_CHAT_MESSAGE',
      destinationAddress: 'Q-owner',
      message: 'Hello station',
    });
    expect(result.accepted).toBe(true);
    expect(result.direct).toBe(true);
    expect(result.encrypted).toBe(true);
  });

  it('never reports an unaccepted response as sent', async () => {
    mockedSend.mockImplementation(
      withUnlockedTestAccount(async () => ({
        accepted: false,
        reason: 'USER_CANCELLED',
      })),
    );

    await expect(
      sendDirectChatMessage({ recipientAddress: 'Q-owner', message: 'Hello' }),
    ).rejects.toThrow(/confirmed transaction signature/);
  });

  it('does not claim encryption unless the bridge proves it', async () => {
    mockedSend.mockImplementation(
      withUnlockedTestAccount(async () => ({
        signature: 'tx-plain',
        recipient: 'Q-owner',
        isEncrypted: false,
      })),
    );

    await expect(
      sendDirectChatMessage({ recipientAddress: 'Q-owner', message: 'Hello' }),
    ).rejects.toThrow(/does not match/);
  });
});

describe('SEND_COIN native tip bridge path', () => {
  beforeEach(() => {
    mockedSend.mockReset();
  });

  it('sends the exact native tip request and parses a confirmed signature', async () => {
    mockedSend.mockImplementation(
      withUnlockedTestAccount(async () => ({
        type: 'PAYMENT',
        recipient: 'Q-owner',
        amount: '1.25',
        signature: 'tip-tx',
      })),
    );

    const result = await sendNativeTip({ recipient: 'Q-owner', amount: '1.25' });

    expect(mockedSend).toHaveBeenCalledWith({
      action: 'SEND_COIN',
      coin: 'QORT',
      recipient: 'Q-owner',
      amount: '1.25',
    });
    expect(result.accepted).toBe(true);
    expect(result.transactionSignature).toBe('tip-tx');
  });

  it('throws for rejected/cancelled tip responses', async () => {
    mockedSend.mockImplementation(
      withUnlockedTestAccount(async () => ({ accepted: false, reason: 'USER_CANCELLED' })),
    );

    await expect(sendNativeTip({ recipient: 'Q-owner', amount: '1.25' })).rejects.toThrow(
      /confirmed transaction signature/,
    );
  });
});

describe('QDN navigation helpers', () => {
  beforeEach(() => {
    mockedSend.mockReset();
  });

  it('builds canonical qortal:// addresses', () => {
    expect(
      buildQdnUrl({
        service: 'PLAYLIST',
        name: 'Learning DEV - iffi',
        identifier: 'nodefm-playlist-p1',
      }),
    ).toBe('qortal://PLAYLIST/Learning%20DEV%20-%20iffi/nodefm-playlist-p1');
  });

  it('reads app identity from QDN host globals', () => {
    expect(
      getCurrentQdnAppIdentity({
        _qdnService: 'APP',
        _qdnName: 'NodeFM',
        _qdnIdentifier: 'NodeFM',
      }),
    ).toEqual({ service: 'APP', name: 'NodeFM', identifier: 'NodeFM' });
  });

  it('opens a new tab through the exact bridge action', async () => {
    mockedSend.mockImplementation(withUnlockedTestAccount(async () => true));

    await openQdnAddress('qortal://APP/NodeFM/NodeFM', 'new');

    expect(mockedSend).toHaveBeenCalledWith({
      action: 'OPEN_NEW_TAB',
      qortalLink: 'qortal://APP/NodeFM/NodeFM',
    });
  });

  it('rejects unsupported navigation schemes before calling the bridge', async () => {
    await expect(openQdnAddress('https://example.com', 'new')).rejects.toThrow(/Only qortal:\/\//);
    expect(mockedSend).not.toHaveBeenCalled();
  });
});
