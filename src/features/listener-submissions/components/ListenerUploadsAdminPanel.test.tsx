// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { ListenerUploadsAdminPanel } from './ListenerUploadsAdminPanel';
import { createListenerTrackSubmission } from '../services/submissionService';
import { getQdnResourceUrl } from '../../../qortium/qdn';
const host = vi.hoisted(() => ({
  accept: vi.fn(),
  reject: vi.fn(),
  refresh: vi.fn(),
  refreshLibrary: vi.fn(),
}));
const submission = createListenerTrackSubmission({
  submissionId: 'panel-preview',
  submitterName: 'Listener',
  submitterAddress: 'Q-listener',
  title: 'Review this song',
  audio: {
    service: 'AUDIO',
    name: 'Listener',
    identifier: 'nodefm-submission-audio-panel-preview',
  },
  durationMs: 1000,
});
vi.mock('../useListenerSubmissions', () => ({
  useListenerSubmissions: () => ({
    reviews: [
      {
        submission,
        status: 'PENDING',
        moderation: null,
        metadata: {
          service: 'JSON',
          publisherName: 'Listener',
          identifier: 'nodefm-track-submission-panel-preview',
          created: 0,
          updated: null,
        },
      },
    ],
    diagnostics: [],
    loaded: true,
    loading: false,
    incomplete: false,
    error: null,
    ...host,
  }),
}));
vi.mock('../../../hooks/useLibrary', () => ({
  useLibrary: () => ({ refresh: host.refreshLibrary }),
}));
vi.mock('../../../qortium/qdn', () => ({
  ensureQdnResourceReady: vi.fn(),
  getQdnResourceUrl: vi.fn(async () => '/preview/audio'),
}));
beforeEach(() => {
  Object.values(host).forEach((fn) => fn.mockReset());
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
describe('moderation preview and transaction controls', () => {
  it('opens preview in a modal and resolves the submitted resource without accepting it', async () => {
    const open = vi.spyOn(window, 'open');
    render(<ListenerUploadsAdminPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Preview Audio' }));
    await screen.findByRole('dialog', { name: 'Preview submission' });
    await act(async () => {});
    expect(getQdnResourceUrl).toHaveBeenCalledWith(submission.audio);
    expect(host.accept).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });
  it('keeps accept single-flight, displays a spinner and offers no Retry during or after the request', async () => {
    let finish!: () => void;
    host.accept.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    render(<ListenerUploadsAdminPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    const modal = screen.getByRole('dialog', { name: 'Accept submission' });
    fireEvent.click(within(modal).getByRole('button', { name: 'Accept' }));
    expect(modal.querySelector('.progress-spinner')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    expect(host.accept).toHaveBeenCalledTimes(1);
    await act(async () => finish());
    await screen.findByText('Submission accepted.');
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    expect(host.accept).toHaveBeenCalledTimes(1);
  });
});
