import type { QdnResourceInfo } from '../../../qortium/qdn';

/** Existing publisher metadata is editable guidance, never a guessed duration. */
export function qdnAudioDetails(resource: QdnResourceInfo) {
  const metadata = resource.metadata;
  const fields: Record<string, string> = {};
  for (const part of (metadata?.description ?? '').slice(0, 10000).split(';')) {
    const match =
      /^\s*(title|author|artist|album|releaseDate|year|genre|genres)\s*=\s*(.+?)\s*$/i.exec(part);
    if (match) fields[match[1].toLowerCase()] = match[2];
  }
  return {
    title: metadata?.title?.trim() || fields.title || resource.name,
    artist: fields.artist || fields.author || '',
    album: fields.album || '',
    releaseDate: fields.releasedate || fields.year || '',
    description: metadata?.description ?? '',
    genres: fields.genres || fields.genre || '',
    tags: (metadata?.tags ?? []).join(', '),
  };
}

/** Unambiguous user-entered duration: minutes:seconds[.milliseconds] or hours:minutes:seconds. */
export function parseManualAudioDuration(value: string): number | null {
  const parts = value.trim().split(':');
  if (parts.length < 2 || parts.length > 3 || !/^\d+$/.test(parts[0])) return null;
  if (!/^\d{2}(?:\.\d{1,3})?$/.test(parts[parts.length - 1])) return null;
  if (parts.length === 3 && !/^\d{2}$/.test(parts[1])) return null;
  const values = parts.map(Number);
  if (values[values.length - 1] >= 60 || (parts.length === 3 && values[1] >= 60)) return null;
  const ms = Math.round(values.reduce((seconds, part) => seconds * 60 + part, 0) * 1000);
  return Number.isSafeInteger(ms) && ms > 0 ? ms : null;
}
