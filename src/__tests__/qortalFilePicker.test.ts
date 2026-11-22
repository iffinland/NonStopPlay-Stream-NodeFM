// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pickPublishFile } from '../qortium/filePicker';
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.innerHTML = '';
});
describe('browser file selection', () => {
  it('opens synchronously within the user gesture and returns the selected File', async () => {
    let clicked = false;
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (
      this: HTMLInputElement,
    ) {
      clicked = true;
    });
    const pending = pickPublishFile();
    expect(clicked).toBe(true);
    const input = document.querySelector('input')!;
    const file = new File(['a'], 'song.mp3', { type: 'audio/mpeg' });
    Object.defineProperty(input, 'files', { value: [file] });
    input.dispatchEvent(new Event('change'));
    expect(await pending).toBe(file);
    expect(document.querySelector('input')).toBeNull();
  });
  it('cleans up cancellation without requesting account access or publishing', async () => {
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    const pending = pickPublishFile();
    document.querySelector('input')!.dispatchEvent(new Event('cancel'));
    expect(await pending).toBeNull();
    expect(document.querySelector('input')).toBeNull();
  });
  it('allows change to win before the legacy focus cancellation fallback', async () => {
    vi.useFakeTimers();
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    const pending = pickPublishFile();
    window.dispatchEvent(new Event('focus'));
    const input = document.querySelector('input')!;
    const file = new File(['a'], 'song.mp3');
    Object.defineProperty(input, 'files', { value: [file] });
    input.dispatchEvent(new Event('change'));
    await vi.runAllTimersAsync();
    expect(await pending).toBe(file);
  });
});
