/* ============================================================
 * NodeFM Station — Station Config Tests
 *
 * Covers station domain validation and the QDN-backed singleton
 * station store using mocked QDN transport.
 * ============================================================ */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../qortium/identity', () => ({ resolveNameWalletAddress: vi.fn() }));

vi.mock('../qortium/qdn', () => ({
  qdnJsonPublishFileName: (identifier: string) => `${identifier}.json`,
  fetchQdnResourceData: vi.fn(),
  getQdnResourceStatus: vi.fn(),
  publishResource: vi.fn(),
  searchQdnResources: vi.fn(),
}));

import { resolveNameWalletAddress } from '../qortium/identity';
import {
  getQdnResourceStatus,
  fetchQdnResourceData,
  publishResource,
  searchQdnResources,
} from '../qortium/qdn';
import {
  createStation,
  deserializeStationFromQdn,
  editStation,
  getStationQdnIdentifier,
} from '../features/station/services/stationService';
import {
  getStation,
  getStationError,
  getStationLoaded,
  loadStationConfig,
  resetStationStore,
  saveStationConfig,
} from '../features/station/services/stationStore';

const mockedFetch = vi.mocked(fetchQdnResourceData);
const mockedSearch = vi.mocked(searchQdnResources);
const mockedPublish = vi.mocked(publishResource);

