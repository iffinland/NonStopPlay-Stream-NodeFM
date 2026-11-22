// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SubmissionAudioPreview } from './SubmissionAudioPreview';
import { ensureQdnResourceReady, getQdnResourceUrl } from '../../../qortium/qdn';
import { getAudioEngine } from '../../../audio/AudioEngine';
import { createListenerTrackSubmission } from '../services/submissionService';
vi.mock('../../../qortium/qdn', () => ({
  ensureQdnResourceReady: vi.fn(),
  getQdnResourceUrl: vi.fn(),
}));
vi.mock('../../../audio/AudioEngine', () => ({
  getAudioEngine: vi.fn(() => ({ pause: vi.fn() })),
}));
const submission = createListenerTrackSubmission({
  submissionId: 'preview-1',
  submitterName: 'Listener',
  submitterAddress: 'Q-listener',
  title: 'Song to review',
  artist: 'Artist',
  audio: { service: 'AUDIO', name: 'Listener', identifier: 'nodefm-submission-audio-preview-1' },
  durationMs: 1000,
});
beforeEach(() => {
  vi.mocked(ensureQdnResourceReady).mockResolvedValue(undefined);
  vi.mocked(getQdnResourceUrl).mockResolvedValue(
    '/arbitrary/AUDIO/Listener/nodefm-submission-audio-preview-1',
  );
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
describe('submission preview in the app', () => {
  it('loads the exact non-default resource in modal audio controls and pauses the live player only when playback starts', async () => {
    const pause = vi.fn();
    vi.mocked(getAudioEngine).mockReturnValue({ pause } as unknown as ReturnType<
      typeof getAudioEngine
    >);
    const close = vi.fn();
    const open = vi.spyOn(window, 'open');
    render(<SubmissionAudioPreview submission={submission} onClose={close} />);
    const audio = screen.getByLabelText('Submission audio preview') as HTMLAudioElement;
    await waitFor(() =>
      expect(audio.getAttribute('src')).toBe(
        '/arbitrary/AUDIO/Listener/nodefm-submission-audio-preview-1',
      ),
    );
    expect(ensureQdnResourceReady).toHaveBeenCalledWith(submission.audio);
    expect(getQdnResourceUrl).toHaveBeenCalledWith(submission.audio);
    expect(audio.controls).toBe(true);
    expect(audio.autoplay).toBe(false);
    expect(pause).not.toHaveBeenCalled();
    fireEvent.play(audio);
    expect(pause).toHaveBeenCalledTimes(1);
    expect(open).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Close preview' }));
    expect(close).toHaveBeenCalledTimes(1);
  });
  it('stops and unloads preview audio when the modal unmounts', async () => {
    const view = render(<SubmissionAudioPreview submission={submission} onClose={vi.fn()} />);
    const audio = screen.getByLabelText('Submission audio preview') as HTMLAudioElement;
    await waitFor(() => expect(audio.getAttribute('src')).toBeTruthy());
    view.unmount();
    expect(audio.pause).toHaveBeenCalled();
    expect(audio.getAttribute('src')).toBeNull();
  });
  it('allows a read-only reload when media is unavailable, without a new tab or transaction', async () => {
    vi.mocked(ensureQdnResourceReady).mockRejectedValueOnce(
      new Error('Resource still downloading'),
    );
    render(<SubmissionAudioPreview submission={submission} onClose={vi.fn()} />);
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Reload audio' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Submission audio preview').getAttribute('src')).toBeTruthy(),
    );
    expect(ensureQdnResourceReady).toHaveBeenCalledTimes(2);
  });
  it('ignores a late readiness result after the preview is closed', async () => {
    let ready!: () => void;
    vi.mocked(ensureQdnResourceReady).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          ready = () => resolve(undefined);
        }),
    );
    const view = render(<SubmissionAudioPreview submission={submission} onClose={vi.fn()} />);
    view.unmount();
    await act(async () => ready());
    expect(getQdnResourceUrl).not.toHaveBeenCalled();
  });
});
