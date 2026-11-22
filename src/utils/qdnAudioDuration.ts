import { parseBlob } from 'music-metadata';
import { isValidDurationMs } from './duration';

function nativeDuration(url: string, signal: AbortSignal): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    let settled = false;
    const finish = (ms?: number) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      audio.onloadedmetadata = audio.ondurationchange = audio.onerror = null;
      audio.removeAttribute('src');
      audio.load();
      if (ms && isValidDurationMs(ms)) resolve(ms);
      else reject(new Error('Audio duration is unavailable.'));
    };
    const abort = () => finish();
    const inspect = () => {
      const ms = Math.round(audio.duration * 1000);
      if (isValidDurationMs(ms)) finish(ms);
    };
    signal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => finish(), 15000);
    audio.preload = 'metadata';
    audio.onloadedmetadata = inspect;
    audio.ondurationchange = inspect;
    audio.onerror = () => finish();
    if (signal.aborted) return abort();
    audio.src = url;
    audio.load();
  });
}

/** Native metadata avoids full WebAudio decoding. Bounded byte parsing is a fallback. */
export async function resolveQdnAudioDuration(url: string, signal: AbortSignal): Promise<number> {
  try {
    return await nativeDuration(url, signal);
  } catch {
    /* Try actual media bytes. */
  }
  if (signal.aborted) throw new Error('Duration check cancelled.');
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 30000);
  const max = 64 * 1024 * 1024;
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok || !response.body || Number(response.headers.get('content-length')) > max)
      throw new Error('Media bytes are unavailable for duration detection.');
    const reader = response.body.getReader();
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let size = 0;
    try {
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        size += next.value.byteLength;
        if (size > max) throw new Error('Use a manual duration for this large resource.');
        chunks.push(new Uint8Array(next.value));
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }
    const result = await parseBlob(new Blob(chunks), { duration: true, skipCovers: true });
    const ms = Math.round((result.format.duration ?? 0) * 1000);
    if (!isValidDurationMs(ms)) throw new Error('Audio duration is unavailable.');
    return ms;
  } finally {
    controller.abort();
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
  }
}
