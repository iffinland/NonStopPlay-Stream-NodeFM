/* ============================================================
 * NodeFM Station — Auth Provider
 *
 * React context for authentication state.
 * Uses Qortal Hub authentication and its remembered permission and provides user identity.
 * Station ownership/admin authorization lives in StationProvider.
 * ============================================================ */

import { useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import {
  resolveAuth,
  refreshAuth,
  listenForAccountChanges,
  type AuthState,
} from '../../qortium/auth';
import { AuthContext } from './authContext';

// ── Provider ──────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState>({ status: 'loading' });
  const authEpochRef = useRef(0);
  const pendingRef = useRef<Promise<AuthState> | null>(null);
  const connectedRef = useRef(false);

  const loadAuth = useCallback((background = false) => {
    const epoch = ++authEpochRef.current;
    if (!pendingRef.current) {
      refreshAuth();
      pendingRef.current = resolveAuth();
    }
    const pending = pendingRef.current;
    // Focus/visibility also fires when a file picker or Hub approval closes.
    // Keep an established session mounted while checking it; signed writes
    // independently verify the live account before dispatch.
    if (!connectedRef.current) setAuth({ status: 'loading' });
    pending
      .then((state) => {
        if (authEpochRef.current === epoch) {
          connectedRef.current = state.status === 'authenticated';
          setAuth((previous) =>
            previous.status === 'authenticated' &&
            state.status === 'authenticated' &&
            previous.address === state.address &&
            (background ||
              (previous.name === state.name &&
                JSON.stringify(previous.names) === JSON.stringify(state.names)))
              ? previous
              : state,
          );
        }
      })
      .finally(() => {
        if (pendingRef.current === pending) pendingRef.current = null;
      });
  }, []);

  const refresh = useCallback(() => loadAuth(), [loadAuth]);

  const disconnect = useCallback(() => {
    authEpochRef.current += 1;
    pendingRef.current = null;
    connectedRef.current = false;
    refreshAuth();
    setAuth({ status: 'unauthenticated' });
  }, []);

  useEffect(() => {
    // GET_USER_ACCOUNT lets Hub apply its remembered "always authenticate"
    // permission. Never persist an account/address as proof of authentication.
    loadAuth();
    const unlisten = listenForAccountChanges(() => {
      // Returning from Hub's own approval dialog must not cancel that dialog
      // or start another one. Declined/explicitly disconnected guests stay guests.
      if (connectedRef.current && !pendingRef.current) loadAuth(true);
    });
    return () => {
      unlisten();
      authEpochRef.current += 1;
    };
  }, [loadAuth]);

  const ownerName = auth.status === 'authenticated' ? (auth.name ?? null) : null;
  return (
    <AuthContext.Provider value={{ auth, ownerName, refresh, disconnect }}>
      {children}
    </AuthContext.Provider>
  );
}
