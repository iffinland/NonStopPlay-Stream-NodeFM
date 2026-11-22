// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useStationAccess } from './useStationAccess';
import { getStationRole } from './collaborationService';
vi.mock('./collaborationService', () => ({ getStationRole: vi.fn() }));
vi.mock('../../qortium/stationAccess', () => ({ hasStationAccess: () => true }));
const role = (canManage: boolean) => ({
  registry: {
    schemaVersion: 1 as const,
    station: 'Station',
    owner: 'Q-owner',
    epoch: 1,
    admins: [],
  },
  canManage,
  isOwner: false,
});
beforeEach(() => vi.mocked(getStationRole).mockReset());
afterEach(cleanup);
it('preserves the open editor during a transient focus check, but removes a confirmed revoked role', async () => {
  vi.mocked(getStationRole).mockResolvedValueOnce(role(true));
  const { result } = renderHook(() => useStationAccess('Q-editor'));
  await waitFor(() => expect(result.current.canManage).toBe(true));
  vi.mocked(getStationRole).mockRejectedValueOnce(new Error('Node unavailable'));
  act(() => window.dispatchEvent(new Event('focus')));
  await waitFor(() => expect(result.current.error).toBe('Node unavailable'));
  expect(result.current.canManage).toBe(true);
  vi.mocked(getStationRole).mockResolvedValueOnce(role(false));
  act(() => window.dispatchEvent(new Event('focus')));
  await waitFor(() => expect(result.current.canManage).toBe(false));
});
it('never carries rights to a different wallet or lets a stale response restore them', async () => {
  let finish!: (value: ReturnType<typeof role>) => void;
  vi.mocked(getStationRole).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { result, rerender } = renderHook(({ address }) => useStationAccess(address), {
    initialProps: { address: 'Q-editor' },
  });
  vi.mocked(getStationRole).mockResolvedValueOnce(role(false));
  rerender({ address: 'Q-guest' });
  expect(result.current.canManage).toBe(false);
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => finish(role(true)));
  expect(result.current.address).toBe('Q-guest');
  expect(result.current.canManage).toBe(false);
});
