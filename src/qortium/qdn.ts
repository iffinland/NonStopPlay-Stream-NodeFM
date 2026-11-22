/** Qortal QDN resources. Publication lives at the verified Hub boundary. */
import { sendBridgeRequest } from './bridge';
import type { QdnResourceRef } from '../types/domain';
import { requireAccountWrite } from './accountWriteGate';
import { QdnResourceReadError, isConfirmedQdnNotFoundError } from './qdnReadError';
export * from './qortalPublishing';

// ── Search ──────────────────────────────────────────────────────────

export type QdnSearchParams = {
  service?: string;
  name?: string;
  query?: string;
  mode?: 'ALL' | 'LATEST';
  limit?: number;
  includeMetadata?: boolean;
  includeStatus?: boolean;
  prefix?: boolean;
  exactMatchNames?: boolean;
};

export type QdnResourceInfo = {
  name: string;
  service: string;
  identifier?: string;
  size?: number;
  created?: number;
  updated?: number;
  metadata?: {
    title?: string;
    description?: string;
    category?: string;
    tags?: string[];
    mimeType?: string;
  };
  status?: {
    status: string;
    percentLoaded?: number;
    localChunkCount?: number;
    totalChunkCount?: number;
  };
};

/**
 * Search QDN resources. Compatible with the Qortium Home bridge
 * SEARCH_QDN_RESOURCES action.
 */
export async function searchQdnResources(params: QdnSearchParams): Promise<QdnResourceInfo[]> {
  const payload: Record<string, unknown> = {
    action: 'SEARCH_QDN_RESOURCES',
    mode: params.mode ?? 'ALL',
    limit: params.limit ?? 50,
  };

  if (params.service) payload.service = params.service;
  if (params.name) payload.name = params.name;
  if (params.query) payload.query = params.query;
  if (params.includeMetadata) payload.includeMetadata = true;
  if (params.includeStatus) payload.includeStatus = true;
  if (params.prefix) payload.prefix = true;
  if (params.exactMatchNames) payload.exactMatchNames = true;

  return sendBridgeRequest(payload) as Promise<QdnResourceInfo[]>;
}

// ── List ────────────────────────────────────────────────────────────

/**
 * List QDN resources. Compatible with the Qortium Home bridge
 * LIST_QDN_RESOURCES action.
 */
export async function listQdnResources(params: QdnSearchParams): Promise<QdnResourceInfo[]> {
  const payload: Record<string, unknown> = {
    action: 'LIST_QDN_RESOURCES',
    limit: params.limit ?? 50,
  };

  if (params.service) payload.service = params.service;
  if (params.name) payload.name = params.name;
  if (params.includeMetadata) payload.includeMetadata = true;
  if (params.includeStatus) payload.includeStatus = true;

  return sendBridgeRequest(payload) as Promise<QdnResourceInfo[]>;
}

// ── Resource Metadata ───────────────────────────────────────────────

export type QdnResourceMetadata = {
  title?: string;
  description?: string;
  category?: string;
  tags?: string[];
  mimeType?: string;
  size?: number;
  created?: number;
  updated?: number;
};

export async function getQdnResourceMetadata(ref: QdnResourceRef): Promise<QdnResourceMetadata> {
  return sendBridgeRequest({
    action: 'GET_QDN_RESOURCE_METADATA',
    service: ref.service,
    name: ref.name,
    ...(ref.identifier ? { identifier: ref.identifier } : {}),
  }) as Promise<QdnResourceMetadata>;
}

// ── Resource Status ─────────────────────────────────────────────────

export type QdnResourceStatus = {
  status: string;
  percentLoaded?: number;
  localChunkCount?: number;
  totalChunkCount?: number;
};

export async function getQdnResourceStatus(
  ref: QdnResourceRef,
  build = false,
): Promise<QdnResourceStatus> {
  return sendBridgeRequest({
    action: 'GET_QDN_RESOURCE_STATUS',
    service: ref.service,
    name: ref.name,
    ...(build ? { build: true } : {}),
    ...(ref.identifier ? { identifier: ref.identifier } : {}),
  }) as Promise<QdnResourceStatus>;
}

const QDN_READY_STATUS = 'READY';
const QDN_BUILDABLE_STATUSES = new Set(['PUBLISHED', 'DOWNLOADING', 'DOWNLOADED', 'BUILDING']);
const QDN_MISSING_STATUSES = new Set([
  'MISSING',
  'NOT_FOUND',
  'NOT PUBLISHED',
  'NOT_PUBLISHED',
  'DOES_NOT_EXIST',
]);

