import { parseBlob } from 'music-metadata';
import { resolveAudioDurationFromUrl } from './duration';

/** Inspect the actual selected file before creating any QDN transaction. */
export async function resolvePublishAudioDuration(file: File): Promise<number> {
  try {
    const metadata = await parseBlob(file, { duration: true, skipCovers: true });
    const ms = Math.round((metadata.format.duration ?? 0) * 1000);
    if (Number.isSafeInteger(ms) && ms > 0) return ms;
  } catch {
    /* A playable format may still be understood by the host audio element. */
  }
  const url = URL.createObjectURL(file);
  try {
    const ms = await resolveAudioDurationFromUrl(url);
    if (Number.isSafeInteger(ms) && ms > 0) return ms;
    throw new Error('Audio duration could not be resolved. Nothing was published.');
  } finally {
    URL.revokeObjectURL(url);
  }
}
