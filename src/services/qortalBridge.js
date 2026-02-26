import { MOCK_QDN_STATS, RADIO_SCHEDULE } from './mockData.js';
import { requestQortal, isQortalRequestAvailable } from './qortal/qortalClient.js';
import { getUserAccount } from './qortal/walletService.js';

const NODEFM_METADATA_SERVICE = 'DOCUMENT';
const NODEFM_AUDIO_SERVICE = 'AUDIO';
const NODEFM_IMAGE_SERVICE = 'IMAGE';
const NODEFM_AUDIO_IDENTIFIER_PREFIX = 'nodefm-audio-';
const NODEFM_PLAYLIST_IDENTIFIER_PREFIX = 'nodefm-playlist-';

const AUDIO_PUBLISH_TIMEOUT_MS = 15 * 60 * 1000;
const IMAGE_PUBLISH_TIMEOUT_MS = 5 * 60 * 1000;
const VERIFY_RETRIES = 5;
const VERIFY_DELAY_MS = 1500;
const PLAYLIST_SEARCH_LIMIT = 60;
const AUDIO_SEARCH_LIMIT = 100;

const createResourceId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const values = crypto.getRandomValues(new Uint32Array(1));
    return `${Date.now()}-${values[0].toString(16)}`;
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
};

const toSlug = (value) => {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 48);
};

const sleep = async (durationMs) => {
  await new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
};

const encodeBase64Json = (value) => {
  const json = JSON.stringify(value);
  const bytes = new TextEncoder().encode(json);
  let binary = '';

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary);
};

const decodeBase64Json = (value) => {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  const decoded = new TextDecoder().decode(bytes);
  return JSON.parse(decoded);
};

const resolveOwnerName = async (providedName) => {
  if (providedName && providedName.trim().length > 0) {
    return providedName.trim();
  }

  const account = await getUserAccount();

  if (account?.name && account.name.trim().length > 0) {
    return account.name.trim();
  }

  throw new Error('Authenticated user has no Qortal name. Register a name first.');
};

const publishMetadataResource = async ({ ownerName, identifier, title, description, tags, payload }) => {
  await requestQortal({
    action: 'PUBLISH_QDN_RESOURCE',
    service: NODEFM_METADATA_SERVICE,
    name: ownerName,
    identifier,
    title,
    description,
    tags,
    base64: encodeBase64Json(payload),
  });
};

const publishAudioResource = async (ownerName, identifier, file) => {
  await requestQortal(
    {
      action: 'PUBLISH_QDN_RESOURCE',
      service: NODEFM_AUDIO_SERVICE,
      name: ownerName,
      identifier,
      filename: file.name,
      file,
    },
    {
      timeoutMs: AUDIO_PUBLISH_TIMEOUT_MS,
    },
  );
};

const publishImageResource = async (ownerName, identifier, file) => {
  await requestQortal(
    {
      action: 'PUBLISH_QDN_RESOURCE',
      service: NODEFM_IMAGE_SERVICE,
      name: ownerName,
      identifier,
      filename: file.name,
      file,
    },
    {
      timeoutMs: IMAGE_PUBLISH_TIMEOUT_MS,
    },
  );
};

const verifyMetadataPublication = async (ownerName, identifier, expectedType) => {
  for (let attempt = 1; attempt <= VERIFY_RETRIES; attempt += 1) {
    try {
      const raw = await requestQortal({
        action: 'FETCH_QDN_RESOURCE',
        service: NODEFM_METADATA_SERVICE,
        name: ownerName,
        identifier,
      });

      const parsed = parseMetadataPayload(raw);

      if (parsed && parsed.type === expectedType) {
        return;
      }
    } catch {
      // Retry until exhausted.
    }

    if (attempt < VERIFY_RETRIES) {
      await sleep(VERIFY_DELAY_MS);
    }
  }

  throw new Error('Publish submitted but metadata could not be verified on QDN yet. Please retry in a minute.');
};