function normalizeQdnStatus(value: unknown): string {
  if (typeof value === 'string') {
    return value.toUpperCase();
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { status?: unknown }).status === 'string'
  ) {
    return (value as { status: string }).status.toUpperCase();
  }

  return '';
}

/**
 * Wait for a QDN resource to become READY.
 *
 * Mirrors the proven readiness-polling pattern from the current
 * discussion-boards-reference (`ensureQdnResourceReady`) and
 * qortium-boards (`waitForQdnResourceReady`): check status, trigger a build
 * once for buildable states, then poll until READY or an explicit terminal
 * state. Never turns uncertainty into a valid ready state.
 */
export async function ensureQdnResourceReady(
  ref: QdnResourceRef,
  options: { retries?: number; delayMs?: number } = {},
): Promise<void> {
  const retries = options.retries ?? 8;
  const delayMs = options.delayMs ?? 1200;

  let status = '';

  try {
    status = normalizeQdnStatus(await getQdnResourceStatus(ref));
  } catch (error) {
    if (isConfirmedQdnNotFoundError(error)) {
      throw new QdnResourceReadError(
        'NOT_FOUND',
        `QDN resource does not exist: ${ref.service}/${ref.name}/${ref.identifier ?? 'default'}`,
        error,
      );
    }

    status = '';
  }

  if (status === QDN_READY_STATUS) {
    return;
  }

  if (QDN_MISSING_STATUSES.has(status)) {
    throw new QdnResourceReadError(
      'NOT_FOUND',
      `QDN resource does not exist: ${ref.service}/${ref.name}/${ref.identifier ?? 'default'}`,
    );
  }

  if (QDN_BUILDABLE_STATUSES.has(status)) {
    try {
      await getQdnResourceStatus(ref, true);
    } catch {
      // Build requests can race; polling below resolves the eventual state.
    }
  }

  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      status = normalizeQdnStatus(await getQdnResourceStatus(ref));
    } catch (error) {
      if (isConfirmedQdnNotFoundError(error)) {
        throw new QdnResourceReadError(
          'NOT_FOUND',
          `QDN resource does not exist: ${ref.service}/${ref.name}/${ref.identifier ?? 'default'}`,
          error,
        );
      }

      status = '';
    }

    if (status === QDN_READY_STATUS) {
      return;
    }

    if (QDN_MISSING_STATUSES.has(status)) {
      throw new QdnResourceReadError(
        'NOT_FOUND',
        `QDN resource does not exist: ${ref.service}/${ref.name}/${ref.identifier ?? 'default'}`,
      );
    }

    if (attempt < retries - 1) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, delayMs);
      });
    }
  }

  throw new Error(
    `QDN resource is not ready: ${ref.service}/${ref.name}/${ref.identifier ?? 'default'}`,
  );
}

// ── Resource URL ────────────────────────────────────────────────────

/**
 * Validate the current Qortium Home GET_QDN_RESOURCE_URL contract.
 *
 * Current Home returns the render URL as a raw string, not an
 * `{ url: string }` envelope.
 */
export function requireQdnResourceUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('GET_QDN_RESOURCE_URL did not return a resource URL string.');
  }

  return value;
}

/**
 * Get the ordinary render URL for a QDN resource.
 * Media playback should use getQdnResourceStreamUrl() instead so Home can
 * provide the platform-appropriate ranged stream transport.
 */
export async function getQdnResourceUrl(ref: QdnResourceRef): Promise<string> {
  const result = await sendBridgeRequest({
    action: 'GET_QDN_RESOURCE_URL',
    service: ref.service,
    name: ref.name,
    ...(ref.identifier ? { identifier: ref.identifier } : {}),
  });

  return requireQdnResourceUrl(result);
}

/** Validate the current Qortium Home media stream URL contract. */
export function requireQdnResourceStreamUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('GET_QDN_RESOURCE_STREAM_URL did not return a resource URL string.');
  }

  return value;
}

/** Resolve the Qortal resource endpoint used by audio and image elements. */
export async function getQdnResourceStreamUrl(ref: QdnResourceRef): Promise<string> {
  // Qortal's resource endpoint supplies Range/206; Home's stream action does not exist.
  return getQdnResourceUrl(ref);
}

