// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MessageOwnerModal } from '../features/messaging/components/MessageOwnerModal';
import { TipOwnerModal } from '../features/tips/components/TipOwnerModal';
import { createStation } from '../features/station/services/stationService';
import { refreshAuth } from '../qortium/auth';
const account = vi.hoisted(() => ({ address: 'Q-sender' }));
vi.mock('../app/providers/authContext', () => ({
  useAuth: () => ({ auth: { status: 'authenticated', address: account.address } }),
}));
const station = createStation({
  name: 'Station',
  publisherName: 'Station',
  ownerAddress: 'Q-owner',
  timezone: 'UTC',
  defaultRotationPlaylistId: 'p',
  defaultRotationPlaylistVersionId: 'v',
  stationEpochUtc: '2026-11-22T00:00:00.000Z',
  messagingEnabled: true,
  tipsEnabled: true,
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  refreshAuth();
  account.address = 'Q-sender';
});
function pending() {
  let finish!: (value: unknown) => void;
  const request = vi.fn((p: Record<string, unknown>) =>
    p.action === 'GET_USER_ACCOUNT'
      ? Promise.resolve({ address: account.address })
      : new Promise((resolve) => {
          finish = resolve;
        }),
  );
  vi.stubGlobal('qortalRequest', request);
  return { request, finish: (value: unknown) => finish(value) };
}
it.each(['message', 'tip'])(
  'keeps the %s approval single and shows a spinner until signed confirmation',
  async (kind) => {
    const host = pending(),
      onClose = vi.fn();
    render(
      kind === 'message' ? (
        <MessageOwnerModal station={station} onClose={onClose} />
      ) : (
        <TipOwnerModal station={station} onClose={onClose} />
      ),
    );
    fireEvent.change(screen.getByLabelText(kind === 'message' ? 'Message' : 'Amount (QORT)'), {
      target: { value: kind === 'message' ? 'Hello' : '2' },
    });
    const button = screen.getByRole('button', {
      name: kind === 'message' ? 'Send Message' : 'Send Tip',
    });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(host.request).toHaveBeenCalledTimes(2));
    for (const close of screen.getAllByRole('button', { name: 'Close' }))
      expect(close.hasAttribute('disabled')).toBe(true);
    expect(document.querySelector('.progress-spinner')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    await act(async () =>
      host.finish(
        kind === 'message'
          ? { signature: 'chat', recipient: 'Q-owner', isEncrypted: true }
          : { signature: 'tip', recipient: 'Q-owner', amount: '2' },
      ),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  },
);
it('keeps an uncertain payment visible and prevents a second send or signed retry', async () => {
  const host = pending(),
    onClose = vi.fn();
  render(<TipOwnerModal station={station} onClose={onClose} />);
  fireEvent.change(screen.getByLabelText('Amount (QORT)'), { target: { value: '2' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send Tip' }));
  await waitFor(() => expect(host.request).toHaveBeenCalledTimes(2));
  await act(async () => host.finish(true));
  expect((await screen.findByRole('alert')).textContent).toContain(
    'Check Hub Chat or wallet history',
  );
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Send Tip' }).hasAttribute('disabled')).toBe(true);
  expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  expect(host.request).toHaveBeenCalledTimes(2);
});
it('does not close a different wallet form when an old account send finishes', async () => {
  const host = pending(),
    onClose = vi.fn();
  const { rerender } = render(<MessageOwnerModal station={station} onClose={onClose} />);
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Hello' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send Message' }));
  await waitFor(() => expect(host.request).toHaveBeenCalledTimes(2));
  account.address = 'Q-other';
  rerender(<MessageOwnerModal station={station} onClose={onClose} />);
  await act(async () =>
    host.finish({ signature: 'chat', recipient: 'Q-owner', isEncrypted: true }),
  );
  expect(onClose).not.toHaveBeenCalled();
  expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toBe('');
});
