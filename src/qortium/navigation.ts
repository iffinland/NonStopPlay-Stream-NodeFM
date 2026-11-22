/** Qortal APP identity and deep links, using Core-injected deployment context. */
import { sendBridgeRequest } from './bridge';
import type { QdnResourceRef } from '../types/domain';

export const NODEFM_APP_SERVICE = 'APP';
// Production publisher comes from Core's APP render context.
export const NODEFM_APP_NAME =
  (typeof window !== 'undefined' &&
    typeof window._qdnName === 'string' &&
    window._qdnName.trim()) ||
  'NodeFM';
export const NODEFM_APP_IDENTIFIER = 'default';

export type QdnHostGlobals = {
  _qdnService?: unknown;
  _qdnName?: unknown;
  _qdnIdentifier?: unknown;
};

type WindowWithQdnIdentity = Window & QdnHostGlobals;

function cleanGlobal(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function getCurrentQdnAppIdentity(
  host: QdnHostGlobals | null = typeof window === 'undefined'
    ? null
    : (window as WindowWithQdnIdentity),
): QdnResourceRef {
  const service = cleanGlobal(host?._qdnService).toUpperCase() || NODEFM_APP_SERVICE;
  const name = cleanGlobal(host?._qdnName) || NODEFM_APP_NAME;
  const identifier = cleanGlobal(host?._qdnIdentifier) || NODEFM_APP_IDENTIFIER;

  return {
    service,
    name,
    identifier,
  };
}

export function getCanonicalNodeFmAppIdentity(): QdnResourceRef {
  return {
    service: NODEFM_APP_SERVICE,
    name: getCurrentQdnAppIdentity().name,
    identifier: getCurrentQdnAppIdentity().identifier,
  };
}

export function buildQdnUrl(resource: QdnResourceRef): string {
  if (!resource.service.trim() || !resource.name.trim()) {
    throw new Error('QDN service and name are required to build a Qortal address.');
  }
  const identifier = resource.identifier?.trim();
  const suffix = identifier && identifier !== 'default' ? `/${encodeURIComponent(identifier)}` : '';
  return `qortal://${resource.service.trim().toUpperCase()}/${encodeURIComponent(resource.name.trim())}${suffix}`;
}

export type OpenTabTarget = 'current' | 'new';

/** Open a Qortal resource through Hub. */
export async function openQdnAddress(
  address: string,
  target: OpenTabTarget = 'new',
): Promise<void> {
  if (target === 'current')
    throw new Error('Current-tab navigation is not supported by this Qortal adapter.');
  if (!/^qortal:\/\//i.test(address)) {
    throw new Error('Only qortal:// addresses can be opened by Qortal Hub.');
  }

  if (address.length > 2048) {
    throw new Error('QDN address is too long.');
  }

  await sendBridgeRequest({
    action: 'OPEN_NEW_TAB',
    qortalLink: address,
  });
}
