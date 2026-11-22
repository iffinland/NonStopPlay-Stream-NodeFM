import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { webcrypto, createHash } from 'node:crypto';
import {
  initializeCollaboration,
  resetCollaboration,
  resolveMember,
  updateAdmins,
  getStationRole,
} from './collaborationService';
import { installStationAccess } from '../../qortium/stationAccess';
import {
  publishResource,
  fetchQdnResourceData,
  searchQdnResources,
  getQdnResourceUrl,
  getQdnResourceStatus,
  deleteQdnResource,
} from '../../qortium/qdn';
import { refreshAuth } from '../../qortium/auth';
import { clearIdentityCaches } from '../../qortium/identity';
import {
  createAndAddTrack,
  loadLibrary,
  resetLibrary,
  getLibraryTracks,
  removeTrackFromLibrary,
} from '../library/services/libraryService';
import {
  addPlaylist,
  publishPlaylistVersion,
  loadPlaylistStore,
  resetPlaylistStore,
  getPlaylists,
  getPlaylistVersions,
  deletePlaylistVersion,
} from '../playlists/services/playlistStore';
import { createStation } from '../station/services/stationService';
import {
  saveStationConfig,
  loadStationConfig,
  resetStationStore,
  getStation,
} from '../station/services/stationStore';
import {
  createScheduleEventAction,
  loadScheduleStore,
  resetScheduleStore,
  getScheduleEvents,
  getScheduleRecurrences,
  createScheduleRecurrenceAction,
  deleteScheduleRecurrenceAction,
  deleteScheduleEventAction,
  saveRecurringProgramAction,
  saveScheduledProgramAction,
} from '../scheduling/services/scheduleStore';
import { createNotice } from '../notices/services/noticeService';
import {
  saveNotice,
  loadNotices,
  resetNoticeStore,
  getNoticeRecords,
  getNoticeIncomplete,
  deleteNotice,
} from '../notices/services/noticeStore';
import { loadPublicPlaylists } from '../playlists/services/publicPlaylistService';
import { getScheduleEventQdnIdentifier } from '../scheduling/services/scheduleService';
import { publishUploadTrackBundle } from '../library/services/uploadService';
import { recurrencePeriodEnd } from '../scheduling/services/recurrenceCompiler';
import { QdnResourceReadError } from '../../qortium/qdnReadError';
import {
  createRequestShowDefinitionAction,
  materializeRequestShowOccurrenceAction,
  loadRequestShowOccurrencesForPublisher,
  loadRequestShowStore,
  resetRequestShowStore,
} from '../dynamic-programs/request-show/requestShowStore';
import {
  publishListenerPlaylist,
  resetListenerPlaylistStore,
} from '../listener-playlists/services/listenerPlaylistStore';
import { createListenerPlaylistDraft } from '../listener-playlists/services/listenerPlaylistService';
import { buildPlaylistShareTarget } from '../sharing/services/shareService';
import { createListenerTrackSubmission } from '../listener-submissions/services/submissionService';
import {
  publishSubmissionMetadata,
  loadListenerSubmissions,
  getSubmissionReviews,
  acceptSubmission,
  resetListenerSubmissionStore,
} from '../listener-submissions/services/submissionStore';

