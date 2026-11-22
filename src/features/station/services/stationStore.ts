/* ============================================================
 * NodeFM Station — Station Config Store
 *
 * QDN-backed singleton Station resource store. The station is
 * discovered by a stable NodeFM identifier and is used by both
 * public listeners and the owner/admin surfaces.
 * ============================================================ */

import type { Station } from '../../../types/domain';
import {
  fetchQdnResourceData,
  getQdnResourceStatus,
  publishResource,
  qdnJsonPublishFileName,
} from '../../../qortium/qdn';
import { getCanonicalNodeFmAppIdentity } from '../../../qortium/navigation';
import { resolveNameWalletAddress } from '../../../qortium/identity';
import { isConfirmedQdnNotFoundError } from '../../../qortium/qdnReadError';
import {
  STATION_QDN_IDENTIFIER,
  STATION_QDN_SERVICE,
  deserializeStationFromQdn,
  serializeStationForQdn,
} from './stationService';

type StationListener = () => void;

let station: Station | null = null;
let stationLoaded = false;
let stationLoading = false;
let stationError: string | null = null;
let stationPublisherName: string | null = null;
let stationLoadKey: string | null = null;
let stationEpoch = 0;

const listeners = new Set<StationListener>();

function notify() {
  listeners.forEach((listener) => listener());
}

function stationLoadKeyFor(preferredName: string | null): string {
  return preferredName ?? '<global>';
}

// ── Public state accessors ─────────────────────────────────────────

export function subscribeToStationStore(listener: StationListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getStation(): Station | null {
  return station;
}

export function getStationLoaded(): boolean {
  return stationLoaded;
}

export function getStationLoading(): boolean {
  return stationLoading;
}

export function getStationError(): string | null {
  return stationError;
}

export function getStationPublisherName(): string | null {
  return stationPublisherName;
}

export type StationLoadAction = 'reuse' | 'load';

export function getStationLoadAction(preferredName: string | null): StationLoadAction {
  const nextKey = stationLoadKeyFor(preferredName);

  if (!preferredName && stationLoadKey === '<global>' && (stationLoaded || stationLoading)) {
    return 'reuse';
  }

  if (preferredName && stationLoadKey === nextKey && (stationLoaded || stationLoading)) {
    return 'reuse';
  }

  return preferredName ? 'load' : stationLoadKey ? 'load' : 'load';
}

// ── QDN load/publish ───────────────────────────────────────────────

export async function loadStationConfig(preferredName: string | null = null): Promise<void> {
  const publisher = preferredName?.trim() || getCanonicalNodeFmAppIdentity().name;
  const targetKey = stationLoadKeyFor(publisher);
  if (stationLoadKey === targetKey && (stationLoaded || stationLoading)) return;
  // Invalidate work started under a different app publisher.
  const epoch = ++stationEpoch;
  stationLoadKey = targetKey;
  station = null;
  stationPublisherName = null;
  stationLoaded = false;
  stationLoading = true;
  stationError = null;
  notify();
  try {
    let parsed: Station | null = null;
    try {
      const ref = {
        service: STATION_QDN_SERVICE,
        name: publisher,
        identifier: STATION_QDN_IDENTIFIER,
      };
      // A Qortal node can report NOT_PUBLISHED before a missing download fails
      // with a generic "data unavailable". Only this explicit status is absence.
      const status = await getQdnResourceStatus(ref).catch(() => null);
      if (status?.status === 'NOT_PUBLISHED') {
        if (epoch === stationEpoch) {
          stationPublisherName = publisher;
          stationLoaded = true;
        }
        return;
      }
      const payload = await fetchQdnResourceData({
        service: STATION_QDN_SERVICE,
        name: publisher,
        identifier: STATION_QDN_IDENTIFIER,
      });
      parsed = deserializeStationFromQdn(payload);
      if (!parsed) throw new Error('Invalid NodeFM station configuration payload.');
      if (parsed.publisherName !== publisher) {
        throw new Error('Station configuration publisher does not match this Qortal app.');
      }
      const owner = await resolveNameWalletAddress(publisher);
      if (!owner || owner !== parsed.ownerAddress) {
        throw new Error('Station owner does not match the registered Qortal publisher.');
      }
    } catch (error) {
      if (!isConfirmedQdnNotFoundError(error)) throw error;
      // Only absence of the config is a normal bootstrap. Name-ownership errors
      // after a config was found must never become a fresh, claimable station.
      if (parsed) throw error;
    }
    if (epoch !== stationEpoch) return;
    station = parsed;
    stationPublisherName = publisher;
    stationLoaded = true;
  } catch (error) {
    if (epoch !== stationEpoch) return;
    stationError = error instanceof Error ? error.message : 'Failed to load station configuration.';
  } finally {
    if (epoch === stationEpoch) {
      stationLoading = false;
      notify();
    }
  }
}

export async function saveStationConfig(
  nextStation: Station,
  publisherName: string,
): Promise<Station> {
  const json = serializeStationForQdn(nextStation);

  await publishResource({
    service: STATION_QDN_SERVICE,
    name: publisherName,
    identifier: STATION_QDN_IDENTIFIER,
    bytesBase64: btoa(unescape(encodeURIComponent(json))),
    fileName: qdnJsonPublishFileName(STATION_QDN_IDENTIFIER),
    mimeType: 'application/json',
    title: nextStation.name,
    description: nextStation.description,
  });

  station = nextStation;
  stationPublisherName = publisherName;
  stationLoaded = true;
  stationError = null;
  notify();
  return nextStation;
}

export function resetStationStore(): void {
  station = null;
  stationLoaded = false;
  stationLoading = false;
  stationError = null;
  stationPublisherName = null;
  stationLoadKey = null;
  stationEpoch += 1;
  notify();
}
