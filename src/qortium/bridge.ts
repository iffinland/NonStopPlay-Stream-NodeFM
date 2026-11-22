/** Qortal Core's injected Q-App transport. Kept at the existing import boundary. */
import { isConfirmedQdnNotFoundError } from './qdnReadError';
import { beginStartupRequest } from '../services/perf/startupDiagnostics';

type RequestPayload = Record<string, unknown>;
type RequestFunction = (payload: RequestPayload) => Promise<unknown> | unknown;
type TimedRequestFunction = (
  payload: RequestPayload,
  timeout: number,
) => Promise<unknown> | unknown;

// Core declares these as global lexical bindings, not window properties.
declare const qortalRequest: RequestFunction | undefined;
declare const qortalRequestWithTimeout: TimedRequestFunction | undefined;

export type BridgeSource = 'globalThis' | 'window';
export type BridgeResolution =
  | {
      status: 'AVAILABLE';
      source: BridgeSource;
      bridge: { request: RequestFunction; requestWithTimeout?: TimedRequestFunction };
    }
  | { status: 'UNAVAILABLE' | 'MALFORMED' | 'INACCESSIBLE'; source?: BridgeSource };
export class QortalResponseError extends Error {
  constructor(
    detail: string,
    readonly response: unknown,
  ) {
    super(detail);
    this.name = 'QortalResponseError';
  }
}

export type BridgeErrorCode =
  | 'BRIDGE_UNAVAILABLE'
  | 'BRIDGE_MALFORMED'
  | 'BRIDGE_INACCESSIBLE'
  | 'REQUEST_TIMEOUT'
  | 'REQUEST_FAILED'
  | 'ACTION_UNSUPPORTED';

export class QortalBridgeError extends Error {
  constructor(
    readonly code: BridgeErrorCode,
    detail: string,
  ) {
    super(`[${code}] ${detail}`);
    this.name = 'QortalBridgeError';
  }
}
// Retain the old export while later port phases replace their platform imports.
export { QortalBridgeError as QortiumBridgeError };

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function resolveBridge(): BridgeResolution {
  try {
    if (typeof qortalRequest === 'function') {
      return {
        status: 'AVAILABLE',
        source: 'globalThis',
        bridge: {
          request: qortalRequest,
          requestWithTimeout:
            typeof qortalRequestWithTimeout === 'function' ? qortalRequestWithTimeout : undefined,
        },
      };
    }
    // Some hosts expose properties instead. Never use a parent frame's bridge:
    // its app identity and authorization context belong to a different frame.
    if (typeof window !== 'undefined') {
      const request = Reflect.get(window, 'qortalRequest');
      if (typeof request === 'function') {
        const timed = Reflect.get(window, 'qortalRequestWithTimeout');
        return {
          status: 'AVAILABLE',
          source: 'window',
          bridge: { request, requestWithTimeout: typeof timed === 'function' ? timed : undefined },
        };
      }
      if (request != null) return { status: 'MALFORMED', source: 'window' };
    }
    return { status: 'UNAVAILABLE' };
  } catch {
    return { status: 'INACCESSIBLE' };
  }
}

export function isBridgeAvailable(): boolean {
  return resolveBridge().status === 'AVAILABLE';
}

// ── Request ─────────────────────────────────────────────────────────

const REQUEST_TIMEOUT_MS = 120_000;
// Allow Hub approval and large-file upload time without retrying signed writes.
const WRITE_REQUEST_TIMEOUT_MS = 3_600_000;
const AUTH_REQUEST_TIMEOUT_MS = 300_000;
// Only ported signed actions are permitted; never send Home payloads to Hub.

const BRIDGE_WAIT_MS = 4_000;
const BRIDGE_POLL_MS = 200;
const READ_RETRY_COUNT = 2;
const READ_RETRY_DELAY_MS = 500;

/**
 * Read actions that are safe to retry on transient failure.
 * Matches the working set from the reference implementation.
 */
const READ_ACTIONS = new Set([
  'FETCH_QDN_RESOURCE',
  'SEARCH_QDN_RESOURCES',
  'LIST_QDN_RESOURCES',
  'GET_QDN_RESOURCE_STATUS',
  'GET_QDN_RESOURCE_PROPERTIES',
  'GET_QDN_RESOURCE_METADATA',
  'GET_QDN_RESOURCE_URL',
  'SHOW_ACTIONS',
  'GET_ACCOUNT_DATA',
  'GET_ACCOUNT_NAMES',
  'GET_NAME_DATA',
  'GET_BALANCE',
]);