let actor = 'Q-owner';
let owners: Record<string, string>;
let data: Map<string, unknown>;
let writes: Record<string, unknown>[];
let delayed = false;
const resourceKey = (service: unknown, name: unknown, id: unknown) => `${service}/${name}/${id}`;
function fixture(p: Record<string, unknown>): unknown {
  const key = resourceKey(p.service, p.name, p.identifier ?? 'default');
  switch (p.action) {
    case 'GET_USER_ACCOUNT':
      return { address: actor };
    case 'GET_NAME_DATA':
      if (!owners[String(p.name)]) throw new Error('Name not registered');
      return { owner: owners[String(p.name)] };
    case 'GET_ACCOUNT_NAMES':
      return Object.entries(owners)
        .filter(([, address]) => address === p.address)
        .map(([name]) => ({ name }));
    case 'GET_QDN_RESOURCE_STATUS':
      return { status: data.has(key) ? 'READY' : 'NOT_PUBLISHED' };
    case 'FETCH_QDN_RESOURCE':
      if (!data.has(key)) throw new Error('Resource not found');
      return data.get(key);
    case 'GET_QDN_RESOURCE_URL':
      return `/arbitrary/${key}`;
    case 'SEARCH_QDN_RESOURCES':
    case 'LIST_QDN_RESOURCES':
      return [...data.keys()]
        .filter((key) => !p.name || key.split('/')[1] === p.name)
        .filter((key) => !p.service || key.startsWith(String(p.service) + '/'))
        .map((key) => {
          const [service, name, identifier] = key.split('/');
          return { service, name, identifier, created: 1, updated: 2 };
        })
        .filter((r) => !p.query || r.identifier.startsWith(String(p.query)))
        .slice(Number(p.offset ?? 0), Number(p.offset ?? 0) + Number(p.limit ?? 50));
    case 'PUBLISH_QDN_RESOURCE':
      return publish(p);
    case 'PUBLISH_MULTIPLE_QDN_RESOURCES':
      return (p.resources as Record<string, unknown>[]).map(publish);
    default:
      throw new Error(`Unexpected action ${p.action}`);
  }
}
function publish(resource: Record<string, unknown>) {
  if (owners[String(resource.name)] !== actor) throw new Error('Invalid name owner');
  writes.push(resource);
  const content = resource.data64
    ? ['DOCUMENT', 'JSON', 'PLAYLIST'].includes(String(resource.service))
      ? JSON.parse(Buffer.from(String(resource.data64), 'base64').toString())
      : Buffer.from(String(resource.data64), 'base64')
    : resource.file;
  if (!(delayed && /^nodefm-team-[a-f0-9]+$/.test(String(resource.identifier))))
    data.set(resourceKey(resource.service, resource.name, resource.identifier), content);
  return {
    signature: `sig-${writes.length}`,
    name: resource.name,
    identifier: resource.identifier,
    service: (
      { DOCUMENT: 800, JSON: 1110, AUDIO: 600, IMAGE: 400, PLAYLIST: 910 } as Record<string, number>
    )[String(resource.service)],
  };
}
beforeEach(() => {
  actor = 'Q-owner';
  owners = { Station: 'Q-owner', Editor: 'Q-editor', Stranger: 'Q-stranger' };
  data = new Map();
  writes = [];
  delayed = false;
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('window', {
    _qdnName: 'Station',
    _qdnBase: '',
    qortalRequest: vi.fn(async (p: Record<string, unknown>) => fixture(p)),
  });
  resetCollaboration();
  refreshAuth();
  initializeCollaboration();
  clearIdentityCaches();
  resetLibrary();
  resetPlaylistStore();
  resetStationStore();
  resetScheduleStore();
  resetNoticeStore();
  resetListenerSubmissionStore();
  resetRequestShowStore();
  resetListenerPlaylistStore();
});
afterEach(() => {
  installStationAccess(null);
  resetCollaboration();
  refreshAuth();
  vi.unstubAllGlobals();
});
const input = (
  identifier = 'nodefm-track-song',
  value: unknown = { title: 'Shared song', ownerAddress: 'Q-owner' },
) => ({ service: 'JSON', name: 'Station', identifier, bytesBase64: btoa(JSON.stringify(value)) });
describe('Qortal station collaborators through the production publishing/read boundary', () => {
  it('accepts wallet lookup only when a registered name belongs to that address', async () => {
    const address = 'Q' + 'a'.repeat(33);
    await expect(resolveMember(address)).rejects.toThrow(/needs a registered/);
    owners.Editor = address;
    expect(await resolveMember(address)).toEqual({ name: 'Editor', address });
  });
  it('accepts listener music as the collaborator and reloads its moderation as the owner', async () => {
    await updateAdmins([{ name: 'Editor', address: 'Q-editor' }]);
    actor = 'Q-stranger';
    const submission = createListenerTrackSubmission({
      submissionId: 'guest-song',
      submitterName: 'Stranger',
      submitterAddress: actor,
      title: 'Guest song',
      durationMs: 120000,
      audio: {
        service: 'AUDIO',
        name: 'Stranger',
        identifier: 'nodefm-submission-audio-guest-song',
      },
    });
    await publishSubmissionMetadata(submission, 'Stranger');
    actor = 'Q-editor';
    await loadListenerSubmissions('Station', 'Q-owner');
    const review = getSubmissionReviews()[0];
    expect(review?.status).toBe('PENDING');
    await acceptSubmission(review, 'Station', actor, 'Q-owner');
    expect(writes.slice(-1)[0]).toMatchObject({ service: 'DOCUMENT', name: 'Editor' });
    actor = 'Q-owner';
    resetCollaboration();
    resetListenerSubmissionStore();
    await loadListenerSubmissions('Station', 'Q-owner');
    expect(getSubmissionReviews()[0]).toMatchObject({
      status: 'ACCEPTED',
      moderation: { decision: 'accepted' },
    });
    await expect(acceptSubmission(review, 'Station', 'Q-stranger', 'Q-owner')).rejects.toThrow(
      /not an authorized/,
    );
  });
  it('publishes real station domain objects as the collaborator and reconstructs them for listeners', async () => {
    await updateAdmins([{ name: 'Editor', address: 'Q-editor' }]);
    actor = 'Q-editor';
    const track = await createAndAddTrack(
      {
        title: 'Editor song',
        ownerAddress: 'Q-owner',
        source: 'qdn-existing',
        durationMs: 180000,
        audio: { service: 'AUDIO', name: 'Editor', identifier: 'music' },
      },
      'Station',
    );
    const playlist = await addPlaylist(
      { title: 'Team rotation', ownerAddress: 'Q-owner', visibility: 'public' },
      'Station',
    );
    const version = await publishPlaylistVersion(
      {
        playlistId: playlist.playlistId,
        createdBy: actor,
        tracks: [{ trackId: track.trackId, durationMs: track.durationMs }],
      },
      'Station',
    );
    expect(version.ok).toBe(true);
    if (!version.ok) throw new Error(version.error);
    const station = createStation({
      name: 'Team station',
      publisherName: 'Station',
      ownerAddress: 'Q-owner',
      timezone: 'UTC',
      defaultRotationPlaylistId: playlist.playlistId,
      defaultRotationPlaylistVersionId: version.version.versionId,
      stationEpochUtc: '2026-11-22T00:00:00.000Z',
      messagingEnabled: false,
      tipsEnabled: false,
    });
    await saveStationConfig(station, 'Station');
    const event = await createScheduleEventAction(
      {
        title: 'Team show',
        startUtc: '2026-11-23T12:00:00.000Z',
        endUtc: '2026-11-23T13:00:00.000Z',
        source: {
          type: 'playlist',
          playlistId: playlist.playlistId,
          playlistVersionId: version.version.versionId,
        },
      },
      'Station',
    );
    const notice = createNotice({ message: 'Shared notice' });
    await saveNotice(notice, 'Station', actor, 'Q-owner');
    expect(writes.slice(2).every((r) => r.name === 'Editor')).toBe(true);
    actor = 'Q-stranger';
    resetCollaboration();
    clearIdentityCaches();
    resetLibrary();
    resetPlaylistStore();
    resetStationStore();
    resetScheduleStore();
    resetNoticeStore();
    await loadLibrary('Station', 'Q-owner');
    await loadPlaylistStore('Station', 'Q-owner');
    await loadStationConfig('Station');
    await loadScheduleStore('Station', 'Q-owner');
    await loadNotices('Station');
    expect(getLibraryTracks()).toContainEqual(track);
    expect(getPlaylists()).toContainEqual(
      expect.objectContaining({
        playlistId: playlist.playlistId,
        latestVersionId: version.version.versionId,
      }),
    );
    expect(getStation()).toEqual(station);
    expect(getScheduleEvents()).toContainEqual(event);
    expect(getNoticeIncomplete()).toBe(false);
    expect(getNoticeRecords()).toContainEqual(expect.objectContaining({ notice }));
    const publicList = await loadPublicPlaylists('Station');
    expect(publicList.playlists).toContainEqual(
      expect.objectContaining({ playlistId: playlist.playlistId, versionStatus: 'ready' }),
    );
  });
  it('works when Hub renders from HTTP without SubtleCrypto', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'unique-grant' });
    await expect(updateAdmins([{ name: 'Editor', address: 'Q-editor' }])).resolves.toMatchObject({
      epoch: 1,
    });
    actor = 'Q-editor';
    await expect(publishResource(input())).resolves.toMatchObject({ accepted: true });
  });
  it('merges independent administrators and orders edits without trusting client clocks', async () => {
    await updateAdmins([
      { name: 'Editor', address: 'Q-editor' },
      { name: 'Stranger', address: 'Q-stranger' },
    ]);
    actor = 'Q-editor';
    await publishResource(input());
    actor = 'Q-stranger';
    await publishResource(input('nodefm-track-another', { title: 'Second' }));
    await publishResource(input('nodefm-track-song', { title: 'Revised' }));
    resetCollaboration();
    const list = await searchQdnResources({
      service: 'JSON',
      name: 'Station',
      query: 'nodefm-track-',
      prefix: true,
    });
    expect(list).toHaveLength(2);
    expect(
      await fetchQdnResourceData({
        service: 'JSON',
        name: 'Station',
        identifier: 'nodefm-track-song',
      }),
    ).toEqual({ title: 'Revised' });
  });
  it('does not claim success for an incomplete real batch or retry the signed request', async () => {
    await updateAdmins([{ name: 'Editor', address: 'Q-editor' }]);
    actor = 'Q-editor';
    const request = vi.mocked(
      Reflect.get(window, 'qortalRequest') as (p: Record<string, unknown>) => Promise<unknown>,
    );
    request.mockImplementation(async (p) =>
      p.action === 'PUBLISH_MULTIPLE_QDN_RESOURCES' ? [] : fixture(p),
    );
    const before = request.mock.calls.filter(
      ([p]) => p.action === 'PUBLISH_MULTIPLE_QDN_RESOURCES',
    ).length;
    await expect(publishResource(input())).rejects.toThrow(/outcome is unknown/);
    expect(
      request.mock.calls.filter(([p]) => p.action === 'PUBLISH_MULTIPLE_QDN_RESOURCES'),
    ).toHaveLength(before + 1);
  });
  it('resolves names, grants only the chosen address, and lets the editor publish under its own name', async () => {
    expect(await resolveMember('Editor')).toEqual({ name: 'Editor', address: 'Q-editor' });
    await updateAdmins([{ name: 'Editor', address: 'Q-editor' }]);
    actor = 'Q-editor';
    expect((await getStationRole(actor, true)).canManage).toBe(true);
    const result = await publishResource(input());
    expect(result.accepted).toBe(true);
    expect(writes.slice(-1)[0]).toMatchObject({ name: 'Editor', service: 'DOCUMENT' });
    expect(
      await fetchQdnResourceData({
        service: 'JSON',
        name: 'Station',
        identifier: 'nodefm-track-song',
      }),
    ).toEqual({ title: 'Shared song', ownerAddress: 'Q-owner' });
    expect(
      await searchQdnResources({
        service: 'JSON',
        name: 'Station',
        query: 'nodefm-track-',
        prefix: true,
      }),
    ).toContainEqual(expect.objectContaining({ name: 'Station', identifier: 'nodefm-track-song' }));
    await expect(updateAdmins([])).rejects.toThrow(/Only the APP owner/);
    await expect(publishResource(input('nodefm-station-admins-v1', {}))).rejects.toThrow();
  });
  it('does not grant station management to unrelated wallets', async () => {
    await updateAdmins([{ name: 'Editor', address: 'Q-editor' }]);
    actor = 'Q-stranger';
    const before = writes.length;
    expect((await getStationRole(actor, true)).canManage).toBe(false);
    await expect(publishResource(input())).rejects.toThrow();
    expect(writes).toHaveLength(before);
  });
  it('freezes accepted changes on removal and ignores subsequent edits by the former administrator', async () => {
    await updateAdmins([{ name: 'Editor', address: 'Q-editor' }]);
    actor = 'Q-editor';
    await publishResource(input());
    actor = 'Q-owner';
    await updateAdmins([]);
    const key = [...data.keys()].find((k) => /^DOCUMENT\/Editor\/nodefm-team-[a-f0-9]+$/.test(k))!;
    const stale = data.get(key) as { records: Record<string, { data: unknown }> };
    for (const r of Object.values(stale.records)) r.data = { title: 'Unauthorized replacement' };
    resetCollaboration();
    actor = 'Q-editor';
    expect((await getStationRole(actor, true)).canManage).toBe(false);
    await expect(publishResource(input())).rejects.toThrow();
    expect(
      await fetchQdnResourceData({
        service: 'JSON',
        name: 'Station',
        identifier: 'nodefm-track-song',
      }),
    ).toEqual({ title: 'Shared song', ownerAddress: 'Q-owner' });
  });
  it('keeps media aliases when metadata follows before QDN indexes the first manifest', async () => {
    await updateAdmins([{ name: 'Editor', address: 'Q-editor' }]);
    actor = 'Q-editor';
    delayed = true;
    const file = new File(['audio'], 'song.mp3', { type: 'audio/mpeg' });
    await publishResource({
      service: 'AUDIO',
      name: 'Station',
      identifier: 'nodefm-audio-song',
      file,
    });
    delayed = false;
    await publishResource(input());
    resetCollaboration();
    expect(
      await getQdnResourceUrl({
        service: 'AUDIO',
        name: 'Station',
        identifier: 'nodefm-audio-song',
      }),
    ).toBe('/arbitrary/AUDIO/Editor/nodefm-audio-song');
    expect(
      await fetchQdnResourceData({
        service: 'JSON',
        name: 'Station',
        identifier: 'nodefm-track-song',
      }),
    ).toMatchObject({ title: 'Shared song' });
  });
  it('ignores malformed collaborator data so it cannot lock the owner out of removal', async () => {
    await updateAdmins([{ name: 'Editor', address: 'Q-editor' }]);
    actor = 'Q-editor';
    await publishResource(input());
    const key = [...data.keys()].find((k) => /^DOCUMENT\/Editor\/nodefm-team-[a-f0-9]+$/.test(k))!;
    data.set(key, { schemaVersion: 1, station: 'Station', author: 'Fake owner', epoch: 1 });
    resetCollaboration();
    actor = 'Q-owner';
    await expect(updateAdmins([])).resolves.toMatchObject({ admins: [] });
  });
  it('rejects a registry with an owner that does not match the registered APP name', async () => {
    data.set('JSON/Station/nodefm-station-admins-v1', {
      schemaVersion: 1,
      station: 'Station',
      owner: 'Q-stranger',
      epoch: 1,
      admins: [],
    });
    await expect(getStationRole('Q-stranger', true)).rejects.toThrow(
      /Invalid station access registry/,
    );
  });
});

