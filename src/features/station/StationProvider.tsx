/* ============================================================
 * NodeFM Station — Station Provider
 *
 * Loads the singleton station config from QDN and exposes
 * station metadata plus owner authorization.
 * ============================================================ */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '../../app/providers/authContext';
import { clearIdentityCaches } from '../../qortium/identity';
import { usePublisherOwner } from './usePublisherOwner';
import { getCanonicalNodeFmAppIdentity } from '../../qortium/navigation';
import { recordStartupEvent } from '../../services/perf/startupDiagnostics';
import type { Station } from '../../types/domain';
import { StationContext, type StationContextValue } from './stationContext';
import {
  createStation,
  editStation,
  type CreateStationInput,
  type EditStationInput,
  type StationSaveInput,
} from './services/stationService';
import {
  getStation,
  getStationError,
  getStationLoadAction,
  getStationLoaded,
  getStationLoading,
  getStationPublisherName,
  loadStationConfig,
  resetStationStore,
  saveStationConfig,
  subscribeToStationStore,
} from './services/stationStore';

export function StationProvider({ children }: { children: ReactNode }) {
  const { auth } = useAuth();
  const userAddress = auth.status === 'authenticated' ? auth.address : null;
  const [ownerRevision, setOwnerRevision] = useState(0);
  const publisherOwner = usePublisherOwner(
    getCanonicalNodeFmAppIdentity().name,
    userAddress,
    ownerRevision,
    auth,
  );
  const isOwner = publisherOwner.isOwner;

  const [station, setStation] = useState<Station | null>(getStation());
  const [loaded, setLoaded] = useState(getStationLoaded());
  const [loading, setLoading] = useState(getStationLoading());
  const [error, setError] = useState<string | null>(getStationError());
  const [publisherName, setPublisherName] = useState<string | null>(getStationPublisherName());
  const stationStartRecordedRef = useRef(false);
  const stationReadyRecordedRef = useRef(false);

  useEffect(() => {
    const unsubscribe = subscribeToStationStore(() => {
      setStation(getStation());
      setLoaded(getStationLoaded());
      setLoading(getStationLoading());
      setError(getStationError());
      setPublisherName(getStationPublisherName());
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    // The canonical NodeFM station config is published under the APP name,
    // never under the selected account's primary name. This keeps the clean
    // reset from accidentally resolving an old test identity.
    const action = getStationLoadAction(getCanonicalNodeFmAppIdentity().name);

    if (action === 'reuse') {
      setStation(getStation());
      setLoaded(getStationLoaded());
      setLoading(getStationLoading());
      setError(getStationError());
      setPublisherName(getStationPublisherName());
      return;
    }

    resetStationStore();
    setStation(null);
    setLoaded(false);
    setLoading(true);
    setError(null);
    setPublisherName(null);
    loadStationConfig(getCanonicalNodeFmAppIdentity().name);
  }, []);

  useEffect(() => {
    if (loading && !stationStartRecordedRef.current) {
      stationStartRecordedRef.current = true;
      recordStartupEvent('STATION_CONFIG_START');
    }

    if ((loaded || error) && !stationReadyRecordedRef.current) {
      stationReadyRecordedRef.current = true;
      recordStartupEvent('STATION_CONFIG_READY', {
        completion: loaded ? 'success' : 'error',
        detail: error ?? undefined,
      });
    }
  }, [error, loaded, loading]);

  const refresh = useCallback(async () => {
    clearIdentityCaches();
    setOwnerRevision((revision) => revision + 1);
    resetStationStore();
    setStation(null);
    setLoaded(false);
    setLoading(true);
    setError(null);
    setPublisherName(null);
    await loadStationConfig(getCanonicalNodeFmAppIdentity().name);
  }, []);

  const saveStation = useCallback(
    async (input: StationSaveInput) => {
      if (!userAddress) {
        throw new Error('An authenticated account is required to publish station configuration.');
      }

      const appIdentity = getCanonicalNodeFmAppIdentity();
      const publisherName = appIdentity.name;
      if (!isOwner || !loaded || error) {
        throw new Error('Only the verified Qortal app publisher can edit this station.');
      }

      const nextStation = station
        ? editStation(station, input as EditStationInput)
        : createStation({
            ...(input as Omit<CreateStationInput, 'publisherName' | 'ownerAddress' | 'ownerName'>),
            ownerAddress: userAddress,
            publisherName,
          });

      return saveStationConfig(nextStation, nextStation.publisherName);
    },
    [userAddress, station, loaded, error, isOwner],
  );

  const value: StationContextValue = {
    station,
    loaded,
    loading,
    error,
    publisherName,
    isOwner,
    ownerLookupLoading: publisherOwner.loading,
    ownerLookupError: publisherOwner.error,
    saveStation,
    refresh,
  };

  return <StationContext.Provider value={value}>{children}</StationContext.Provider>;
}
