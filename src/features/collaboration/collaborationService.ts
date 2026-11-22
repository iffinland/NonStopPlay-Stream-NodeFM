import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { sendBridgeRequestRaw } from '../../qortium/bridge';
import { installStationAccess, hasStationAccess } from '../../qortium/stationAccess';
import { getCanonicalNodeFmAppIdentity } from '../../qortium/navigation';
import { generateId } from '../../utils/id';
import { QdnResourceReadError } from '../../qortium/qdnReadError';

const ACL = 'nodefm-station-admins-v1';
const ACCESS_DOCUMENT = 'nodefm-station-access-v2';
// Bound application memory and transaction payloads even though Core DOCUMENT
// does not impose the JSON service's 25 KiB limit.
export const STATION_DOCUMENT_MAX_BYTES = 16 * 1024 * 1024;
export type Member = { address: string; name: string; grantId: string };
type RecordValue = {
  service: string;
  identifier: string;
  sequence: number;
  author: string;
  created: number;
  updated: number;
  deleted?: true;
  data?: unknown;
  media?: { service: string; name: string; identifier: string };
};
type Records = Record<string, RecordValue>;
class InvalidManifestError extends Error {}
export type Registry = {
  schemaVersion: 1;
  station: string;
  owner: string;
  epoch: number;
  admins: Member[];
  checkpoint?: { name: string; identifier: string; hash: string };
  inlineRecords?: Records;
};
type Manifest = {
  schemaVersion: 1;
  station: string;
  epoch: number;
  grantId: string;
  author: string;
  records: Records;
};
const raw = sendBridgeRequestRaw;
const key = (service: string, identifier: string) => `${service}\u0000${identifier}`;
const name = () => getCanonicalNodeFmAppIdentity().name;
let cached: { at: number; registry: Registry } | null = null;
let viewCache: { at: number; registry: Registry; records: Records } | null = null;
let writing = false;
let registryLoad: Promise<Registry> | null = null;
const confirmedManifests = new Map<string, Manifest>();
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function decode(value: unknown) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (text && new TextEncoder().encode(text).byteLength > STATION_DOCUMENT_MAX_BYTES)
    throw new Error('Station document exceeds the 16 MiB application limit.');
  return typeof value === 'string' ? JSON.parse(value) : value;
}
function documentBase64(value: unknown) {
  const text = JSON.stringify(value);
  if (new TextEncoder().encode(text).byteLength > STATION_DOCUMENT_MAX_BYTES)
    throw new Error(
      'Station document exceeds the 16 MiB application limit. No publication was sent.',
    );
  return btoa(unescape(encodeURIComponent(text)));
}
function managed(service: unknown, identifier: unknown) {
  return (
    ['JSON', 'PLAYLIST', 'AUDIO', 'IMAGE'].includes(String(service)) &&
    typeof identifier === 'string' &&
    /^(nodefm-station-config$|nodefm-track-(?!submission-)|nodefm-playlist-|nodefm-schedule-|nodefm-notice-|nodefm-program-|nodefm-submission-mod-|nodefm-lp-sub-mod-|nodefm-audio-|nodefm-cover-)/.test(
      identifier,
    )
  );
}
async function manifestId(station: string) {
  return `nodefm-team-${(await hash(station)).slice(0, 32)}`;
}
async function ownerOf(publisher: string) {
  const value = await raw<Record<string, unknown>>({ action: 'GET_NAME_DATA', name: publisher });
  if (typeof value.owner !== 'string') throw new Error('Cannot verify registered name ownership.');
  return value.owner;
}
async function fetchData(publisher: string, identifier: string, service = 'DOCUMENT') {
  return decode(await raw({ action: 'FETCH_QDN_RESOURCE', service, name: publisher, identifier }));
}
async function missing(publisher: string, identifier: string, service: string) {
  const value = await raw<Record<string, unknown>>({
    action: 'GET_QDN_RESOURCE_STATUS',
    name: publisher,
    identifier,
    service,
  });
  return ['NOT_PUBLISHED', 'NOT_FOUND'].includes(String(value.status));
}
async function hash(value: string) {
  // Hub can render apps from an HTTP node, where SubtleCrypto is unavailable.
  return bytesToHex(sha256(new TextEncoder().encode(value)));
}
function parseRegistry(value: unknown, station: string, owner: string): Registry {
  if (
    !object(value) ||
    value.schemaVersion !== 1 ||
    value.station !== station ||
    value.owner !== owner ||
    !Number.isSafeInteger(value.epoch) ||
    Number(value.epoch) < 1 ||
    !Array.isArray(value.admins) ||
    value.admins.length > 25
  )
    throw new Error('Invalid station access registry.');
  const seen = new Set<string>();
  for (const member of value.admins) {
    if (
      !object(member) ||
      typeof member.address !== 'string' ||
      !member.address ||
      member.address === owner ||
      typeof member.name !== 'string' ||
      !member.name ||
      typeof member.grantId !== 'string' ||
      !member.grantId ||
      seen.has(member.address)
    )
      throw new Error('Invalid or duplicate station administrator.');
    seen.add(member.address);
  }
  if (
    value.checkpoint &&
    (!object(value.checkpoint) ||
      value.checkpoint.name !== station ||
      typeof value.checkpoint.identifier !== 'string' ||
      typeof value.checkpoint.hash !== 'string')
  )
    throw new Error('Invalid station checkpoint.');
  return value as unknown as Registry;
}
export async function loadRegistry(fresh = false): Promise<Registry> {
  if (!fresh && cached && Date.now() - cached.at < 15000) return cached.registry;
  if (registryLoad) return registryLoad;
  const pending = (async () => {
    const station = name(),
      owner = await ownerOf(station);
    let registry: Registry;
    if (!(await missing(station, ACCESS_DOCUMENT, 'DOCUMENT'))) {
      const document = await fetchData(station, ACCESS_DOCUMENT);
      if (!object(document) || document.schemaVersion !== 2)
        throw new Error('Invalid station access document.');
      registry = {
        ...parseRegistry(document.registry, station, owner),
        inlineRecords: validRecords(document.records),
      };
    } else {
      const absent = await missing(station, ACL, 'JSON');
      registry = absent
        ? { schemaVersion: 1, station, owner, epoch: 0, admins: [] }
        : parseRegistry(await fetchData(station, ACL, 'JSON'), station, owner);
    }
    if (
      cached &&
      cached.registry.owner === owner &&
      cached.registry.station === station &&
      cached.registry.epoch > registry.epoch
    )
      registry = cached.registry;
    cached = { at: Date.now(), registry };
    return registry;
  })();
  registryLoad = pending;
  try {
    return await pending;
  } finally {
    if (registryLoad === pending) registryLoad = null;
  }
}