function stationPayload(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    stationId: 'station-1',
    name: 'NodeFM',
    publisherName: 'Owner',
    ownerAddress: 'Q-owner',
    ownerName: 'Owner',
    timezone: 'Europe/Helsinki',
    defaultRotationPlaylistId: 'playlist-1',
    defaultRotationPlaylistVersionId: 'version-1',
    stationEpochUtc: '2026-01-01T00:00:00.000Z',
    messagingEnabled: false,
    tipsEnabled: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('station domain validation', () => {
  it('creates a valid station and trims display fields', () => {
    const station = createStation({
      name: '  NodeFM  ',
      publisherName: 'Owner',
      ownerAddress: 'Q-owner',
      ownerName: 'Owner',
      timezone: ' Europe/Helsinki ',
      defaultRotationPlaylistId: ' playlist-1 ',
      defaultRotationPlaylistVersionId: ' version-1 ',
      stationEpochUtc: '2026-01-01T00:00:00.000Z',
      messagingEnabled: false,
      tipsEnabled: true,
    });

    expect(station.name).toBe('NodeFM');
    expect(station.timezone).toBe('Europe/Helsinki');
    expect(station.defaultRotationPlaylistId).toBe('playlist-1');
    expect(station.tipsEnabled).toBe(true);
  });

  it('treats the owner display name as optional while requiring the publisher name', () => {
    const station = createStation({
      name: 'NodeFM',
      publisherName: '  NodeFM  ',
      ownerAddress: 'Q-owner',
      timezone: 'Europe/Helsinki',
      defaultRotationPlaylistId: 'playlist-1',
      defaultRotationPlaylistVersionId: 'version-1',
      stationEpochUtc: '2026-01-01T00:00:00.000Z',
      messagingEnabled: false,
      tipsEnabled: false,
    });

    expect(station.publisherName).toBe('NodeFM');
    expect(station.ownerName).toBeUndefined();
    expect(station.ownerAddress).toBe('Q-owner');
  });

  it('rejects invalid required fields', () => {
    expect(() =>
      createStation({
        name: '',
        publisherName: 'Owner',
        ownerAddress: 'Q-owner',
        ownerName: 'Owner',
        timezone: 'Europe/Helsinki',
        defaultRotationPlaylistId: 'playlist-1',
        defaultRotationPlaylistVersionId: 'version-1',
        stationEpochUtc: '2026-01-01T00:00:00.000Z',
        messagingEnabled: false,
        tipsEnabled: false,
      }),
    ).toThrow(/name/i);

    expect(() =>
      createStation({
        name: 'NodeFM',
        publisherName: 'Owner',
        ownerAddress: 'Q-owner',
        ownerName: 'Owner',
        timezone: 'Europe/Helsinki',
        defaultRotationPlaylistId: 'playlist-1',
        defaultRotationPlaylistVersionId: 'version-1',
        stationEpochUtc: 'not-a-date',
        messagingEnabled: false,
        tipsEnabled: false,
      }),
    ).toThrow(/epoch/i);

    expect(() =>
      createStation({
        name: 'NodeFM',
        publisherName: '',
        ownerAddress: 'Q-owner',
        timezone: 'Europe/Helsinki',
        defaultRotationPlaylistId: 'playlist-1',
        defaultRotationPlaylistVersionId: 'version-1',
        stationEpochUtc: '2026-01-01T00:00:00.000Z',
        messagingEnabled: false,
        tipsEnabled: false,
      }),
    ).toThrow(/publisher name/i);
  });

  it('rejects malformed station records during deserialization', () => {
    expect(deserializeStationFromQdn(null)).toBeNull();
    expect(
      deserializeStationFromQdn(stationPayload({ defaultRotationPlaylistVersionId: '' })),
    ).toBeNull();
    expect(deserializeStationFromQdn(stationPayload({ stationEpochUtc: 'not-a-date' }))).toBeNull();
    expect(deserializeStationFromQdn(stationPayload({ publisherName: '' }))).toBeNull();
    expect(deserializeStationFromQdn(stationPayload())).toMatchObject({ stationId: 'station-1' });
  });

  it('rejects invalid edits', () => {
    const station = createStation({
      name: 'NodeFM',
      publisherName: 'Owner',
      ownerAddress: 'Q-owner',
      ownerName: 'Owner',
      timezone: 'Europe/Helsinki',
      defaultRotationPlaylistId: 'playlist-1',
      defaultRotationPlaylistVersionId: 'version-1',
      stationEpochUtc: '2026-01-01T00:00:00.000Z',
      messagingEnabled: false,
      tipsEnabled: false,
    });

    expect(() => editStation(station, { name: '' })).toThrow(/name/i);
    expect(() => editStation(station, { stationEpochUtc: 'bad' })).toThrow(/epoch/i);
  });
});

describe('station QDN store', () => {
  beforeEach(() => {
    resetStationStore();
    mockedFetch.mockReset();
    vi.mocked(getQdnResourceStatus).mockReset().mockResolvedValue({ status: 'READY' });
    mockedSearch.mockReset();
    mockedPublish.mockReset();
    vi.mocked(resolveNameWalletAddress).mockReset().mockResolvedValue('Q-owner');
  });

  it('recognizes explicit Qortal NOT_PUBLISHED without attempting a download', async () => {
    vi.mocked(getQdnResourceStatus).mockResolvedValue({ status: 'NOT_PUBLISHED' });
    await loadStationConfig('Owner');
    expect(getStationLoaded()).toBe(true);
    expect(getStation()).toBeNull();
    expect(getStationError()).toBeNull();
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it('loads only the named publisher and verifies its registered owner', async () => {
    mockedFetch.mockResolvedValue(stationPayload());
    await loadStationConfig('Owner');
    expect(getStationLoaded()).toBe(true);
    expect(getStation()?.ownerAddress).toBe('Q-owner');
    expect(resolveNameWalletAddress).toHaveBeenCalledWith('Owner');
    expect(mockedSearch).not.toHaveBeenCalled();
  });

  it('never falls back to another publisher when the station is absent', async () => {
    mockedFetch.mockRejectedValue(new Error('QDN error 1401: no file exists'));
    await loadStationConfig('OtherStation');
    expect(getStationLoaded()).toBe(true);
    expect(getStation()).toBeNull();
    expect(getStationError()).toBeNull();
    expect(mockedSearch).not.toHaveBeenCalled();
  });

  it('uses the canonical app publisher when no explicit publisher is supplied', async () => {
    mockedFetch.mockRejectedValue(new Error('not found'));
    await loadStationConfig(null);
    expect(mockedFetch).toHaveBeenCalledWith({
      service: 'JSON',
      name: 'NodeFM',
      identifier: getStationQdnIdentifier(),
    });
    expect(getStationLoaded()).toBe(true);
  });

  it('does not turn a node outage into a fresh unconfigured station', async () => {
    mockedFetch.mockRejectedValue(new Error('node unavailable'));
    await loadStationConfig('Owner');
    expect(getStationLoaded()).toBe(false);
    expect(getStationError()).toContain('node unavailable');
    expect(mockedSearch).not.toHaveBeenCalled();
  });

  it('rejects a configuration pointing at another publisher', async () => {
    mockedFetch.mockResolvedValue(stationPayload({ publisherName: 'Other' }));
    await loadStationConfig('Owner');
    expect(getStation()).toBeNull();
    expect(getStationError()).toMatch(/publisher does not match/);
  });

  it('rejects an owner address that does not own the publishing name', async () => {
    mockedFetch.mockResolvedValue(stationPayload());
    vi.mocked(resolveNameWalletAddress).mockResolvedValue('Q-somebody-else');
    await loadStationConfig('Owner');
    expect(getStationLoaded()).toBe(false);
    expect(getStationError()).toMatch(/owner does not match/);
  });

  it('does not treat a missing name after finding config as missing config', async () => {
    mockedFetch.mockResolvedValue(stationPayload());
    vi.mocked(resolveNameWalletAddress).mockRejectedValue(new Error('name not found'));
    await loadStationConfig('Owner');
    expect(getStationLoaded()).toBe(false);
    expect(getStationError()).toContain('name not found');
  });

  it('rejects a malformed station record', async () => {
    mockedFetch.mockResolvedValue({ stationId: 'station-1', name: '' });
    await loadStationConfig('Owner');
    expect(getStationLoaded()).toBe(false);
    expect(getStationError()).toMatch(/invalid nodefm station configuration/i);
  });

  it('ignores a late result after switching the deployment publisher', async () => {
    let finish!: (value: unknown) => void;
    mockedFetch.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const old = loadStationConfig('Owner');
    mockedFetch.mockResolvedValueOnce(
      stationPayload({ publisherName: 'NewStation', stationId: 'new' }),
    );
    await loadStationConfig('NewStation');
    finish(stationPayload());
    await old;
    expect(getStation()?.stationId).toBe('new');
  });

  it('retains the existing station serialization boundary for the publication phase', async () => {
    mockedPublish.mockResolvedValue({ accepted: true } as never);
    const station = createStation({
      name: 'NodeFM',
      publisherName: 'Owner',
      ownerAddress: 'Q-owner',
      timezone: 'Europe/Helsinki',
      defaultRotationPlaylistId: 'p1',
      defaultRotationPlaylistVersionId: 'v1',
      stationEpochUtc: '2026-01-01T00:00:00Z',
      messagingEnabled: false,
      tipsEnabled: false,
    });
    await saveStationConfig(station, 'Owner');
    expect(mockedPublish).toHaveBeenCalledWith(
      expect.objectContaining({
        service: 'JSON',
        name: 'Owner',
        identifier: getStationQdnIdentifier(),
      }),
    );
    expect(getStation()?.stationId).toBe(station.stationId);
  });
});
