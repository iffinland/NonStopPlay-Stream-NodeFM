import { useEffect, useState } from 'react';
import { resolveNameWalletAddress } from '../../qortium/identity';

type OwnerState = {
  key: string;
  session: object | null;
  address: string | null;
  error: string | null;
};

/** Ownership is name-wallet evidence, independent of optional station config. */
export function usePublisherOwner(
  publisher: string,
  accountAddress: string | null,
  revision = 0,
  session: object | null = null,
) {
  const key = `${publisher}\u0000${accountAddress ?? ''}\u0000${revision}`;
  const [state, setState] = useState<OwnerState | null>(null);
  useEffect(() => {
    if (!accountAddress) {
      setState(null);
      return;
    }
    let current = true;
    resolveNameWalletAddress(publisher)
      .then((address) => {
        if (!current) return;
        setState({
          key,
          session,
          address,
          error: address ? null : 'The app publisher has no verifiable Qortal owner.',
        });
      })
      .catch((error) => {
        if (current)
          setState({
            key,
            session,
            address: null,
            error: error instanceof Error ? error.message : 'Could not verify the app publisher.',
          });
      });
    return () => {
      current = false;
    };
  }, [publisher, accountAddress, key, session]);
  const matches = state?.key === key && state?.session === session;
  return {
    isOwner: !!accountAddress && matches && state?.address === accountAddress,
    loading: !!accountAddress && !matches,
    error: matches ? (state?.error ?? null) : null,
  };
}