const SUPPORTED_ACTIONS = new Set([
  ...READ_ACTIONS,
  'GET_USER_ACCOUNT',
  'OPEN_NEW_TAB',
  'PUBLISH_QDN_RESOURCE',
  'PUBLISH_MULTIPLE_QDN_RESOURCES',
]);

function sleep(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

/**
 * Wait up to BRIDGE_WAIT_MS for the bridge to become available.
 * The q-apps.js script may still be initializing during early page load.
 */
async function waitForBridge(): Promise<Extract<BridgeResolution, { status: 'AVAILABLE' }>> {
  const immediate = resolveBridge();

  if (immediate.status === 'AVAILABLE') {
    return immediate;
  }

  let latest: BridgeResolution = immediate;
  const startedAt = Date.now();

  while (Date.now() - startedAt < BRIDGE_WAIT_MS) {
    await sleep(BRIDGE_POLL_MS);
    latest = resolveBridge();

    if (latest.status === 'AVAILABLE') {
      return latest;
    }
  }

  throw toBridgeError(latest);
}

function toBridgeError(
  resolution: Exclude<BridgeResolution, { status: 'AVAILABLE' }>,
): QortalBridgeError {
  if (resolution.status === 'MALFORMED') {
    return new QortalBridgeError(
      'BRIDGE_MALFORMED',
      'Qortal bridge is present but not a function.',
    );
  }

  if (resolution.status === 'INACCESSIBLE') {
    return new QortalBridgeError(
      'BRIDGE_INACCESSIBLE',
      'Qortal bridge scope is inaccessible (cross-origin).',
    );
  }

  return new QortalBridgeError(
    'BRIDGE_UNAVAILABLE',
    'Open this app through Qortal Hub to connect to QDN.',
  );
}

function parseRequestError(response: unknown, action: string): string | null {
  if (response === null || response === undefined) {
    return 'Qortal request returned an empty response.';
  }

  if (typeof response === 'string') {
    const trimmed = response.trim();

    if (!trimmed) {
      return 'Qortal request returned an empty response.';
    }

    if (trimmed.toLowerCase() === 'false' || trimmed.toLowerCase().startsWith('error')) {
      return trimmed;
    }

    return null;
  }

  if (!isRecord(response)) {
    return null;
  }

  if (response.error && typeof response.error === 'object')
    return typeof response.message === 'string' ? response.message : 'Qortal request failed.';

  if (typeof response.error === 'number' && Number.isInteger(response.error)) {
    const message =
      typeof response.message === 'string' && response.message.trim()
        ? response.message.trim()
        : `QDN request failed with error ${response.error}.`;

    return `QDN error ${response.error}: ${message}`;
  }

  if (typeof response.error === 'string' && response.error.trim()) {
    const errorCode = response.error.trim();
    const message =
      typeof response.message === 'string' && response.message.trim()
        ? response.message.trim()
        : null;

    if (/^\d+$/.test(errorCode) && message) {
      return `QDN error ${errorCode}: ${message}`;
    }

    return errorCode;
  }

  if (response.error === true || response.success === false) {
    return 'Qortal request failed.';
  }

  // A successful FETCH_QDN_RESOURCE payload is domain data. A valid
  // StationNotice (and other future JSON records) can legitimately have a
  // top-level `message` field, so do not interpret that field as a transport
  // error on this read action. Explicit error/success flags above still win.
  if (
    action !== 'FETCH_QDN_RESOURCE' &&
    typeof response.message === 'string' &&
    response.message.trim()
  ) {
    return response.message;
  }

  return null;
}

function toRequestError(value: unknown, action: string): Error {
  if (value instanceof Error) {
    return value;
  }

  const parsedError = parseRequestError(value, action);
  if (parsedError) {
    return new QortalResponseError(parsedError, value);
  }

  if (isRecord(value)) {
    const message =
      typeof value.message === 'string' && value.message.trim()
        ? value.message.trim()
        : JSON.stringify(value);

    return new Error(message);
  }

  return new QortalBridgeError('REQUEST_FAILED', `Qortal request ${action} failed.`);
}

/** Call Core's actual injected request function; retry only safe reads. */
export async function sendBridgeRequest<T = unknown>(request: Record<string, unknown>): Promise<T> {
  const action = typeof request.action === 'string' ? request.action : 'UNKNOWN_ACTION';
  if (!SUPPORTED_ACTIONS.has(action)) {
    throw new QortalBridgeError(
      'ACTION_UNSUPPORTED',
      `${action} is not available in this Qortal version yet.`,
    );
  }
  const maxAttempts = READ_ACTIONS.has(action) ? READ_RETRY_COUNT + 1 : 1;
  const timeoutMs =
    action === 'GET_USER_ACCOUNT'
      ? AUTH_REQUEST_TIMEOUT_MS
      : READ_ACTIONS.has(action)
        ? REQUEST_TIMEOUT_MS
        : WRITE_REQUEST_TIMEOUT_MS;
  const service = typeof request.service === 'string' ? request.service : undefined;
  const nameFilter = typeof request.name === 'string' ? request.name : undefined;
  const identifier = typeof request.identifier === 'string' ? request.identifier : undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const resolution = await waitForBridge();
    const endRequest = beginStartupRequest({
      caller: 'bridge',
      action,
      service,
      nameFilter,
      identifier,
      retry: attempt,
    });

    let didTimeout = false;

    const baseRequestPromise = Promise.resolve().then(() =>
      resolution.bridge.requestWithTimeout
        ? resolution.bridge.requestWithTimeout(request, timeoutMs)
        : resolution.bridge.request(request),
    );

    baseRequestPromise.catch(() => {
      if (!didTimeout) {
        return;
      }
    });

    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        didTimeout = true;
        reject(
          new QortalBridgeError(
            'REQUEST_TIMEOUT',
            `Qortal request ${action} timed out after ${timeoutMs / 1000} seconds.`,
          ),
        );
      }, timeoutMs);
    });

    try {
      const response = await Promise.race([baseRequestPromise, timeoutPromise]);
      const requestError = parseRequestError(response, action);

      if (requestError) {
        throw new QortalResponseError(requestError, response);
      }

      endRequest('success', {
        resultCount: Array.isArray(response) ? response.length : undefined,
      });
      return response as T;
    } catch (error) {
      const completion =
        error instanceof QortalBridgeError && error.code === 'REQUEST_TIMEOUT'
          ? 'timeout'
          : 'error';
      endRequest(completion, {
        detail: error instanceof Error ? error.message : undefined,
      });

      if (error instanceof QortalBridgeError && error.code === 'REQUEST_TIMEOUT') {
        throw error;
      }

      const requestError = toRequestError(error, action);
      if (attempt >= maxAttempts || isConfirmedQdnNotFoundError(requestError)) {
        throw requestError;
      }

      await sleep(READ_RETRY_DELAY_MS * attempt);
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  throw new QortalBridgeError('REQUEST_FAILED', `Qortal request ${action} failed.`);
}

