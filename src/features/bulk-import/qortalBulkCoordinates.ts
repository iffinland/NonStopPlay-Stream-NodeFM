import type { BulkImportRow, BulkImportRole, BulkImportPublicationResourceIdentity } from './types';

export function qortalBulkCoordinate(
  row: Pick<BulkImportRow, 'id' | 'publication'>,
  role: BulkImportRole,
  name: string,
  kind: 'audio' | 'cover' | 'metadata',
): BulkImportPublicationResourceIdentity & { name: string; identifier: string } {
  const service = kind === 'audio' ? 'AUDIO' : kind === 'cover' ? 'IMAGE' : 'JSON';
  const prefix =
    kind === 'metadata'
      ? role === 'listener'
        ? 'nodefm-track-submission-'
        : 'nodefm-track-'
      : role === 'listener'
        ? `nodefm-submission-${kind}-`
        : `nodefm-${kind}-`;
  let identifier = prefix + row.id;
  const previous = row.publication[kind];
  // Retain RC.3/4 uploaded media rather than sending the same bytes again.
  if (
    kind !== 'metadata' &&
    (previous.status === 'published' || previous.status === 'unknown') &&
    previous.intent.name === name &&
    previous.intent.service === service &&
    previous.intent.identifier === `nodefm-${kind}-${row.id}`
  )
    identifier = previous.intent.identifier;
  return { kind, service, name, identifier };
}