describe('durable Qortal station removals', () => {
  const ref = { service: 'JSON', name: 'Station', identifier: 'nodefm-track-song' };
  it.each([false, true])(
    'hides legacy metadata after a cold reopen (collaborators: %s)',
    async (team) => {
      data.set(resourceKey(ref.service, ref.name, ref.identifier), { title: 'Legacy song' });
      if (team) {
        await updateAdmins([{ name: 'Editor', address: 'Q-editor' }]);
        actor = 'Q-editor';
      }
      expect(await deleteQdnResource(ref)).toMatchObject({
        accepted: true,
        transactionSignature: expect.any(String),
      });
      expect(data.has(resourceKey(ref.service, ref.name, ref.identifier))).toBe(true);
      expect(writes[writes.length - 1]).toMatchObject({
        service: 'DOCUMENT',
        name: team ? 'Editor' : 'Station',
      });
      resetCollaboration();
      actor = 'Q-stranger';
      expect(
        await searchQdnResources({
          service: 'JSON',
          name: 'Station',
          query: 'nodefm-track-',
          prefix: true,
        }),
      ).toEqual([]);
      await expect(fetchQdnResourceData(ref)).rejects.toMatchObject({ code: 'NOT_FOUND' });
      await expect(getQdnResourceUrl(ref)).rejects.toBeInstanceOf(QdnResourceReadError);
      expect(await getQdnResourceStatus(ref)).toEqual({ status: 'NOT_PUBLISHED' });
    },
  );
  it('carries removal markers through revocation and ignores the removed member', async () => {
    await updateAdmins([{ name: 'Editor', address: 'Q-editor' }]);
    actor = 'Q-editor';
    await publishResource(input());
    await deleteQdnResource(ref);
    actor = 'Q-owner';
    await updateAdmins([]);
    resetCollaboration();
    actor = 'Q-editor';
    const before = writes.length;
    await expect(deleteQdnResource(ref)).rejects.toThrow(/revoked/);
    await expect(publishResource(input())).rejects.toThrow();
    expect(writes).toHaveLength(before);
    await expect(fetchQdnResourceData(ref)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it('can explicitly republish a removed record with a newer revision', async () => {
    await deleteQdnResource(ref);
    await publishResource(input());
    resetCollaboration();
    expect(await fetchQdnResourceData(ref)).toMatchObject({ title: 'Shared song' });
  });
  it('makes a removal win over a concurrent edit at the same revision', async () => {
    await updateAdmins([
      { name: 'Editor', address: 'Q-editor' },
      { name: 'Stranger', address: 'Q-stranger' },
    ]);
    actor = 'Q-editor';
    await deleteQdnResource(ref);
    const manifestKey = [...data.keys()].find((k) =>
      /^DOCUMENT\/Editor\/nodefm-team-[a-f0-9]+$/.test(k),
    )!;
    const removed = data.get(manifestKey) as {
      records: Record<string, Record<string, unknown>>;
      grantId: string;
      author: string;
    };
    const edit = structuredClone(removed);
    edit.author = 'Q-stranger';
    edit.grantId = (await getStationRole(actor)).registry.admins.find(
      (m) => m.address === edit.author,
    )!.grantId;
    for (const record of Object.values(edit.records)) {
      delete record.deleted;
      record.author = edit.author;
      record.data = { title: 'Concurrent edit' };
    }
    data.set(manifestKey.replace('/Editor/', '/Stranger/'), edit);
    resetCollaboration();
    await expect(fetchQdnResourceData(ref)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it('keeps the local library when the signed removal outcome is unknown and sends once', async () => {
    const track = await createAndAddTrack(
      {
        title: 'Keep me',
        ownerAddress: 'Q-owner',
        source: 'qdn-existing',
        durationMs: 120000,
        audio: { service: 'AUDIO', name: 'Station', identifier: 'music' },
      },
      'Station',
    );
    const request = vi.mocked(
      Reflect.get(window, 'qortalRequest') as (p: Record<string, unknown>) => Promise<unknown>,
    );
    request.mockImplementation(async (p) =>
      p.action === 'PUBLISH_MULTIPLE_QDN_RESOURCES' ? [] : fixture(p),
    );
    request.mockClear();
    await expect(removeTrackFromLibrary(track.trackId, 'Station')).rejects.toThrow(/unknown/);
    expect(getLibraryTracks()).toContainEqual(track);
    expect(
      request.mock.calls.filter(([p]) => p.action === 'PUBLISH_MULTIPLE_QDN_RESOURCES'),
    ).toHaveLength(1);
    expect(request.mock.calls.some(([p]) => p.action === 'DELETE_QDN_RESOURCE')).toBe(false);
  });
  it('removes tracks, notices and one-off events through real stores, then reconstructs as a listener', async () => {
    await updateAdmins([{ name: 'Editor', address: 'Q-editor' }]);
    actor = 'Q-editor';
    const track = await createAndAddTrack(
      {
        title: 'Remove me',
        ownerAddress: 'Q-owner',
        source: 'qdn-existing',
        durationMs: 120000,
        audio: { service: 'AUDIO', name: 'Station', identifier: 'music' },
      },
      'Station',
    );
    const notice = createNotice({ message: 'Temporary notice' });
    await saveNotice(notice, 'Station', actor, 'Q-owner');
    const event = await createScheduleEventAction(
      {
        title: 'Cancelled show',
        startUtc: '2026-11-23T12:00:00.000Z',
        endUtc: '2026-11-23T13:00:00.000Z',
        source: { type: 'playlist', playlistId: 'p', playlistVersionId: 'v' },
      },
      'Station',
    );
    await removeTrackFromLibrary(track.trackId, 'Station');
    await deleteNotice(notice.noticeId, 'Station', actor, 'Q-owner');
    await deleteScheduleEventAction(event.eventId, 'Station');
    resetCollaboration();
    resetLibrary();
    resetNoticeStore();
    resetScheduleStore();
    actor = 'Q-stranger';
    await loadLibrary('Station', 'Q-owner');
    await loadNotices('Station');
    await loadScheduleStore('Station', 'Q-owner');
    expect(getLibraryTracks()).toEqual([]);
    expect(getNoticeRecords()).toEqual([]);
    expect(getScheduleEvents()).toEqual([]);
  });
  it('deletes a recurring show and every future occurrence durably', async () => {
    const now = Date.parse('2026-11-23T00:00:00.000Z');
    const recurrence = await createScheduleRecurrenceAction(
      {
        ownerAddress: 'Q-owner',
        title: 'Daily',
        source: { type: 'playlist', playlistId: 'p', playlistVersionId: 'v' },
        timezone: 'Europe/Helsinki',
        frequency: 'daily',
        localStartTime: '20:00',
        durationMs: 1800000,
        activeFromLocalDate: '2026-11-23',
        activeUntilLocalDate: '2026-11-25',
      },
      'Station',
      now,
    );
    const events = getScheduleEvents();
    expect(events).toHaveLength(3);
    expect(
      await deleteScheduleRecurrenceAction(recurrence.recurrenceId, 'Station', now),
    ).toMatchObject({ status: 'deleted' });
    resetCollaboration();
    resetScheduleStore();
    actor = 'Q-stranger';
    await loadScheduleStore('Station', 'Q-owner');
    expect(getScheduleRecurrences()).toEqual([]);
    expect(getScheduleEvents()).toEqual([]);
    for (const event of events)
      await expect(
        fetchQdnResourceData({ ...ref, identifier: getScheduleEventQdnIdentifier(event.eventId) }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it('never writes removal data from an unrelated wallet, including before admins are configured', async () => {
    actor = 'Q-stranger';
    await expect(deleteQdnResource(ref)).rejects.toThrow(/revoked/);
    expect(writes).toEqual([]);
  });
});

describe('remaining Qortal port integration', () => {
  it('publishes a collaborator Request Show and reuses its exact lineup for another account', async () => {
    await updateAdmins([{ name: 'Editor', address: 'Q-editor' }]);
    actor = 'Q-editor';
    const track = await createAndAddTrack(
      {
        title: 'Request song',
        ownerAddress: 'Q-owner',
        source: 'qdn-existing',
        durationMs: 120000,
        audio: { service: 'AUDIO', name: 'Editor', identifier: 'music' },
      },
      'Station',
    );
    const definition = await createRequestShowDefinitionAction(
      { title: 'Requests', targetDurationMs: 1800000 },
      'Station',
    );
    const event = await createScheduleEventAction(
      {
        title: 'Requests',
        startUtc: '2026-11-23T12:00:00.000Z',
        endUtc: '2026-11-23T12:30:00.000Z',
        source: { type: 'dynamic-program', programDefinitionId: definition.programDefinitionId },
      },
      'Station',
    );
    const occurrence = await materializeRequestShowOccurrenceAction(
      event,
      definition,
      [track],
      [],
      '2026-11-22T00:00:00.000Z',
      'Station',
    );
    resetCollaboration();
    resetRequestShowStore();
    actor = 'Q-owner';
    expect(await loadRequestShowOccurrencesForPublisher('Station')).toEqual([occurrence]);
    await loadRequestShowStore('Station', 'Q-owner');
    const before = writes.length;
    expect(
      await materializeRequestShowOccurrenceAction(
        event,
        definition,
        [track],
        [],
        '2026-11-23T00:00:00.000Z',
        'Station',
      ),
    ).toEqual(occurrence);
    expect(writes).toHaveLength(before);
  });
  it('keeps listener public/private playlists under their own name, independent of station membership', async () => {
    await updateAdmins([{ name: 'Editor', address: 'Q-editor' }]);
    const track = await createAndAddTrack(
      {
        title: 'Station song',
        ownerAddress: 'Q-owner',
        source: 'qdn-existing',
        durationMs: 120000,
        audio: { service: 'AUDIO', name: 'Station', identifier: 'music' },
      },
      'Station',
    );
    actor = 'Q-stranger';
    const before = writes.length;
    for (const visibility of ['public', 'private'] as const) {
      const draft = createListenerPlaylistDraft({
        title: visibility,
        ownerAddress: actor,
        ownerName: 'Stranger',
        visibility,
      });
      expect(
        await publishListenerPlaylist(draft, [
          { trackId: track.trackId, durationMs: track.durationMs },
        ]),
      ).toMatchObject({ ok: true });
    }
    expect(
      writes.slice(before).every((r) => r.name === 'Stranger' && r.service !== 'DOCUMENT'),
    ).toBe(true);
    resetCollaboration();
    resetListenerPlaylistStore();
    actor = 'Q-editor';
    const publicList = await loadPublicPlaylists('Station');
    expect(publicList.status).toBe('complete');
    expect(publicList.playlists).toHaveLength(1);
    expect(publicList.playlists[0]).toMatchObject({
      title: 'public',
      publisherName: 'Stranger',
      kind: 'listener',
      versionStatus: 'ready',
    });
    expect(
      buildPlaylistShareTarget(
        publicList.playlists[0].playlistId,
        { _qdnName: 'Station', _qdnService: 'APP', _qdnIdentifier: 'default' },
        { publisherName: 'Stranger', playlistKind: 'listener' },
      ),
    ).toBe(
      `qortal://APP/Station/playlists/${publicList.playlists[0].playlistId}?publisher=Stranger&kind=listener`,
    );
  });
  it('round-trips station records above 25 KiB through DOCUMENT without oversized JSON transactions', async () => {
    const value = { title: 'Long metadata', detail: 'x'.repeat(40 * 1024) };
    await publishResource(input('nodefm-playlist-version-large', value));
    expect(writes[writes.length - 1]).toMatchObject({ service: 'DOCUMENT', name: 'Station' });
    expect(writes.every((r) => r.service !== 'JSON')).toBe(true);
    resetCollaboration();
    actor = 'Q-stranger';
    expect(
      await fetchQdnResourceData({
        service: 'JSON',
        name: 'Station',
        identifier: 'nodefm-playlist-version-large',
      }),
    ).toEqual(value);
    const before = writes.length;
    await expect(
      publishResource({ ...input('nodefm-lp-ver-large', value), name: 'Stranger' }),
    ).rejects.toThrow(/25 KiB/);
    expect(writes).toHaveLength(before);
  });
  it('rejects oversized station documents before sending media or metadata', async () => {
    const before = writes.length;
    await expect(
      publishResource({
        service: 'JSON',
        name: 'Station',
        identifier: 'nodefm-playlist-version-huge',
        file: new File([JSON.stringify({ detail: 'x'.repeat(16 * 1024 * 1024) })], 'large.json'),
      }),
    ).rejects.toThrow(/16 MiB/);
    expect(writes).toHaveLength(before);
  });
});

describe('complete discovery and playlist deletion safety', () => {
  it('reconstructs all legacy station pages and filters removed rows from every page', async () => {
    for (let i = 0; i < 430; i++)
      data.set(`JSON/Station/nodefm-track-${i}`, { title: `Legacy ${i}` });
    await deleteQdnResource({ service: 'JSON', name: 'Station', identifier: 'nodefm-track-420' });
    resetCollaboration();
    const rows = await searchQdnResources({
      service: 'JSON',
      name: 'Station',
      query: 'nodefm-track-',
      prefix: true,
      limit: 50,
    });
    expect(rows).toHaveLength(429);
    expect(rows.some((r) => r.identifier === 'nodefm-track-420')).toBe(false);
    expect(rows.some((r) => r.identifier === 'nodefm-track-429')).toBe(true);
  });
  it('fails discovery explicitly when a node repeats a full page', async () => {
    for (let i = 0; i < 200; i++)
      data.set(`JSON/Station/nodefm-track-${i}`, { title: `Legacy ${i}` });
    const request = vi.mocked(
      Reflect.get(window, 'qortalRequest') as (p: Record<string, unknown>) => Promise<unknown>,
    );
    request.mockImplementation(async (p) =>
      fixture(p.action === 'SEARCH_QDN_RESOURCES' ? { ...p, offset: 0 } : p),
    );
    await expect(
      searchQdnResources({
        service: 'JSON',
        name: 'Station',
        query: 'nodefm-track-',
        prefix: true,
      }),
    ).rejects.toThrow(/discovery could not complete/);
    expect(writes).toEqual([]);
  });
  it('blocks referenced versions and unknown reference reads, then removes an unused historical version', async () => {
    const playlist = await addPlaylist(
      { title: 'History', ownerAddress: 'Q-owner', visibility: 'public' },
      'Station',
    );
    const first = await publishPlaylistVersion(
      {
        playlistId: playlist.playlistId,
        createdBy: actor,
        tracks: [{ trackId: 'song', durationMs: 120000 }],
      },
      'Station',
    );
    const second = await publishPlaylistVersion(
      {
        playlistId: playlist.playlistId,
        createdBy: actor,
        tracks: [{ trackId: 'song', durationMs: 120000 }],
      },
      'Station',
    );
    if (!first.ok || !second.ok) throw new Error('Expected published versions');
    const station = createStation({
      name: 'History',
      publisherName: 'Station',
      ownerAddress: actor,
      timezone: 'UTC',
      defaultRotationPlaylistId: playlist.playlistId,
      defaultRotationPlaylistVersionId: first.version.versionId,
      stationEpochUtc: '2026-11-22T00:00:00.000Z',
      messagingEnabled: false,
      tipsEnabled: false,
    });
    await saveStationConfig(station, 'Station');
    await expect(deletePlaylistVersion(first.version.versionId, 'Station', actor)).rejects.toThrow(
      /still referenced/,
    );
    await saveStationConfig(
      { ...station, defaultRotationPlaylistVersionId: second.version.versionId },
      'Station',
    );
    const request = vi.mocked(
      Reflect.get(window, 'qortalRequest') as (p: Record<string, unknown>) => Promise<unknown>,
    );
    request.mockImplementation(async (p) => {
      if (p.action === 'SEARCH_QDN_RESOURCES' && p.query === 'nodefm-schedule-')
        throw new QdnResourceReadError('UNAVAILABLE', 'temporarily unavailable');
      return fixture(p);
    });
    const before = writes.length;
    await expect(deletePlaylistVersion(first.version.versionId, 'Station', actor)).rejects.toThrow(
      /unavailable/,
    );
    expect(writes).toHaveLength(before);
    request.mockImplementation(async (p) => fixture(p));
    await deletePlaylistVersion(first.version.versionId, 'Station', actor);
    resetCollaboration();
    resetPlaylistStore();
    actor = 'Q-stranger';
    await loadPlaylistStore('Station', 'Q-owner');
    expect(getPlaylistVersions(playlist.playlistId).map((v) => v.versionId)).toEqual([
      second.version.versionId,
    ]);
    expect(getPlaylists()).toContainEqual(
      expect.objectContaining({ latestVersionId: second.version.versionId }),
    );
  });
});

describe('one approval per complete station action', () => {
  function signedBatches() {
    const request = vi.mocked(
      Reflect.get(window, 'qortalRequest') as (p: Record<string, unknown>) => Promise<unknown>,
    );
    return request.mock.calls
      .map(([p]) => p)
      .filter((p) => p.action === 'PUBLISH_MULTIPLE_QDN_RESOURCES');
  }
  it('saves two months of daily Request Shows and lineups as one physical batch', async () => {
    const now = Date.parse('2026-11-23T00:00:00.000Z');
    const track = await createAndAddTrack(
      {
        title: 'Song',
        ownerAddress: actor,
        source: 'qdn-existing',
        durationMs: 120000,
        audio: { service: 'AUDIO', name: 'Station', identifier: 'music' },
      },
      'Station',
    );
    const definition = await createRequestShowDefinitionAction(
      { title: 'Likes', targetDurationMs: 900000 },
      'Station',
    );
    const before = signedBatches().length;
    const recurrence = await saveRecurringProgramAction(
      {
        ownerAddress: actor,
        title: 'Likes',
        timezone: 'Europe/Helsinki',
        frequency: 'daily',
        localStartTime: '16:00',
        durationMs: 900000,
        activeFromLocalDate: '2026-11-23',
        activeUntilLocalDate: recurrencePeriodEnd('2026-11-23', 2),
        source: { type: 'dynamic-program', programDefinitionId: definition.programDefinitionId },
      },
      'Station',
      now,
      undefined,
      {
        definition,
        tracks: [track],
        ranking: [{ trackId: track.trackId, likeCount: 1, likerAddresses: ['Q-listener'] }],
      },
    );
    expect(signedBatches()).toHaveLength(before + 1);
    expect(signedBatches()[before].resources as unknown[]).toHaveLength(1);
    expect(getScheduleEvents()).toHaveLength(61);
    expect(recurrence.activeUntilLocalDate).toBe('2027-01-22');
    resetCollaboration();
    resetScheduleStore();
    resetRequestShowStore();
    actor = 'Q-stranger';
    await loadScheduleStore('Station', 'Q-owner');
    expect(getScheduleEvents()).toHaveLength(61);
    expect(await loadRequestShowOccurrencesForPublisher('Station')).toHaveLength(61);
  });
  it('saves an explicit one-month end when no end was supplied, and removes the series in one approval', async () => {
    const now = Date.parse('2026-11-23T00:00:00.000Z');
    const recurrence = await saveRecurringProgramAction(
      {
        ownerAddress: actor,
        title: 'Bounded',
        timezone: 'UTC',
        frequency: 'daily',
        localStartTime: '16:00',
        durationMs: 900000,
        activeFromLocalDate: '2026-11-23',
        source: { type: 'playlist', playlistId: 'p', playlistVersionId: 'v' },
      },
      'Station',
      now,
    );
    expect(recurrence.activeUntilLocalDate).toBe('2026-12-22');
    expect(getScheduleEvents()).toHaveLength(30);
    const before = signedBatches().length;
    await deleteScheduleRecurrenceAction(recurrence.recurrenceId, 'Station', now);
    expect(signedBatches()).toHaveLength(before + 1);
    resetCollaboration();
    resetScheduleStore();
    await loadScheduleStore('Station', 'Q-owner');
    expect(getScheduleEvents()).toEqual([]);
  });
  it('publishes audio, cover and Track metadata with one Hub request and three physical resources', async () => {
    const before = signedBatches().length;
    const track = await publishUploadTrackBundle(
      {
        publisherName: 'Station',
        audioIdentifier: 'nodefm-audio-bundle',
        audioFile: new File(['audio'], 'song.mp3', { type: 'audio/mpeg' }),
        title: 'Bundle',
        cover: {
          publisherName: 'Station',
          title: 'Bundle',
          file: new File(['image'], 'cover.png', { type: 'image/png' }),
          bytesBase64: btoa('image'),
        },
      },
      { title: 'Bundle', ownerAddress: actor, durationMs: 120000, source: 'station-upload' },
    );
    expect(signedBatches()).toHaveLength(before + 1);
    expect(
      (signedBatches()[before].resources as { service: string }[]).map((r) => r.service),
    ).toEqual(['AUDIO', 'IMAGE', 'DOCUMENT']);
    resetCollaboration();
    resetLibrary();
    await loadLibrary('Station', 'Q-owner');
    expect(getLibraryTracks()).toContainEqual(track);
  });
  it('uses one owner-signed access document for membership and frozen content', async () => {
    const before = writes.length;
    await updateAdmins([{ name: 'Editor', address: 'Q-editor' }]);
    expect(writes.slice(before)).toHaveLength(1);
    expect(writes[before]).toMatchObject({
      service: 'DOCUMENT',
      name: 'Station',
      identifier: 'nodefm-station-access-v2',
    });
    resetCollaboration();
    actor = 'Q-editor';
    expect((await getStationRole(actor)).canManage).toBe(true);
  });
  it('publishes a single Request Show event and its lineup together', async () => {
    const track = await createAndAddTrack(
      {
        title: 'Song',
        ownerAddress: actor,
        source: 'qdn-existing',
        durationMs: 120000,
        audio: { service: 'AUDIO', name: 'Station', identifier: 'music' },
      },
      'Station',
    );
    const definition = await createRequestShowDefinitionAction(
      { title: 'Likes', targetDurationMs: 900000 },
      'Station',
    );
    const before = signedBatches().length;
    await saveScheduledProgramAction(
      {
        startUtc: '2026-11-23T12:00:00.000Z',
        endUtc: '2026-11-23T12:15:00.000Z',
        source: { type: 'dynamic-program', programDefinitionId: definition.programDefinitionId },
      },
      'Station',
      undefined,
      { definition, tracks: [track], ranking: [] },
    );
    expect(signedBatches()).toHaveLength(before + 1);
    resetCollaboration();
    resetRequestShowStore();
    expect(await loadRequestShowOccurrencesForPublisher('Station')).toHaveLength(1);
  });
});

it('loads the RC.6 access registry/checkpoint and migrates membership in one approval without losing metadata', async () => {
  await publishResource(input());
  const records = (
    data.get(
      [...data.keys()].find((k) => /^DOCUMENT\/Station\/nodefm-team-[a-f0-9]+$/.test(k))!,
    ) as { records: unknown }
  ).records;
  const checkpoint = { schemaVersion: 1, station: 'Station', records };
  data.set('DOCUMENT/Station/legacy-checkpoint', checkpoint);
  data.set('JSON/Station/nodefm-station-admins-v1', {
    schemaVersion: 1,
    station: 'Station',
    owner: 'Q-owner',
    epoch: 1,
    admins: [],
    checkpoint: {
      name: 'Station',
      identifier: 'legacy-checkpoint',
      hash: createHash('sha256').update(JSON.stringify(checkpoint)).digest('hex'),
    },
  });
  resetCollaboration();
  expect(
    await fetchQdnResourceData({
      service: 'JSON',
      name: 'Station',
      identifier: 'nodefm-track-song',
    }),
  ).toMatchObject({ title: 'Shared song' });
  const before = writes.length;
  await updateAdmins([{ name: 'Editor', address: 'Q-editor' }]);
  expect(writes.slice(before)).toHaveLength(1);
  resetCollaboration();
  actor = 'Q-editor';
  expect((await getStationRole(actor)).canManage).toBe(true);
  expect(
    await fetchQdnResourceData({
      service: 'JSON',
      name: 'Station',
      identifier: 'nodefm-track-song',
    }),
  ).toMatchObject({ title: 'Shared song' });
});
it('shows the actual failed physical-resource reason while keeping the whole station outcome uncertain', async () => {
  const request = vi.mocked(
    Reflect.get(window, 'qortalRequest') as (p: Record<string, unknown>) => Promise<unknown>,
  );
  request.mockImplementation(async (p) =>
    p.action === 'PUBLISH_MULTIPLE_QDN_RESOURCES'
      ? {
          message: 'Some resources failed',
          error: {
            unsuccessfulPublishes: [
              {
                name: 'Station',
                service: 'DOCUMENT',
                identifier: 'manifest',
                reason: 'Invalid data from node',
              },
            ],
          },
        }
      : fixture(p),
  );
  await expect(publishResource(input())).rejects.toMatchObject({
    code: 'PUBLICATION_UNKNOWN',
    message: expect.stringContaining('Invalid data from node'),
  });
  expect(
    request.mock.calls.filter(([p]) => p.action === 'PUBLISH_MULTIPLE_QDN_RESOURCES'),
  ).toHaveLength(1);
});
