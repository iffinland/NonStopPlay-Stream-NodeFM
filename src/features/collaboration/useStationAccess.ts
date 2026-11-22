import { useEffect, useState } from 'react';
import { hasStationAccess } from '../../qortium/stationAccess';
import { getStationRole } from './collaborationService';
export function useStationAccess(address: string | null) {
  const [state, setState] = useState<{
    address: string | null;
    canManage: boolean;
    owner: string | null;
    loading: boolean;
    error: string | null;
  }>({ address: null, canManage: false, owner: null, loading: true, error: null });
  useEffect(() => {
    if (!hasStationAccess()) return;
    let current = true;
    let sequence = 0;
    const check = () => {
      const request = ++sequence;
      void getStationRole(address, true)
        .then((role) => {
          if (current && request === sequence)
            setState({
              address,
              canManage: role.canManage,
              owner: role.registry.owner,
              loading: false,
              error: null,
            });
        })
        .catch((error) => {
          if (current && request === sequence)
            setState((previous) => ({
              address,
              canManage: previous.address === address && previous.canManage,
              owner: previous.owner,
              loading: false,
              error: error instanceof Error ? error.message : 'Cannot verify station access.',
            }));
        });
    };
    check();
    window.addEventListener('focus', check);
    return () => {
      current = false;
      window.removeEventListener('focus', check);
    };
  }, [address]);
  return {
    ...state,
    canManage: state.address === address && state.canManage,
    loading: state.address !== address || state.loading,
    enabled: hasStationAccess(),
  };
}