export type QdnBackgroundAudioItem = {
  artist?: string;
  durationMs: number;
  endPositionMs: number;
  expectedStartUtcMs: number;
  mediaId: string;
  resource: QdnResourceRef;
  title: string;
};

export type QdnBackgroundAudioStatus = {
  currentIndex: number;
  currentPositionMs: number;
  hasQueue: boolean;
  isPlaying: boolean;
  mediaId: string | null;
  playbackState: 'idle' | 'buffering' | 'ready' | 'ended';
  playWhenReady: boolean;
};

export async function supportsQdnBackgroundAudio(): Promise<boolean> {
  // Only foreground playback is in scope for the Qortal version.
  return false;
}

export async function setQdnBackgroundAudioQueue(
  items: readonly QdnBackgroundAudioItem[],
  startPositionMs: number,
): Promise<QdnBackgroundAudioStatus> {
  return sendBridgeRequest({
    action: 'SET_QDN_BACKGROUND_AUDIO_QUEUE',
    items: items.map((item) => ({
      artist: item.artist,
      durationMs: item.durationMs,
      endPositionMs: item.endPositionMs,
      expectedStartUtcMs: item.expectedStartUtcMs,
      mediaId: item.mediaId,
      service: item.resource.service,
      name: item.resource.name,
      ...(item.resource.identifier ? { identifier: item.resource.identifier } : {}),
      title: item.title,
    })),
    playWhenReady: true,
    startIndex: 0,
    startPositionMs: Math.max(0, Math.round(startPositionMs)),
  });
}

export async function controlQdnBackgroundAudio(
  command: 'pause' | 'play' | 'stop',
): Promise<QdnBackgroundAudioStatus> {
  return sendBridgeRequest({ action: 'CONTROL_QDN_BACKGROUND_AUDIO', command });
}

export async function getQdnBackgroundAudioStatus(): Promise<QdnBackgroundAudioStatus> {
  return sendBridgeRequest({ action: 'GET_QDN_BACKGROUND_AUDIO_STATUS' });
}

// ── Delete Resource ─────────────────────────────────────────────────

export async function deleteQdnResource(ref: QdnResourceRef): Promise<unknown> {
  await requireAccountWrite('DELETE_QDN_RESOURCE');

  return sendBridgeRequest({
    action: 'DELETE_QDN_RESOURCE',
    service: ref.service,
    name: ref.name,
    ...(ref.identifier ? { identifier: ref.identifier } : {}),
  });
}

// ── Fetch Resource ──────────────────────────────────────────────────

/**
 * Canonical decoder for the current Qortium Home FETCH_QDN_RESOURCE
 * contract.
 *
 * Home's `fetchNodeApiPayload` returns the node response `data` directly:
 * - already parsed JSON (objects, arrays, or JSON primitives);
 * - raw string content for non-JSON bodies or when JSON parsing fails;
 * - `null` for an empty body.
 *
 * This decoder normalizes those cases without inventing `{ body }` or
 * `{ data }` envelopes. Malformed JSON-looking strings fail explicitly
 * rather than being passed through as valid content.
 */
export function decodeQdnResourcePayload(value: unknown): unknown {
  if (value === null || value === undefined) {
    throw new Error('QDN resource payload is empty.');
  }

  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error('QDN resource payload is empty.');
  }

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.parse(trimmed) as unknown;
    } catch (error) {
      throw new Error(
        `QDN resource payload is malformed JSON: ${
          error instanceof Error ? error.message : 'parse failed'
        }`,
      );
    }
  }

  return value;
}

/**
 * Fetch a QDN resource and decode it with the current production
 * contract. Use this for bounded whole-resource reads such as JSON
 * metadata records.
 */
export async function fetchQdnResourceData(ref: QdnResourceRef): Promise<unknown> {
  let result: unknown;

  try {
    result = await sendBridgeRequest({
      action: 'FETCH_QDN_RESOURCE',
      service: ref.service,
      name: ref.name,
      ...(ref.identifier ? { identifier: ref.identifier } : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'QDN resource fetch failed.';

    throw new QdnResourceReadError(
      isConfirmedQdnNotFoundError(error) ? 'NOT_FOUND' : 'UNAVAILABLE',
      message,
      error,
    );
  }

  try {
    return decodeQdnResourcePayload(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'QDN resource payload is malformed.';

    throw new QdnResourceReadError('MALFORMED', message, error);
  }
}
