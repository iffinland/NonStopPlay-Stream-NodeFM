// @vitest-environment jsdom
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, act } from '@testing-library/react';
import { AuthProvider } from '../app/providers/AuthProvider';
import { useAuth } from '../app/providers/authContext';
import { resolveAuth, type AuthState } from '../qortium/auth';

vi.mock('../qortium/auth', async (original) => ({
  ...(await original<typeof import('../qortium/auth')>()),
  resolveAuth: vi.fn(),
  refreshAuth: vi.fn(),
}));

function Account() {
  const { auth, refresh, disconnect } = useAuth();
  return (
    <>
      <output>{auth.status === 'authenticated' ? auth.address : auth.status}</output>
      <button onClick={refresh}>Connect</button>
      <button onClick={disconnect}>Disconnect</button>
    </>
  );
}

beforeEach(() => vi.mocked(resolveAuth).mockReset());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Hub-controlled automatic authentication', () => {
  it('resolves the current Hub account on startup and again after a real reopen', async () => {
    vi.mocked(resolveAuth).mockResolvedValue({ status: 'authenticated', address: 'Q-one' });
    const view = render(
      <AuthProvider>
        <Account />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Q-one'));
    expect(resolveAuth).toHaveBeenCalledTimes(1);
    view.unmount();
    vi.mocked(resolveAuth).mockResolvedValue({ status: 'authenticated', address: 'Q-two' });
    render(
      <AuthProvider>
        <Account />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Q-two'));
    expect(resolveAuth).toHaveBeenCalledTimes(2);
  });

  it('shares the initial account request across StrictMode effect replay', async () => {
    let finish!: (state: AuthState) => void;
    vi.mocked(resolveAuth).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    render(
      <StrictMode>
        <AuthProvider>
          <Account />
        </AuthProvider>
      </StrictMode>,
    );
    expect(resolveAuth).toHaveBeenCalledTimes(1);
    await act(async () => finish({ status: 'authenticated', address: 'Q-owner' }));
    expect(screen.getByRole('status').textContent).toBe('Q-owner');
  });

  it('does not cancel Hub approval when its dialog hides the app', async () => {
    let finish!: (state: AuthState) => void;
    vi.mocked(resolveAuth).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    render(
      <AuthProvider>
        <Account />
      </AuthProvider>,
    );
    const visible = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    fireEvent(document, new Event('visibilitychange'));
    await act(async () => finish({ status: 'authenticated', address: 'Q-one' }));
    expect(screen.getByRole('status').textContent).toBe('Q-one');
    expect(resolveAuth).toHaveBeenCalledTimes(1);
    vi.mocked(resolveAuth).mockResolvedValue({ status: 'authenticated', address: 'Q-two' });
    visible.mockReturnValue('visible');
    fireEvent(document, new Event('visibilitychange'));
    fireEvent(window, new Event('focus'));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Q-two'));
    expect(resolveAuth).toHaveBeenCalledTimes(2);
  });

  it('keeps a denied or explicitly disconnected guest from prompt loops', async () => {
    vi.mocked(resolveAuth).mockResolvedValue({ status: 'error', message: 'Declined' });
    render(
      <AuthProvider>
        <Account />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('error'));
    fireEvent(window, new Event('focus'));
    expect(resolveAuth).toHaveBeenCalledTimes(1);
    vi.mocked(resolveAuth).mockResolvedValue({ status: 'authenticated', address: 'Q-one' });
    fireEvent.click(screen.getByText('Connect'));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Q-one'));
    fireEvent.click(screen.getByText('Disconnect'));
    fireEvent(window, new Event('focus'));
    expect(screen.getByRole('status').textContent).toBe('unauthenticated');
    expect(resolveAuth).toHaveBeenCalledTimes(2);
  });

  it('ignores a late account response after explicit disconnect', async () => {
    let finish!: (state: AuthState) => void;
    vi.mocked(resolveAuth).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    render(
      <AuthProvider>
        <Account />
      </AuthProvider>,
    );
    fireEvent.click(screen.getByText('Disconnect'));
    await act(async () => finish({ status: 'authenticated', address: 'Q-stale' }));
    expect(screen.getByRole('status').textContent).toBe('unauthenticated');
  });

  it('ignores untrusted legacy account broadcasts', async () => {
    vi.mocked(resolveAuth).mockResolvedValue({ status: 'unauthenticated' });
    render(
      <AuthProvider>
        <Account />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('unauthenticated'));
    fireEvent(
      window,
      new MessageEvent('message', {
        data: { type: 'qortium:selected-account-changed', address: 'Q-forged' },
      }),
    );
    expect(resolveAuth).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status').textContent).toBe('unauthenticated');
  });
});
