import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveQdnAudioDuration } from '../utils/qdnAudioDuration';
class AudioFixture {
  duration = 0;
  src = '';
  preload = '';
  onloadedmetadata: (() => void) | null = null;
  ondurationchange: (() => void) | null = null;
  onerror: (() => void) | null = null;
  static duration = 12.345;
  static fail = false;
  load() {
    if (this.src) {
      this.duration = AudioFixture.duration;
      if (AudioFixture.fail) this.onerror?.();
      else this.onloadedmetadata?.();
    }
  }
  removeAttribute() {
    this.src = '';
  }
}
function wav() {
  const bytes = new Uint8Array(16044);
  const v = new DataView(bytes.buffer);
  for (const [offset, s] of [
    [0, 'RIFF'],
    [8, 'WAVE'],
    [12, 'fmt '],
    [36, 'data'],
  ] as const)
    for (let i = 0; i < s.length; i++) bytes[offset + i] = s.charCodeAt(i);
  v.setUint32(4, 16036, true);
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true);
  v.setUint32(28, 16000, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  v.setUint32(40, 16000, true);
  return bytes;
}
afterEach(() => {
  vi.unstubAllGlobals();
  AudioFixture.fail = false;
  AudioFixture.duration = 12.345;
});
describe('QDN duration without full WebAudio decode', () => {
  it('uses native metadata without fetching or creating an AudioContext', async () => {
    vi.stubGlobal('Audio', AudioFixture);
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(resolveQdnAudioDuration('/media', new AbortController().signal)).resolves.toBe(
      12345,
    );
    expect(fetch).not.toHaveBeenCalled();
  });
  it('parses actual audio bytes when native metadata fails', async () => {
    AudioFixture.fail = true;
    vi.stubGlobal('Audio', AudioFixture);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(wav())));
    await expect(resolveQdnAudioDuration('/media', new AbortController().signal)).resolves.toBe(
      1000,
    );
  });
  it('refuses an oversized download instead of loading arbitrary amounts into memory', async () => {
    AudioFixture.fail = true;
    vi.stubGlobal('Audio', AudioFixture);
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response('x', { headers: { 'content-length': String(100 * 1024 * 1024) } }),
        ),
    );
    await expect(resolveQdnAudioDuration('/media', new AbortController().signal)).rejects.toThrow(
      /unavailable/,
    );
  });
  it('does not start a download after cancellation', async () => {
    vi.stubGlobal('Audio', AudioFixture);
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const controller = new AbortController();
    controller.abort();
    await expect(resolveQdnAudioDuration('/media', controller.signal)).rejects.toThrow(/cancelled/);
    expect(fetch).not.toHaveBeenCalled();
  });
});