// ── Convenience: QDN Resource Fetch ─────────────────────────────────

export function fetchQdnResource(
  service: string,
  name: string,
  identifier?: string,
  path?: string,
): Promise<unknown> {
  return sendBridgeRequest({
    action: 'FETCH_QDN_RESOURCE',
    service,
    name,
    identifier,
    ...(path ? { filepath: path } : {}),
  });
}

// ── Convenience: Selected Account ───────────────────────────────────

export function getSelectedAccount(): Promise<unknown> {
  return sendBridgeRequest({
    action: 'GET_USER_ACCOUNT',
  });
}

// ── Convenience: QDN Resource Status ────────────────────────────────

export function getQdnResourceStatus(
  service: string,
  name: string,
  identifier?: string,
): Promise<unknown> {
  return sendBridgeRequest({
    action: 'GET_QDN_RESOURCE_STATUS',
    service,
    name,
    identifier,
  });
}

// ── Convenience: Home Settings ──────────────────────────────────────

export function getHomeSettings(): Promise<unknown> {
  return sendBridgeRequest({
    action: 'GET_HOME_SETTINGS',
  });
}

// ── Router basename ─────────────────────────────────────────────────
//
// _qdnBase is a routing/bootstrap value injected by Core's HTMLParser.
// It is NOT a bridge-availability signal.
// Bridge availability is determined by resolveBridge() above.

declare global {
  interface Window {
    _qdnBase?: string;
    _qdnName?: string;
  }
}

export function getRouterBasename(): string {
  if (typeof window !== 'undefined' && window._qdnBase) {
    return window._qdnBase;
  }

  return '';
}
