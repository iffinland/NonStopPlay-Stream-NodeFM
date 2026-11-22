/** Qortal Hub social writes. Hub owns account selection, approvals and signing. */
import { sendBridgeRequest } from './bridge';
import { requireAccountWrite } from './accountWriteGate';

export type DirectChatMessageInput = { recipientAddress: string; message: string };
export type DirectChatMessageResult = {
  accepted: true;
  direct: boolean;
  encrypted: boolean;
  recipientAddress: string;
  result: unknown;
};
export type NativeTipInput = { recipient: string; amount: string };
export type NativeTipResult = {
  accepted: true;
  recipient: string;
  amount: string;
  transactionSignature?: string;
  result: unknown;
};
export class SocialActionUncertainError extends Error {
  constructor(detail: string) {
    super(`${detail} Check Hub Chat or wallet history before sending again.`);
    this.name = 'SocialActionUncertainError';
  }
}
const active = new Set<string>();

/** Hub's default v3 chat envelope plus the NaCl secretbox authentication tag. */
export function qortalChatMessageBytes(message: string): number {
  const envelope = {
    messageText: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: message }] }],
    },
    images: [],
    repliedTo: '',
    version: 3,
  };
  return new TextEncoder().encode(JSON.stringify(envelope)).byteLength + 16;
}
export function buildQortalDirectMessageRequest(recipientAddress: string, message: string) {
  return { action: 'SEND_CHAT_MESSAGE' as const, destinationAddress: recipientAddress, message };
}
export function buildQortalTipRequest(recipient: string, amount: string) {
  return { action: 'SEND_COIN' as const, coin: 'QORT' as const, recipient, amount };
}
function transaction(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Hub returned no signed transaction.');
  const tx = value as Record<string, unknown>;
  if (
    tx.error ||
    tx.accepted === false ||
    tx.success === false ||
    typeof tx.signature !== 'string' ||
    !tx.signature.trim()
  )
    throw new Error('Hub returned no confirmed transaction signature.');
  return tx;
}
function units(value: unknown): bigint | null {
  const text =
    typeof value === 'number' && Number.isFinite(value) ? value.toFixed(8) : String(value);
  if (!/^\d+(?:\.\d{1,8})?$/.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  return BigInt(whole) * 100000000n + BigInt(fraction.padEnd(8, '0'));
}
async function socialWrite<T>(
  action: string,
  operation: (address: string) => Promise<T>,
): Promise<T> {
  // Reserve before the account lookup so rapid clicks and another open modal
  // cannot enqueue two approvals for the same action.
  if (active.has(action)) throw new Error('This action is already awaiting a Hub result.');
  active.add(action);
  try {
    const ticket = await requireAccountWrite(action);
    return await operation(ticket.address);
  } finally {
    active.delete(action);
  }
}
async function dispatch(
  request: Record<string, unknown>,
  verify: (tx: Record<string, unknown>) => void,
) {
  try {
    const tx = transaction(await sendBridgeRequest(request));
    verify(tx);
    return tx;
  } catch (error) {
    // Once handed to Hub, transport failure is not proof that nothing was sent.
    throw new SocialActionUncertainError(
      error instanceof Error ? error.message : 'Hub outcome could not be confirmed.',
    );
  }
}
export async function sendDirectChatMessage(
  input: DirectChatMessageInput,
): Promise<DirectChatMessageResult> {
  const recipient = input.recipientAddress.trim(),
    message = input.message.trim();
  if (!recipient || !message) throw new Error('A recipient and message are required.');
  if (qortalChatMessageBytes(message) > 4000)
    throw new Error('Message exceeds the Qortal chat message size limit. Shorten the message.');
  return socialWrite('SEND_CHAT_MESSAGE', async (address) => {
    const tx = await dispatch(buildQortalDirectMessageRequest(recipient, message), (tx) => {
      if (
        tx.recipient !== recipient ||
        (tx.isEncrypted !== true && tx.isEncrypted !== 1) ||
        (tx.type !== undefined && tx.type !== 18 && tx.type !== 'CHAT') ||
        (tx.sender !== undefined && tx.sender !== address) ||
        (tx.creatorAddress !== undefined && tx.creatorAddress !== address)
      )
        throw new Error('Hub returned a chat transaction that does not match this message.');
    });
    return {
      accepted: true,
      direct: true,
      encrypted: true,
      recipientAddress: recipient,
      result: tx,
    };
  });
}
export async function sendNativeTip(input: NativeTipInput): Promise<NativeTipResult> {
  const recipient = input.recipient.trim(),
    amount = input.amount.trim();
  const amountUnits = units(amount);
  if (!recipient || amountUnits === null || amountUnits <= 0n)
    throw new Error('A recipient and positive QORT amount are required.');
  if (amountUnits > BigInt(Number.MAX_SAFE_INTEGER) || units(Number(amount)) !== amountUnits)
    throw new Error('QORT amount exceeds the supported payment precision.');
  return socialWrite('SEND_COIN', async (address) => {
    const tx = await dispatch(buildQortalTipRequest(recipient, amount), (tx) => {
      if (
        tx.recipient !== recipient ||
        units(tx.amount) !== amountUnits ||
        (tx.type !== undefined && tx.type !== 2 && tx.type !== 'PAYMENT') ||
        (tx.creatorAddress !== undefined && tx.creatorAddress !== address)
      )
        throw new Error('Hub returned a payment that does not match this tip.');
    });
    return {
      accepted: true,
      recipient,
      amount,
      transactionSignature: String(tx.signature),
      result: tx,
    };
  });
}