const parseMetadataPayload = (raw) => {
  let parsed = raw;

  if (typeof raw === 'string') {
    const trimmed = raw.trim();

    if (!trimmed) {
      return null;
    }

    try {
      parsed = JSON.parse(trimmed);
    } catch {
      try {
        parsed = decodeBase64Json(trimmed);
      } catch {
        return null;
      }
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  return parsed;
};

const normalizePlaylistPayload = (raw) => {
  const parsed = parseMetadataPayload(raw);

  if (!parsed || parsed.type !== 'nodefm-playlist' || !Array.isArray(parsed.tracks)) {
    return null;
  }

  const tracks = parsed.tracks
    .map((track) => {
      if (!track || typeof track !== 'object') {
        return null;
      }

      const title = typeof track.title === 'string' ? track.title : null;
      const artist = typeof track.artist === 'string' ? track.artist : 'Unknown Artist';
      const duration = Number.isFinite(Number(track.duration)) ? Number(track.duration) : 0;
      const url = typeof track.url === 'string' ? track.url : null;

      if (!title || !url) {
        return null;
      }

      return {
        title,
        artist,
        duration,
        url,
      };
    })
    .filter(Boolean);

  if (!tracks.length) {
    return null;
  }

  return {
    name: (typeof parsed.name === 'string' && parsed.name.trim()) || 'Untitled NodeFM Playlist',
    createdAt: Number.isFinite(Number(parsed.createdAt)) ? Number(parsed.createdAt) : 0,
    tracks,
  };
};

const normalizeAudioPayload = (raw, fallbackName = '') => {
  const parsed = parseMetadataPayload(raw);

  if (!parsed || parsed.type !== 'nodefm-audio' || !parsed.audio || typeof parsed.audio !== 'object') {
    return null;
  }

  const title = typeof parsed.title === 'string' ? parsed.title.trim() : '';
  const audio = parsed.audio;

  if (!title || typeof audio.identifier !== 'string' || typeof audio.name !== 'string') {
    return null;
  }

  const thumbnail =
    parsed.thumbnail && typeof parsed.thumbnail === 'object'
      ? {
          service:
            typeof parsed.thumbnail.service === 'string' ? parsed.thumbnail.service : NODEFM_IMAGE_SERVICE,
          identifier: typeof parsed.thumbnail.identifier === 'string' ? parsed.thumbnail.identifier : '',
          name: typeof parsed.thumbnail.name === 'string' ? parsed.thumbnail.name : fallbackName || audio.name,
          filename: typeof parsed.thumbnail.filename === 'string' ? parsed.thumbnail.filename : '',
        }
      : null;

  return {
    title,
    createdAt: Number.isFinite(Number(parsed.createdAt)) ? Number(parsed.createdAt) : 0,
    updatedAt: Number.isFinite(Number(parsed.updatedAt)) ? Number(parsed.updatedAt) : 0,
    duration: Number.isFinite(Number(parsed.duration)) ? Number(parsed.duration) : 0,
    artist: typeof parsed.artist === 'string' && parsed.artist.trim() ? parsed.artist.trim() : audio.name,
    audio: {
      service: typeof audio.service === 'string' ? audio.service : NODEFM_AUDIO_SERVICE,
      identifier: audio.identifier,
      name: audio.name,
      filename: typeof audio.filename === 'string' ? audio.filename : '',
    },
    thumbnail:
      thumbnail && thumbnail.identifier
        ? thumbnail
        : null,
  };
};

export async function fetchSchedule() {
  if (isQortalRequestAvailable()) {
    try {
      const response = await requestQortal({
        action: 'GET_RADIO_SCHEDULE',
        service: 'nodefm',
      });

      if (response && response.startTime && Array.isArray(response.tracks)) {
        return response;
      }

      console.warn('NodeFM Qortal Mode: Invalid schedule response, using mock data.');
      return RADIO_SCHEDULE;
    } catch (error) {
      console.warn('NodeFM Qortal Mode: Schedule API failed, using mock data.', error);
      return RADIO_SCHEDULE;
    }
  }

  console.warn('NodeFM Dev Mode: Using Mock Data');
  return RADIO_SCHEDULE;
}

export async function fetchQdnStats() {
  if (isQortalRequestAvailable()) {
    try {
      const response = await requestQortal({
        action: 'GET_NODEFM_STATS',
        service: 'nodefm',
      });

      if (response && typeof response === 'object') {
        return {
          totalSongsQdn: Number(response.totalSongsQdn || response.totalSongs || 0),
          totalPlaylists: Number(response.totalPlaylists || 0),
          totalDuration: Number(response.totalDuration || 0),
        };
      }
    } catch {
      // Fallback to mock stats in unsupported environments.
    }
  }

  return MOCK_QDN_STATS;
}

export async function uploadToQdn({ ownerName, title, audioFile, coverFile }) {
  const resolvedOwnerName = await resolveOwnerName(ownerName);
  const resourceId = createResourceId();
  const audioIdentifier = `${NODEFM_AUDIO_IDENTIFIER_PREFIX}${resourceId}`;
  const thumbnailIdentifier = `${audioIdentifier}-thumb`;
  const metadataIdentifier = `${audioIdentifier}-meta`;

  if (!audioFile) {
    throw new Error('Audio file is required.');
  }

  if (!isQortalRequestAvailable()) {
    await sleep(850);
    return {
      success: true,
      mock: true,
      identifier: audioIdentifier,
    };
  }

  await publishAudioResource(resolvedOwnerName, audioIdentifier, audioFile);

  let publishedThumbnail = false;
  if (coverFile) {
    try {
      await publishImageResource(resolvedOwnerName, thumbnailIdentifier, coverFile);
      publishedThumbnail = true;
    } catch (error) {
      console.warn('[nodefm] thumbnail publish failed, continuing without thumbnail', error);
    }
  }

  const payload = {
    version: 1,
    type: 'nodefm-audio',
    title,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    audio: {
      service: NODEFM_AUDIO_SERVICE,
      identifier: audioIdentifier,
      name: resolvedOwnerName,
      filename: audioFile.name,
    },
    thumbnail:
      coverFile && publishedThumbnail
        ? {
            service: NODEFM_IMAGE_SERVICE,
            identifier: thumbnailIdentifier,
            name: resolvedOwnerName,
            filename: coverFile.name,
          }
        : null,
  };

  await publishMetadataResource({
    ownerName: resolvedOwnerName,
    identifier: metadataIdentifier,
    title,
    description: 'NodeFM audio publish',
    tags: ['nodefm', 'audio', 'radio'],
    payload,
  });

  await verifyMetadataPublication(resolvedOwnerName, metadataIdentifier, 'nodefm-audio');

  return {
    success: true,
    identifier: audioIdentifier,
    metadataIdentifier,
  };
}

export async function publishPlaylistToQdn({ ownerName, playlistName, tracks }) {
  const resolvedOwnerName = await resolveOwnerName(ownerName);

  if (!Array.isArray(tracks) || !tracks.length) {
    throw new Error('Cannot publish an empty playlist.');
  }

  const playlistSlug = toSlug(playlistName) || 'playlist';
  const identifier = `${NODEFM_PLAYLIST_IDENTIFIER_PREFIX}${playlistSlug}-${Date.now()}`;
  const now = Date.now();

  if (!isQortalRequestAvailable()) {
    throw new Error('Qortal request interface is required for playlist publishing.');
  }

  const payload = {
    version: 1,
    type: 'nodefm-playlist',
    name: playlistName,
    createdAt: now,
    updatedAt: now,
    tracks: tracks.map((track, index) => ({
      order: index + 1,
      title: track.title,
      artist: track.artist,
      duration: track.duration,
      url: track.url,
    })),
  };

  await publishMetadataResource({
    ownerName: resolvedOwnerName,
    identifier,
    title: playlistName,
    description: 'NodeFM playlist publish',
    tags: ['nodefm', 'playlist', 'radio'],
    payload,
  });

  await verifyMetadataPublication(resolvedOwnerName, identifier, 'nodefm-playlist');

  return {
    success: true,
    identifier,
  };
}

export async function updatePlaylistInQdn({ ownerName, identifier, playlistName, tracks, createdAt = 0 }) {
  const resolvedOwnerName = await resolveOwnerName(ownerName);

  if (!identifier || !identifier.startsWith(NODEFM_PLAYLIST_IDENTIFIER_PREFIX)) {
    throw new Error('Invalid playlist identifier.');
  }

  if (!Array.isArray(tracks) || !tracks.length) {
    throw new Error('Cannot publish an empty playlist.');
  }

  if (!isQortalRequestAvailable()) {
    throw new Error('Qortal request interface is required for playlist updates.');
  }

  const now = Date.now();
  const payload = {
    version: 1,
    type: 'nodefm-playlist',
    name: playlistName,
    createdAt: Number.isFinite(Number(createdAt)) && Number(createdAt) > 0 ? Number(createdAt) : now,
    updatedAt: now,
    tracks: tracks.map((track, index) => ({
      order: index + 1,
      title: track.title,
      artist: track.artist,
      duration: track.duration,
      url: track.url,
    })),
  };

  await publishMetadataResource({
    ownerName: resolvedOwnerName,
    identifier,
    title: playlistName,
    description: 'NodeFM playlist update',
    tags: ['nodefm', 'playlist', 'radio'],
    payload,
  });

  await verifyMetadataPublication(resolvedOwnerName, identifier, 'nodefm-playlist');

  return {
    success: true,
    identifier,
  };
}

export async function fetchPublishedPlaylists(ownerName = '') {
  if (!isQortalRequestAvailable()) {
    return [];
  }

  const searchPayload = {
    action: 'SEARCH_QDN_RESOURCES',
    service: NODEFM_METADATA_SERVICE,
    identifier: NODEFM_PLAYLIST_IDENTIFIER_PREFIX,
    prefix: true,
    mode: 'ALL',
    reverse: true,
    limit: PLAYLIST_SEARCH_LIMIT,
    offset: 0,
  };

  if (ownerName) {
    searchPayload.name = ownerName;
  }

  const resources = await requestQortal(searchPayload);

  if (!Array.isArray(resources) || !resources.length) {
    return [];
  }

  const parsed = await Promise.all(
    resources.map(async (item) => {
      try {
        const raw = await requestQortal({
          action: 'FETCH_QDN_RESOURCE',
          service: NODEFM_METADATA_SERVICE,
          name: item.name,
          identifier: item.identifier,
        });

        const playlistPayload = normalizePlaylistPayload(raw);

        if (!playlistPayload) {
          return null;
        }

        return {
          id: `qdn:${item.name}:${item.identifier}`,
          identifier: item.identifier,
          ownerName: item.name,
          name: playlistPayload.name,
          createdAt: playlistPayload.createdAt || Number(item.created || 0),
          tracks: playlistPayload.tracks,
          source: 'qdn',
        };
      } catch {
        return null;
      }
    }),
  );

  return parsed.filter(Boolean);
}

export async function fetchPublishedAudioTracks(ownerName = '') {
  if (!isQortalRequestAvailable()) {
    return [];
  }

  const searchPayload = {
    action: 'SEARCH_QDN_RESOURCES',
    service: NODEFM_METADATA_SERVICE,
    identifier: NODEFM_AUDIO_IDENTIFIER_PREFIX,
    prefix: true,
    mode: 'ALL',
    reverse: true,
    limit: AUDIO_SEARCH_LIMIT,
    offset: 0,
  };

  if (ownerName) {
    searchPayload.name = ownerName;
  }

  const resources = await requestQortal(searchPayload);

  if (!Array.isArray(resources) || !resources.length) {
    return [];
  }

  const parsed = await Promise.all(
    resources.map(async (item) => {
      try {
        const raw = await requestQortal({
          action: 'FETCH_QDN_RESOURCE',
          service: NODEFM_METADATA_SERVICE,
          name: item.name,
          identifier: item.identifier,
        });

        const audioPayload = normalizeAudioPayload(raw, item.name);

        if (!audioPayload) {
          return null;
        }

        const fileNameSegment = audioPayload.audio.filename
          ? `/${encodeURIComponent(audioPayload.audio.filename)}`
          : '';
        const qdnUrl = `/arbitrary/${audioPayload.audio.service}/${audioPayload.audio.name}/${audioPayload.audio.identifier}${fileNameSegment}`;

        return {
          id: `audio:${item.name}:${item.identifier}`,
          identifier: item.identifier,
          ownerName: item.name,
          title: audioPayload.title,
          artist: audioPayload.artist || item.name,
          duration: audioPayload.duration || 0,
          createdAt: audioPayload.createdAt || Number(item.created || 0),
          audio: audioPayload.audio,
          thumbnail: audioPayload.thumbnail,
          url: qdnUrl,
          source: 'qdn',
        };
      } catch {
        return null;
      }
    }),
  );

  return parsed.filter(Boolean);
}
