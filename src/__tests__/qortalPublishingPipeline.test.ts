import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  publishUploadMediaResources,
  publishUploadTrackMetadata,
} from '../features/library/services/uploadService';
import { createTrack } from '../features/tracks/services/trackService';
import {
  addPlaylist,
  publishPlaylistVersion,
  getPlaylistById,
  resetPlaylistStore,
} from '../features/playlists/services/playlistStore';
import { createStation } from '../features/station/services/stationService';
import {
  saveStationConfig,
  getStation,
  resetStationStore,
} from '../features/station/services/stationStore';
import { refreshAuth } from '../qortium/auth';
import { resolvePublishAudioDuration } from '../utils/localAudioDuration';

function wav() {
  const bytes = new Uint8Array(44 + 16000);
  const view = new DataView(bytes.buffer);
  const str = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i);
  };
  str(0, 'RIFF');
  view.setUint32(4, bytes.length - 8, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true);
  view.setUint32(28, 16000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  str(36, 'data');
  view.setUint32(40, 16000, true);
  return new File([bytes], 'one-second.wav', { type: 'audio/wav' });
}
afterEach(() => {
  vi.unstubAllGlobals();
  refreshAuth();
  resetPlaylistStore();
  resetStationStore();
});
describe('Qortal publishing domain pipeline with the production bridge', () => {
  it('reads local audio duration and publishes media, track, playlist version and station', async () => {
    const stored = new Map<string, unknown>();
    const actions: string[] = [];
    const request = vi.fn(async (p: Record<string, unknown>) => {
      actions.push(String(p.action));
      if (p.action === 'GET_USER_ACCOUNT') return { address: 'Q-owner' };
      if (p.action === 'GET_NAME_DATA') return { owner: 'Q-owner' };
      const store = (r: Record<string, unknown>) => {
        const key = String(r.identifier);
        stored.set(
          key,
          r.data64 ? JSON.parse(Buffer.from(String(r.data64), 'base64').toString('utf8')) : r.file,
        );
        return {
          signature: `signature-${stored.size}`,
          service: r.service === 'AUDIO' ? 600 : r.service === 'PLAYLIST' ? 910 : 1110,
          name: r.name,
          identifier: r.identifier,
        };
      };
      if (p.action === 'PUBLISH_QDN_RESOURCE') return store(p);
      if (p.action === 'PUBLISH_MULTIPLE_QDN_RESOURCES')
        return (p.resources as Record<string, unknown>[]).map(store);
      throw new Error(`Unexpected request ${p.action}`);
    });
    vi.stubGlobal('window', { qortalRequest: request });
    refreshAuth();
    resetPlaylistStore();
    resetStationStore();
    const file = wav();
    const durationMs = await resolvePublishAudioDuration(file);
    expect(durationMs).toBe(1000);
    expect(actions).toEqual([]);
    const media = await publishUploadMediaResources({
      publisherName: 'Owner',
      audioIdentifier: 'nodefm-audio-test',
      audioFile: file,
      title: 'Test song',
    });
    expect(media.audioPublished).toBe(true);
    const track = createTrack({
      title: 'Õhtune lugu',
      audio: { service: 'AUDIO', name: 'Owner', identifier: 'nodefm-audio-test' },
      durationMs,
      source: 'station-upload',
      ownerAddress: 'Q-owner',
    });
    await publishUploadTrackMetadata(track, 'Owner');
    const playlist = await addPlaylist(
      { title: 'Rotation', ownerAddress: 'Q-owner', visibility: 'public' },
      'Owner',
    );
    const version = await publishPlaylistVersion(
      {
        playlistId: playlist.playlistId,
        createdBy: 'Q-owner',
        tracks: [{ trackId: track.trackId, durationMs }],
      },
      'Owner',
    );
    expect(version.ok).toBe(true);
    if (!version.ok) throw new Error(version.error);
    expect(getPlaylistById(playlist.playlistId)?.latestVersionId).toBe(version.version.versionId);
    const station = createStation({
      name: 'NodeFM',
      publisherName: 'Owner',
      ownerAddress: 'Q-owner',
      timezone: 'Europe/Helsinki',
      defaultRotationPlaylistId: playlist.playlistId,
      defaultRotationPlaylistVersionId: version.version.versionId,
      stationEpochUtc: '2026-11-22T00:00:00.000Z',
      messagingEnabled: false,
      tipsEnabled: false,
    });
    await saveStationConfig(station, 'Owner');
    expect(getStation()?.defaultRotationPlaylistVersionId).toBe(version.version.versionId);
    expect(stored.get('nodefm-station-config')).toMatchObject({
      name: 'NodeFM',
      defaultRotationPlaylistVersionId: version.version.versionId,
    });
    expect(stored.get(`nodefm-track-${track.trackId}`)).toMatchObject({
      title: 'Õhtune lugu',
      durationMs: 1000,
    });
    expect(stored.get('nodefm-audio-test')).toBe(file);
    expect(actions.some((action) => /STAGE|UNLOCK|SELECT_PUBLISH/.test(action))).toBe(false);
  });
});
