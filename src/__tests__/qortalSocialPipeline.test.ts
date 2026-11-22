import { afterEach, expect, it, vi } from 'vitest';
import {
  sendStationMessage,
  validateStationMessageInput,
} from '../features/messaging/services/messagingService';
import { sendStationTip } from '../features/tips/services/tipService';
import { qortalChatMessageBytes, SocialActionUncertainError } from '../qortium/social';
import { refreshAuth } from '../qortium/auth';

afterEach(() => {
  vi.unstubAllGlobals();
  refreshAuth();
});
function host(result: unknown) {
  const request = vi.fn(async (p: Record<string, unknown>) =>
    p.action === 'GET_USER_ACCOUNT' ? { address: 'Q-sender' } : result,
  );
  vi.stubGlobal('window', { qortalRequest: request });
  return request;
}
it('uses real Qortal chat destination and confirms a native encrypted CHAT transaction', async () => {
  const request = host({
    type: 'CHAT',
    signature: 'chat-sig',
    recipient: 'Q-owner',
    isEncrypted: true,
  });
  const result = await sendStationMessage({
    recipientAddress: 'Q-owner',
    message: 'Hello',
    messagingEnabled: true,
  });
  expect(result).toMatchObject({ accepted: true, direct: true, encrypted: true });
  expect(request.mock.calls.map(([p]) => p)).toEqual([
    { action: 'GET_USER_ACCOUNT' },
    { action: 'SEND_CHAT_MESSAGE', destinationAddress: 'Q-owner', message: 'Hello' },
  ]);
});
it('uses QORT explicitly and confirms the matching native PAYMENT transaction', async () => {
  const request = host({
    type: 'PAYMENT',
    signature: 'tip-sig',
    recipient: 'Q-owner',
    amount: '0.00000001',
  });
  expect(
    await sendStationTip({ recipient: 'Q-owner', amount: '0.00000001', tipsEnabled: true }),
  ).toMatchObject({ accepted: true, transactionSignature: 'tip-sig' });
  expect(request.mock.calls[1][0]).toEqual({
    action: 'SEND_COIN',
    coin: 'QORT',
    recipient: 'Q-owner',
    amount: '0.00000001',
  });
});
it.each([
  false,
  true,
  {},
  { accepted: true },
  { signature: 'wrong', recipient: 'Q-other', amount: '2' },
  { signature: 'wrong', recipient: 'Q-owner', amount: '3' },
])('does not turn an invalid or mismatched payment response into success (%j)', async (result) => {
  const request = host(result);
  await expect(
    sendStationTip({ recipient: 'Q-owner', amount: '2', tipsEnabled: true }),
  ).rejects.toBeInstanceOf(SocialActionUncertainError);
  expect(request.mock.calls.filter(([p]) => p.action === 'SEND_COIN')).toHaveLength(1);
});
it('never automatically retries a rejected Hub payment', async () => {
  const request = host({ error: 'User declined request' });
  await expect(
    sendStationTip({ recipient: 'Q-owner', amount: '2', tipsEnabled: true }),
  ).rejects.toThrow(/User declined request/);
  expect(request.mock.calls.filter(([p]) => p.action === 'SEND_COIN')).toHaveLength(1);
});
it('deduplicates pending social writes even before the account lookup returns', async () => {
  let finish!: (result: unknown) => void;
  const request = vi.fn((p: Record<string, unknown>) =>
    p.action === 'GET_USER_ACCOUNT'
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : Promise.resolve({ signature: 'tip', recipient: 'Q-owner', amount: '2' }),
  );
  vi.stubGlobal('window', { qortalRequest: request });
  const first = sendStationTip({ recipient: 'Q-owner', amount: '2', tipsEnabled: true });
  await expect(
    sendStationTip({ recipient: 'Q-owner', amount: '2', tipsEnabled: true }),
  ).rejects.toThrow(/already awaiting/);
  finish({ address: 'Q-sender' });
  await expect(first).resolves.toMatchObject({ accepted: true });
  expect(request.mock.calls.filter(([p]) => p.action === 'SEND_COIN')).toHaveLength(1);
});
it('counts Hub envelope, UTF-8, JSON escapes and encryption tag before sending', () => {
  const basic = qortalChatMessageBytes('');
  expect(qortalChatMessageBytes('ä')).toBe(basic + 2);
  expect(qortalChatMessageBytes('"')).toBe(basic + 2);
  const validate = (message: string) =>
    validateStationMessageInput({ recipientAddress: 'Q-owner', message, messagingEnabled: true });
  expect(() => validate('x'.repeat(4000 - basic))).not.toThrow();
  expect(() => validate('x'.repeat(4001 - basic))).toThrow(/size limit/);
  expect(() => validate('ä'.repeat(2000))).toThrow(/size limit/);
});
it('rejects amounts that Hub numeric conversion would change before opening approval', async () => {
  const request = host(null);
  await expect(
    sendStationTip({ recipient: 'Q-owner', amount: '9007199254740993', tipsEnabled: true }),
  ).rejects.toThrow(/precision/);
  expect(request).not.toHaveBeenCalled();
});