function memberFor(registry: Registry, address: string): Member | null {
  return address === registry.owner
    ? { address, name: registry.station, grantId: 'owner' }
    : (registry.admins.find((m) => m.address === address) ?? null);
}
export async function getStationRole(address: string | null, fresh = false) {
  const registry = await loadRegistry(fresh);
  return {
    registry,
    isOwner: address === registry.owner,
    canManage: !!address && !!memberFor(registry, address),
  };
}
export async function assertStationManager(actor: string | null, owner: string) {
  if (!actor) throw new Error('A connected station administrator is required.');
  if (!hasStationAccess()) {
    if (actor !== owner) throw new Error('Only the station owner can manage this station.');
    return;
  }
  const role = await getStationRole(actor, true);
  if (role.registry.owner !== owner || !role.canManage)
    throw new Error('This account is not an authorized station administrator.');
}
function validRecords(value: unknown, author?: string): Records {
  if (!object(value) || Object.keys(value).length > 10000)
    throw new InvalidManifestError('Invalid station resource manifest.');
  for (const [id, r] of Object.entries(value)) {
    if (
      !object(r) ||
      !managed(r.service, r.identifier) ||
      id !== key(String(r.service), String(r.identifier)) ||
      !Number.isSafeInteger(r.sequence) ||
      Number(r.sequence) < 0 ||
      !Number.isSafeInteger(r.created) ||
      !Number.isSafeInteger(r.updated) ||
      typeof r.author !== 'string' ||
      (author && r.author !== author)
    )
      throw new InvalidManifestError('Invalid station manifest record.');
    if (
      r.media &&
      (!object(r.media) ||
        r.media.service !== r.service ||
        typeof r.media.name !== 'string' ||
        r.media.identifier !== r.identifier)
    )
      throw new InvalidManifestError('Invalid station media reference.');
    if ('deleted' in r && r.deleted !== true)
      throw new InvalidManifestError('Invalid station removal record.');
    if (r.deleted && (r.media || 'data' in r))
      throw new InvalidManifestError('Removed resources must not contain live data.');
    if (!r.deleted && !r.media && !('data' in r))
      throw new InvalidManifestError('Missing station resource data.');
  }
  return value as Records;
}
async function readManifest(registry: Registry, member: Member): Promise<Manifest | null> {
  if ((await ownerOf(member.name)) !== member.address) return null;
  const id = await manifestId(registry.station);
  const local = confirmedManifests.get(member.address);
  const accepted =
    local && local.epoch === registry.epoch && local.grantId === member.grantId ? local : null;
  if (await missing(member.name, id, 'DOCUMENT')) return accepted;
  const value = await fetchData(member.name, id);
  if (
    !object(value) ||
    value.schemaVersion !== 1 ||
    value.station !== registry.station ||
    value.author !== member.address
  )
    throw new InvalidManifestError('Invalid station administrator manifest.');
  if (value.epoch !== registry.epoch || value.grantId !== member.grantId) return null;
  const records = { ...validRecords(value.records, member.address) };
  for (const [id, record] of Object.entries(accepted?.records ?? {}))
    if (!records[id] || record.sequence > records[id].sequence) records[id] = record;
  return { ...value, records } as Manifest;
}
async function materialize(registry: Registry, fresh = false): Promise<Records> {
  if (
    !fresh &&
    viewCache &&
    viewCache.registry.station === registry.station &&
    viewCache.registry.owner === registry.owner &&
    viewCache.registry.epoch === registry.epoch &&
    Date.now() - viewCache.at < 10000
  )
    return viewCache.records;
  let records: Records = { ...registry.inlineRecords };
  if (registry.checkpoint) {
    const value = await fetchData(registry.checkpoint.name, registry.checkpoint.identifier);
    const json = JSON.stringify(value);
    if ((await hash(json)) !== registry.checkpoint.hash)
      throw new Error('Station checkpoint integrity check failed.');
    if (!object(value) || value.station !== registry.station)
      throw new Error('Invalid station checkpoint.');
    records = { ...validRecords(value.records) };
  }
  const members = [
    { address: registry.owner, name: registry.station, grantId: 'owner' },
    ...registry.admins,
  ];
  const manifests = await Promise.all(
    members.map(async (member) => {
      try {
        return await readManifest(registry, member);
      } catch (error) {
        if (error instanceof InvalidManifestError || error instanceof SyntaxError) return null;
        throw error;
      }
    }),
  );
  for (const manifest of manifests) {
    if (!manifest) continue;
    for (const [id, record] of Object.entries(manifest.records)) {
      const previous = records[id];
      if (
        !previous ||
        record.sequence > previous.sequence ||
        (record.sequence === previous.sequence &&
          ((record.deleted && !previous.deleted) ||
            (record.deleted === previous.deleted && record.author > previous.author)))
      )
        records[id] = record;
    }
  }
  viewCache = { at: Date.now(), registry, records };
  return records;
}
async function account() {
  const value = await raw<Record<string, unknown>>({ action: 'GET_USER_ACCOUNT' });
  if (typeof value.address !== 'string' || !value.address)
    throw new Error('Connect a Qortal account.');
  return value.address;
}
function signed(value: unknown): value is Record<string, unknown> & { signature: string } {
  return object(value) && typeof value.signature === 'string' && !!value.signature;
}
async function publishRaw(resource: Record<string, unknown>) {
  const value = await raw({ action: 'PUBLISH_QDN_RESOURCE', ...resource });
  if (
    !signed(value) ||
    value.name !== resource.name ||
    value.identifier !== resource.identifier ||
    (value.service !== resource.service &&
      value.service !==
        ({ JSON: 1110, DOCUMENT: 800 } as Record<string, number>)[String(resource.service)])
  )
    throw new Error('Publication was not confirmed. Check its result before repeating.');
  return value;
}
async function searchLegacyResources(payload: Record<string, unknown>) {
  const results: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  const pageSize = 200;
  for (let offset = 0; ; offset += pageSize) {
    const page = await raw<unknown>({ ...payload, limit: pageSize, offset, exactMatchNames: true });
    if (!Array.isArray(page)) throw new Error('Invalid QDN search response.');
    let added = 0;
    for (const row of page) {
      if (!object(row) || typeof row.name !== 'string' || typeof row.service !== 'string')
        throw new Error('Invalid QDN search record. Discovery could not complete.');
      if (row.name !== name()) continue;
      const id = key(String(row.service), String(row.identifier ?? 'default'));
      if (!seen.has(id)) {
        seen.add(id);
        results.push(row);
        added++;
      }
    }
    if (results.length > 10000)
      throw new Error('Station discovery exceeds the 10,000-resource application limit.');
    if (page.length < pageSize) return results;
    // Do not silently authorize destructive operations with a truncated view
    // when a node ignores pagination or repeatedly returns the same page.
    if (!added || offset >= 10000)
      throw new Error('QDN discovery could not complete. Refresh before changing station content.');
  }
}
export async function resolveMember(input: string): Promise<Omit<Member, 'grantId'>> {
  const value = input.trim();
  if (!value) throw new Error('Enter a Qortal name or wallet address.');
  if (/^Q[1-9A-HJ-NP-Za-km-z]{25,40}$/.test(value)) {
    const result = await raw<unknown>({ action: 'GET_ACCOUNT_NAMES', address: value });
    const names = Array.isArray(result) ? result : [];
    for (const item of names) {
      const candidate = typeof item === 'string' ? item : object(item) ? item.name : null;
      if (typeof candidate === 'string' && (await ownerOf(candidate)) === value)
        return { address: value, name: candidate };
    }
    throw new Error('This account needs a registered Qortal name.');
  }
  const record = await raw<Record<string, unknown>>({ action: 'GET_NAME_DATA', name: value });
  if (typeof record.owner !== 'string' || !record.owner)
    throw new Error('Cannot verify registered name ownership.');
  return {
    name: typeof record.name === 'string' && record.name ? record.name : value,
    address: record.owner,
  };
}
export async function updateAdmins(admins: Omit<Member, 'grantId'>[]): Promise<Registry> {
  if (writing) throw new Error('A station update is already in progress.');
  writing = true;
  try {
    const registry = await loadRegistry(true);
    const actor = await account();
    if (actor !== registry.owner)
      throw new Error('Only the APP owner may add or remove administrators.');
    const checked = await Promise.all(
      admins.map(async (member) => {
        if ((await ownerOf(member.name)) !== member.address)
          throw new Error('The registered name does not belong to this administrator.');
        return {
          ...member,
          grantId:
            registry.admins.find((m) => m.address === member.address)?.grantId ?? generateId(),
        };
      }),
    );
    const records = await materialize(registry, true);
    // Freeze previously authorized metadata into an owner-owned document before
    // changing membership. Old manifests cannot alter the new access epoch.
    const snapshot = {
      schemaVersion: 1,
      station: registry.station,
      records: Object.fromEntries(
        Object.entries(records).map(([id, r]) => [id, { ...r, sequence: 0 }]),
      ),
    };
    const next = parseRegistry(
      {
        schemaVersion: 1,
        station: registry.station,
        owner: registry.owner,
        epoch: registry.epoch + 1,
        admins: checked,
      },
      registry.station,
      registry.owner,
    );
    if (new TextEncoder().encode(JSON.stringify(next)).byteLength > 25 * 1024)
      throw new Error('The access registry exceeds the Qortal JSON limit.');
    if ((await account()) !== actor || (await ownerOf(registry.station)) !== actor)
      throw new Error('The publishing account changed.');
    // Membership and its frozen content share one owner-signed resource, so
    // approval is single and a partial batch cannot strand a new registry.
    await publishRaw({
      service: 'DOCUMENT',
      name: registry.station,
      identifier: ACCESS_DOCUMENT,
      data64: documentBase64({ schemaVersion: 2, registry: next, records: snapshot.records }),
      filename: 'station-access.json',
    });
    const accepted = { ...next, inlineRecords: snapshot.records };
    cached = { at: Date.now(), registry: accepted };
    viewCache = null;
    confirmedManifests.clear();
    return accepted;
  } finally {
    writing = false;
  }
}
async function intercept(
  payload: Record<string, unknown>,
): Promise<{ handled: boolean; value?: unknown }> {
  const action = String(payload.action);
  // This is a logical application operation, never a Qortal Core delete action.
  const deleting = action === 'DELETE_QDN_RESOURCE';
  const resources =
    action === 'PUBLISH_MULTIPLE_QDN_RESOURCES'
      ? (payload.resources as Record<string, unknown>[])
      : [payload];
  const writes =
    deleting || action === 'PUBLISH_QDN_RESOURCE' || action === 'PUBLISH_MULTIPLE_QDN_RESOURCES';
  const relevant = writes
    ? resources.some((r) => r.name === name() && managed(r.service, r.identifier))
    : payload.name === name() &&
      (managed(payload.service, payload.identifier) ||
        action === 'SEARCH_QDN_RESOURCES' ||
        action === 'LIST_QDN_RESOURCES');
  if (!relevant) return { handled: false };
  const registry = await loadRegistry(writes);
  if (writes) {
    if (writing) throw new Error('A station update is already in progress.');
    writing = true;
    try {
      const actor = await account(),
        member = memberFor(registry, actor);
      if (!member || (await ownerOf(member.name)) !== actor)
        throw new Error('Station management permission was revoked.');
      if (resources.some((r) => r.name !== registry.station || !managed(r.service, r.identifier)))
        throw new Error('Do not mix station and personal resources in one publication.');
      const current = await materialize(registry, true);
      const own = await readManifest(registry, member);
      const records = { ...own?.records };
      const physical: Record<string, unknown>[] = [];
      for (const r of resources) {
        const service = String(r.service),
          identifier = String(r.identifier);
        const previous = current[key(service, identifier)];
        const sequence = (previous?.sequence ?? 0) + 1;
        if (!Number.isSafeInteger(sequence))
          throw new Error('Station revision is exhausted; the owner must update membership.');
        const now = Date.now();
        const record: RecordValue = {
          service,
          identifier,
          sequence,
          author: actor,
          created: previous?.created ?? now,
          updated: now,
        };
        if (deleting || r.nodefmRemove === true) {
          // Keep the revision even when a legacy owner resource still exists.
          // Checkpoints carry these markers across membership changes.
          record.deleted = true;
        } else if (service === 'AUDIO' || service === 'IMAGE') {
          record.media = { service, name: member.name, identifier };
          physical.push({ ...r, name: member.name });
        } else {
          const text =
            r.file instanceof Blob
              ? await r.file.text()
              : new TextDecoder().decode(
                  Uint8Array.from(atob(String(r.data64 ?? r.base64)), (c) => c.charCodeAt(0)),
                );
          record.data = JSON.parse(text);
        }
        records[key(service, identifier)] = record;
      }
      const manifest: Manifest = {
        schemaVersion: 1,
        station: registry.station,
        epoch: registry.epoch,
        grantId: member.grantId,
        author: actor,
        records,
      };
      const manifestResource = {
        service: 'DOCUMENT',
        name: member.name,
        identifier: await manifestId(registry.station),
        data64: documentBase64({ ...manifest, records: validRecords(records, actor) }),
        filename: 'station-team-data.json',
      };
      if ((await account()) !== actor || (await loadRegistry(true)).epoch !== registry.epoch)
        throw new Error('The Hub account or station permissions changed.');
      // The virtual caller receives success only if every real resource and the
      // manifest have signed transaction results. Partial results remain unknown.
      let result: unknown;
      try {
        result = await raw<unknown>({
          action: 'PUBLISH_MULTIPLE_QDN_RESOURCES',
          resources: [...physical, manifestResource],
        });
      } catch (error) {
        const response = object(error) && object(error.response) ? error.response : null;
        const failures =
          response && object(response.error) && Array.isArray(response.error.unsuccessfulPublishes)
            ? response.error.unsuccessfulPublishes
            : [];
        if (failures.length) {
          const reason = failures
            .filter(object)
            .map((failure) => String(failure.reason ?? 'Unconfirmed publication'))
            .slice(0, 2)
            .join('; ');
          throw Object.assign(
            new Error(
              `Station update outcome is unknown. ${reason} Check saved resources before publishing again.`,
            ),
            { code: 'PUBLICATION_UNKNOWN' },
          );
        }
        throw error;
      }
      if (
        !Array.isArray(result) ||
        result.length !== physical.length + 1 ||
        ![...physical, manifestResource].every(
          (resource) =>
            result.filter(
              (tx) =>
                signed(tx) &&
                tx.name === resource.name &&
                tx.identifier === resource.identifier &&
                (tx.service === resource.service ||
                  tx.service ===
                    ({ AUDIO: 600, IMAGE: 400, DOCUMENT: 800 } as Record<string, number>)[
                      String(resource.service)
                    ]),
            ).length === 1,
        )
      )
        throw new Error('Station update outcome is unknown. Verify it before repeating.');
      if ((await loadRegistry(true)).epoch !== registry.epoch)
        throw new Error(
          'Station permissions changed during publication. Reload the station to check its result.',
        );
      confirmedManifests.set(actor, manifest);
      viewCache = null;
      const signature = String(
        result.find((tx) => object(tx) && tx.identifier === manifestResource.identifier)!.signature,
      );
      if (deleting)
        return { handled: true, value: { accepted: true, transactionSignature: signature } };
      const logical = resources.map((r) => ({
        signature,
        name: registry.station,
        identifier: r.identifier,
        service: r.service,
      }));
      return { handled: true, value: action === 'PUBLISH_QDN_RESOURCE' ? logical[0] : logical };
    } finally {
      writing = false;
    }
  }
  const records = await materialize(registry);
  if (action === 'SEARCH_QDN_RESOURCES' || action === 'LIST_QDN_RESOURCES') {
    const base = await searchLegacyResources(payload);
    const map = new Map(
      base
        .filter(object)
        .map((r) => [key(String(r.service), String(r.identifier ?? 'default')), r]),
    );
    for (const [id, r] of Object.entries(records)) {
      if (r.deleted) {
        map.delete(id);
        continue;
      }
      if (payload.service && r.service !== payload.service) continue;
      const query = String(payload.query ?? '');
      if (
        query &&
        !(payload.prefix
          ? r.identifier.startsWith(query)
          : r.identifier.toLowerCase().includes(query.toLowerCase()) ||
            JSON.stringify(r.data ?? '')
              .toLowerCase()
              .includes(query.toLowerCase()))
      )
        continue;
      map.set(id, {
        service: r.service,
        name: registry.station,
        identifier: r.identifier,
        created: r.created,
        updated: r.updated,
        metadata: object(r.data) ? { title: r.data.title ?? r.data.name } : undefined,
      });
    }
    return { handled: true, value: [...map.values()] };
  }
  const record = records[key(String(payload.service), String(payload.identifier ?? 'default'))];
  if (!record) return { handled: false };
  if (record.deleted) {
    if (action === 'GET_QDN_RESOURCE_STATUS')
      return { handled: true, value: { status: 'NOT_PUBLISHED' } };
    throw new QdnResourceReadError('NOT_FOUND', 'This resource was removed from the station.');
  }
  if (record.media) return { handled: true, value: await raw({ ...payload, ...record.media }) };
  if (action === 'FETCH_QDN_RESOURCE') return { handled: true, value: record.data };
  if (action === 'GET_QDN_RESOURCE_STATUS') return { handled: true, value: { status: 'READY' } };
  return { handled: false };
}
export function initializeCollaboration() {
  installStationAccess({
    request: intercept,
    usesDocumentManifest: (service, publisher, identifier) =>
      publisher === name() && managed(service, identifier),
    authorize: async (publisher, address) => {
      if (publisher !== name()) return false;
      const registry = await loadRegistry(true);
      return !!memberFor(registry, address);
    },
  });
}
export function resetCollaboration() {
  cached = null;
  viewCache = null;
  writing = false;
  registryLoad = null;
  confirmedManifests.clear();
}
