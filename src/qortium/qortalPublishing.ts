/** Qortal Hub publish contract. Browser Files stay local until the user's publish action. */
import { sendBridgeRequest } from './bridge';
import {
  requireAccountWrite,
  assertPublisherOwner,
  type AccountWriteTicket,
} from './accountWriteGate';
import { resolveQdnPublishFilename } from './publishFilename';
import { pickPublishFile } from './filePicker';

export type QdnPublishSourceInput = {
  file?: Blob;
  bytesBase64?: string;
  fileName?: string;
  mimeType?: string;
};
export type PublishInput = QdnPublishSourceInput & {
  service: string;
  name: string;
  identifier?: string;
  title?: string;
  description?: string;
  category?: string;
  tags?: string[];
};
export type PublishMultipleResource = PublishInput;
export type MultiplePublishResourceCoordinate = {
  service: string;
  name: string;
  identifier: string | null;
};
export type PublishResult = {
  accepted: boolean;
  action: string;
  resource: MultiplePublishResourceCoordinate;
  transactionSignature?: string;
};
export type MultiplePublishPublishedResource = {
  result: unknown;
  resource: MultiplePublishResourceCoordinate;
  transactionSignature: string;
};
export type MultiplePublishFailedResource = {
  error: string;
  errorType?: string;
  outcome?: 'unknown';
  resource: MultiplePublishResourceCoordinate;
  transactionSignature?: string;
};
export type MultiplePublishResult = {
  accepted: boolean;
  action: string;
  published: MultiplePublishPublishedResource[];
  failures: MultiplePublishFailedResource[];
};
export type QdnPublishSourceKind = 'stage' | 'select';
export type QdnPublishCapability = {
  status: 'available' | 'unsupported' | 'unknown';
  stageSource: boolean;
  selectSource: boolean;
  publish: boolean;
  publishMultiple: boolean;
  advertisedActions: readonly string[] | null;
};
export const QDN_PUBLISH_BATCH_MAX_ITEMS = 10;
export const QORTAL_JSON_MAX_BYTES = 25 * 1024;
export class QdnPublishSourceUnsupportedError extends Error {}
export class QdnPublicationUnknownError extends Error {
  readonly code = 'PUBLICATION_UNKNOWN';
  constructor(
    readonly resource: MultiplePublishResourceCoordinate,
    detail = 'Publication outcome is unknown. Verify this resource before retrying.',
  ) {
    super(detail);
    this.name = 'QdnPublicationUnknownError';
  }
}
export class QdnPublishRejectedError extends Error {
  readonly code = 'PUBLISH_REJECTED';
}
/** No signed request was dispatched; correcting the problem is safe. */
export class QdnPublishPreflightError extends Error {
  readonly code = 'PUBLISH_PREFLIGHT_FAILED';
}
const serviceNumbers: Record<string, number> = {
  IMAGE: 400,
  AUDIO: 600,
  DOCUMENT: 800,
  PLAYLIST: 910,
  JSON: 1110,
};
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function coordinate(input: PublishInput): MultiplePublishResourceCoordinate {
  return { service: input.service, name: input.name, identifier: input.identifier ?? 'default' };
}
function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
function rejection(error: unknown): boolean {
  return /declin|cancel|reject|insufficient|invalid (data|name|identifier|service)|not enough|does not own/i.test(
    message(error),
  );
}
function responseFrom(error: unknown): unknown {
  return record(error) && 'response' in error ? error.response : error;
}
function signature(value: unknown): string | null {
  return record(value) && typeof value.signature === 'string' && !!value.signature.trim()
    ? value.signature
    : null;
}
function matches(
  value: Record<string, unknown>,
  input: PublishInput,
  requireCoordinate = false,
): boolean {
  if (
    requireCoordinate &&
    (typeof value.name !== 'string' ||
      typeof value.identifier !== 'string' ||
      value.service == null)
  )
    return false;
  return (
    (value.name == null || value.name === input.name) &&
    (value.identifier == null || value.identifier === (input.identifier ?? 'default')) &&
    (value.service == null ||
      value.service === input.service ||
      value.service === serviceNumbers[input.service])
  );
}
function bytesOfBase64(value: string): Uint8Array {
  const decoded = atob(value);
  return Uint8Array.from(decoded, (c) => c.charCodeAt(0));
}
async function prepare(input: PublishInput): Promise<Record<string, unknown>> {
  if (!input.name.trim() || !input.service.trim())
    throw new Error('A publishing name and service are required.');
  if (input.file && input.bytesBase64) throw new Error('Provide one publish source per resource.');
  const forbidden = ['sourceToken', 'sourceHandle', 'path', 'filePath', 'fee', 'data64', 'base64'];
  for (const key of forbidden)
    if ((input as unknown as Record<string, unknown>)[key] != null)
      throw new Error(
        `Unsupported publish input: ${key}. Select a browser file or provide bytesBase64.`,
      );
  const file: Blob | undefined = input.file;
  let data64: string | undefined;
  let size: number;
  if (file) size = file.size;
  else if (input.bytesBase64) {
    data64 = input.bytesBase64;
    size = bytesOfBase64(data64).byteLength;
  } else throw new Error('Select a local file before publishing.');
  if (size <= 0) throw new Error('The publish source is empty.');
  if (input.service === 'JSON') {
    if (size > QORTAL_JSON_MAX_BYTES)
      throw new Error(
        'Qortal JSON resources cannot exceed 25 KiB. Split this record before publishing.',
      );
    const text = file ? await file.text() : new TextDecoder().decode(bytesOfBase64(data64!));
    try {
      JSON.parse(text);
    } catch {
      throw new Error('The JSON publication source is malformed.');
    }
  }
  const filename = resolveQdnPublishFilename(
    input.fileName ||
      (file && 'name' in file && typeof file.name === 'string'
        ? file.name
        : qdnJsonPublishFileName(input.identifier || 'metadata')),
  ).staged;
  const payload: Record<string, unknown> = {
    service: input.service,
    name: input.name,
    identifier: input.identifier ?? 'default',
    filename,
    ...(file ? { file } : { data64 }),
  };
  for (const key of ['title', 'description', 'category', 'tags'] as const)
    if (input[key] !== undefined) payload[key] = input[key];
  return payload;
}
async function authorize(
  resources: readonly PublishInput[],
  expected?: string,
): Promise<AccountWriteTicket> {
  const ticket = await requireAccountWrite('PUBLISH_QDN_RESOURCE', expected);
  for (const name of new Set(resources.map((item) => item.name)))
    await assertPublisherOwner(name, ticket);
  return ticket;
}
export async function publishResource(input: PublishInput): Promise<PublishResult> {
  const payload = await prepare(input);
  const ticket = await authorize([input]);
  await requireAccountWrite('PUBLISH_QDN_RESOURCE', ticket.address);
  let raw: unknown;
  try {
    raw = await sendBridgeRequest({ action: 'PUBLISH_QDN_RESOURCE', ...payload });
  } catch (error) {
    if (rejection(error)) throw new QdnPublishRejectedError(message(error));
    throw new QdnPublicationUnknownError(
      coordinate(input),
      `Publication outcome is unknown: ${message(error)} Verify ${input.service}/${input.name}/${input.identifier ?? 'default'} before retrying.`,
    );
  }
  if (!signature(raw) || !record(raw) || !matches(raw, input))
    throw new QdnPublicationUnknownError(coordinate(input));
  return {
    accepted: true,
    action: 'PUBLISH_QDN_RESOURCE',
    resource: coordinate(input),
    transactionSignature: signature(raw)!,
  };
}
export async function publishMultipleResources(
  resources: readonly PublishMultipleResource[],
): Promise<MultiplePublishResult> {
  if (!resources.length)
    throw new Error('At least one resource is required for QDN batch publication.');
  const seen = new Set<string>();
  for (const item of resources) {
    const key = JSON.stringify(coordinate(item));
    if (seen.has(key))
      throw new Error('A publication batch cannot contain duplicate resource coordinates.');
    seen.add(key);
  }
  // Validate every source before the first approval or signed write.
  let payloads: Record<string, unknown>[];
  let ticket: AccountWriteTicket;
  try {
    payloads = await Promise.all(resources.map(prepare));
    ticket = await authorize(resources);
  } catch (error) {
    throw new QdnPublishPreflightError(message(error));
  }
  const published: MultiplePublishPublishedResource[] = [];
  const failures: MultiplePublishFailedResource[] = [];
  for (let offset = 0; offset < resources.length; offset += QDN_PUBLISH_BATCH_MAX_ITEMS) {
    const chunk = resources.slice(offset, offset + QDN_PUBLISH_BATCH_MAX_ITEMS);
    try {
      await requireAccountWrite('PUBLISH_MULTIPLE_QDN_RESOURCES', ticket.address);
    } catch (error) {
      if (!published.length) throw new QdnPublishPreflightError(message(error));
      for (const item of resources.slice(offset))
        failures.push({ resource: coordinate(item), error: `Not attempted: ${message(error)}` });
      break;
    }
    let raw: unknown;
    try {
      raw = await sendBridgeRequest({
        action: 'PUBLISH_MULTIPLE_QDN_RESOURCES',
        resources: payloads.slice(offset, offset + chunk.length),
      });
    } catch (error) {
      raw = responseFrom(error);
      if (!record(raw) || !record(raw.error) || !Array.isArray(raw.error.unsuccessfulPublishes)) {
        const unknown = !rejection(error);
        for (const item of chunk)
          failures.push({
            resource: coordinate(item),
            error: unknown
              ? `Publication outcome is unknown: ${message(error)} Verify before retrying.`
              : message(error),
            ...(unknown ? { outcome: 'unknown' as const } : {}),
          });
        for (const item of resources.slice(offset + chunk.length))
          failures.push({
            resource: coordinate(item),
            error: 'Not attempted after the previous publish request failed.',
          });
        break;
      }
    }
    if (Array.isArray(raw)) {
      for (const item of chunk) {
        const results = raw.filter((tx) => record(tx) && matches(tx, item, true) && signature(tx));
        if (results.length === 1)
          published.push({
            resource: coordinate(item),
            result: results[0],
            transactionSignature: signature(results[0])!,
          });
        else
          failures.push({
            resource: coordinate(item),
            error: 'No unambiguous transaction result was returned. Verify before retrying.',
            outcome: 'unknown',
          });
      }
    } else {
      const errorRows =
        record(raw) && record(raw.error) && Array.isArray(raw.error.unsuccessfulPublishes)
          ? raw.error.unsuccessfulPublishes
          : [];
      for (const item of chunk) {
        const failure = errorRows.find((value) => record(value) && matches(value, item, true));
        const reason =
          record(failure) && typeof failure.reason === 'string'
            ? failure.reason
            : 'Hub did not retain this resource result in its partial batch response.';
        // Hub drops successful signatures on partial failure. Neither absence
        // from the failure list nor a generic network error proves success.
        const knownRejection = !!failure && rejection(new Error(reason));
        failures.push({
          resource: coordinate(item),
          error: knownRejection ? reason : `${reason} Verify before retrying.`,
          ...(!knownRejection ? { outcome: 'unknown' as const } : {}),
        });
      }
    }
    if (failures.length) {
      for (const item of resources.slice(offset + chunk.length))
        failures.push({
          resource: coordinate(item),
          error: 'Not attempted after an incomplete publication result.',
        });
      break;
    }
  }
  return {
    accepted: published.length > 0,
    action: 'PUBLISH_MULTIPLE_QDN_RESOURCES',
    published,
    failures,
  };
}
export function resetQdnPublishCapabilityCache(): void {
  /* Capabilities are read fresh. */
}
export async function getQdnPublishCapability(): Promise<QdnPublishCapability> {
  try {
    const actions = await sendBridgeRequest<unknown>({ action: 'SHOW_ACTIONS' });
    const list = Array.isArray(actions)
      ? actions.filter((item): item is string => typeof item === 'string')
      : [];
    return {
      status: list.includes('PUBLISH_QDN_RESOURCE') ? 'available' : 'unsupported',
      stageSource: false,
      selectSource: typeof document !== 'undefined',
      publish: list.includes('PUBLISH_QDN_RESOURCE'),
      publishMultiple: list.includes('PUBLISH_MULTIPLE_QDN_RESOURCES'),
      advertisedActions: list,
    };
  } catch {
    return {
      status: 'unknown',
      stageSource: false,
      selectSource: typeof document !== 'undefined',
      publish: false,
      publishMultiple: false,
      advertisedActions: null,
    };
  }
}
export async function isQdnPublishSourceSupported(kind: QdnPublishSourceKind): Promise<boolean> {
  return kind === 'select' && typeof document !== 'undefined';
}
export function qdnJsonPublishFileName(identifier: string): string {
  return `${
    identifier
      .trim()
      .replace(/[^A-Za-z0-9._-]+/g, '-')
      .replace(/^[.-]+|[.-]+$/g, '') || 'nodefm-metadata'
  }.json`;
}
export type SelectPublishSourceResult =
  | { canceled: true }
  | { canceled: false; file: File; fileName: string; kind: 'file'; mimeType: string; size: number };
export async function selectPublishSource(
  kind: 'file' | 'directory' = 'file',
): Promise<SelectPublishSourceResult> {
  if (kind !== 'file') throw new Error('Select individual audio files for publishing.');
  const file = await pickPublishFile();
  return file
    ? {
        canceled: false,
        file,
        fileName: file.name,
        kind: 'file',
        mimeType: file.type,
        size: file.size,
      }
    : { canceled: true };
}
