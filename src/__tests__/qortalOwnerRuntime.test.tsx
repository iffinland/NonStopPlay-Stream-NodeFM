// @vitest-environment jsdom
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const host = vi.hoisted(() => ({
  account: 'Q-publisher',
  configOffline: false,
  namesOffline: false,
  ownerOffline: false,
  requests: [] as string[],
  accountWait: null as Promise<void> | null,
  published: [] as Record<string, unknown>[],
}));

vi.mock('../qortium/bridge', async (original) => {
  const request = vi.fn(async (payload: Record<string, unknown>) => {
    const action = String(payload.action);
    host.requests.push(action);
    switch (action) {
      case 'GET_USER_ACCOUNT':
        if (host.accountWait) await host.accountWait;
        return { address: host.account, publicKey: 'fixture-key' };
      case 'GET_ACCOUNT_NAMES':
        if (host.namesOffline) throw new Error('Name list unavailable');
        // Even a display name matching the APP is not proof of ownership.
        return [{ name: 'NodeFM' }];
      case 'GET_NAME_DATA':
        if (host.ownerOffline) throw new Error('Publisher lookup unavailable');
        return { name: 'NodeFM', owner: 'Q-publisher' };
      case 'GET_QDN_RESOURCE_STATUS':
        return { status: host.configOffline ? 'READY' : 'NOT_PUBLISHED' };
      case 'SEARCH_QDN_RESOURCES':
        return [];
      case 'FETCH_QDN_RESOURCE':
        throw new Error(
          host.configOffline ? 'Node data unavailable' : 'QDN error 1401: File not found',
        );
      case 'SHOW_ACTIONS':
        return ['PUBLISH_QDN_RESOURCE', 'PUBLISH_MULTIPLE_QDN_RESOURCES'];
      case 'PUBLISH_MULTIPLE_QDN_RESOURCES':
        return (payload.resources as Record<string, unknown>[]).map((resource) => {
          host.published.push(resource);
          return {
            signature: `sig-${host.published.length}`,
            name: resource.name,
            identifier: resource.identifier,
            service: resource.service === 'AUDIO' ? 600 : resource.service === 'IMAGE' ? 400 : 1110,
          };
        });
      default:
        throw new Error(`Unexpected host action: ${action}`);
    }
  });
  return {
    ...(await original<typeof import('../qortium/bridge')>()),
    sendBridgeRequest: request,
    getSelectedAccount: () => request({ action: 'GET_USER_ACCOUNT' }),
  };
});

import { App } from '../app/App';
import { resetStationStore } from '../features/station/services/stationStore';
import { resetRadioTimelineData } from '../features/radio/timeline/radioTimelineDataStore';
import { refreshAuth } from '../qortium/auth';
import { getLibraryTracks, resetLibrary } from '../features/library/services/libraryService';

vi.mock('../utils/localAudioDuration', () => ({
  resolvePublishAudioDuration: vi.fn(async () => 1000),
}));

vi.mock('../features/bulk-import/services/audioMetadata', () => ({
  extractEmbeddedAudioMetadata: vi.fn(async () => ({
    title: 'Selected song',
    artist: 'Artist',
    album: '',
    releaseDate: '',
    genres: [],
    durationMs: 1000,
    picture: null,
  })),
}));

beforeEach(() => {
  host.account = 'Q-publisher';
  host.configOffline = false;
  host.namesOffline = false;
  host.ownerOffline = false;
  host.requests = [];
  host.accountWait = null;
  host.published = [];
  vi.stubGlobal('qortalRequest', vi.fn());
  window.sessionStorage.clear();
  window._qdnName = 'NodeFM';
  window._qdnBase = '';
  window.history.replaceState({}, '', '/');
  refreshAuth();
  resetStationStore();
  resetLibrary();
  resetRadioTimelineData();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('real app shell with Qortal account and publisher evidence', () => {
  it('shows a successful single upload in the admin list without waiting for QDN search indexing', async () => {
    window.history.replaceState({}, '', '/admin/library');
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Upload Audio' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Select Audio File' }));
    const input = document.querySelector('input[type="file"][accept*=".mp3"]')!;
    fireEvent.change(input, {
      target: { files: [new File(['audio'], 'Fresh song.mp3', { type: 'audio/mpeg' })] },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Publish Track' }));
    const success = await screen.findByRole('dialog', { name: 'Track Published' });
    expect(getLibraryTracks()).toHaveLength(1);
    expect(getLibraryTracks()[0].title).toBe('Fresh song');
    fireEvent.click(within(success).getAllByRole('button', { name: 'Close' }).slice(-1)[0]);
    await screen.findByText('Fresh song');
  });

  it.each(['admin', 'listener'] as const)(
    'publishes the full %s bulk selection with one app action and no prepare steps',
    async (role) => {
      window.history.replaceState({}, '', role === 'admin' ? '/admin/library' : '/submit-music');
      render(<App />);
      if (role === 'admin')
        fireEvent.click(await screen.findByRole('button', { name: 'Bulk Import' }));
      else {
        await screen.findByRole('button', { name: 'Sign out' });
        fireEvent.click(await screen.findByRole('button', { name: 'Bulk Submit Music' }));
      }
      await screen.findByRole('button', { name: 'Add audio files' });
      const input = document.querySelector('input[type="file"][multiple]')!;
      fireEvent.change(input, {
        target: {
          files: [
            new File(['audio'], 'one.mp3', { type: 'audio/mpeg' }),
            new File(['audio'], 'two.mp3', { type: 'audio/mpeg' }),
          ],
        },
      });
      await screen.findAllByDisplayValue('Selected song');
      const publish = screen.getByRole('button', {
        name: role === 'admin' ? 'Publish selected' : 'Submit selected',
      });
      await waitFor(() => expect((publish as HTMLButtonElement).disabled).toBe(false));
      expect(screen.queryByRole('button', { name: /Prepare/ })).toBeNull();
      fireEvent.click(publish);
      await screen.findByRole('dialog', {
        name: role === 'listener' ? 'Tracks submitted' : 'Tracks published',
      });
      expect(host.published.map((r) => r.service)).toEqual(['AUDIO', 'AUDIO', 'JSON', 'JSON']);
      expect(
        host.requests.filter((action) => action === 'PUBLISH_MULTIPLE_QDN_RESOURCES'),
      ).toHaveLength(2);
      if (role === 'admin') expect(getLibraryTracks()).toHaveLength(2);
      else expect(host.published[0].identifier).toMatch(/^nodefm-submission-audio-/);
    },
  );
  it('keeps the admin upload modal and metadata mounted across file-picker focus and account revalidation', async () => {
    window.history.replaceState({}, '', '/admin/library');
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Upload Audio' }));
    const modal = await screen.findByRole('dialog', { name: 'Upload Audio' });
    // A native chooser hides the frame; returning starts an asynchronous account check.
    let finish!: () => void;
    host.accountWait = new Promise((resolve) => {
      finish = resolve;
    });
    fireEvent.click(within(modal).getByRole('button', { name: 'Select Audio File' }));
    const input = document.querySelector('input[type="file"][accept*=".mp3"]')!;
    fireEvent(window, new Event('focus'));
    expect(screen.getByRole('dialog', { name: 'Upload Audio' })).toBe(modal);
    fireEvent.change(input, {
      target: { files: [new File(['audio'], 'local-song.mp3', { type: 'audio/mpeg' })] },
    });
    const title = await within(modal).findByDisplayValue('local-song');
    fireEvent.change(title, { target: { value: 'Edited title' } });
    // Optional name discovery may also fail on return; the same authenticated
    // wallet must still keep its form and selected bytes.
    host.namesOffline = true;
    await act(async () => finish());
    expect(screen.getByRole('dialog', { name: 'Upload Audio' })).toBe(modal);
    expect((within(modal).getByDisplayValue('Edited title') as HTMLInputElement).value).toBe(
      'Edited title',
    );
    expect(host.requests.filter((action) => action === 'GET_USER_ACCOUNT')).toHaveLength(2);
  });

  it.each(['admin', 'listener'] as const)(
    'keeps %s bulk selection and editable rows after returning from the picker',
    async (role) => {
      window.history.replaceState({}, '', role === 'admin' ? '/admin/library' : '/submit-music');
      render(<App />);
      if (role === 'admin')
        fireEvent.click(await screen.findByRole('button', { name: 'Bulk Import' }));
      else {
        await screen.findByRole('button', { name: 'Sign out' });
        fireEvent.click(await screen.findByRole('button', { name: 'Bulk Submit Music' }));
      }
      const add = await screen.findByRole('button', { name: /Add audio files/ });
      let finish!: () => void;
      host.accountWait = new Promise((resolve) => {
        finish = resolve;
      });
      fireEvent.click(add);
      const input = document.querySelector('input[type="file"][multiple]')!;
      fireEvent(window, new Event('focus'));
      expect(screen.getByRole('button', { name: /Add audio files/ })).toBe(add);
      fireEvent.change(input, {
        target: { files: [new File(['audio'], 'bulk-song.mp3', { type: 'audio/mpeg' })] },
      });
      await screen.findByDisplayValue('Selected song');
      await act(async () => finish());
      expect(screen.getByRole('button', { name: /Add audio files/ })).toBe(add);
      expect(screen.getByDisplayValue('Selected song')).toBeTruthy();
    },
  );

  it('provides an admin main-area route back to the public station', async () => {
    window.history.replaceState({}, '', '/admin/library');
    render(<App />);
    const main = await screen.findByRole('main');
    const back = await within(main).findByRole('link', { name: '← Back to Station' });
    fireEvent.click(back);
    await screen.findByRole('heading', { name: 'NodeFM Radio' });
    expect(window.location.pathname).toBe('/');
  });

  it('still removes an open admin form when the Hub actually switches accounts', async () => {
    window.history.replaceState({}, '', '/admin/library');
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Upload Audio' }));
    await screen.findByRole('dialog', { name: 'Upload Audio' });
    host.account = 'Q-visitor';
    fireEvent(window, new Event('focus'));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Upload Audio' })).toBeNull());
    await screen.findByRole('heading', { name: 'NodeFM Radio' });
    expect(screen.queryByRole('link', { name: 'Admin' })).toBeNull();
    expect(window.location.pathname).toBe('/');
  });
  it('automatically exposes Admin to the APP owner with no station configuration', async () => {
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    const admin = await screen.findByRole('link', { name: 'Admin' });
    expect(host.requests.filter((action) => action === 'GET_USER_ACCOUNT')).toHaveLength(1);
    expect(host.requests).toContain('GET_NAME_DATA');
    fireEvent.click(admin);
    const settings = await screen.findByRole('link', { name: 'Station' });
    expect(window.location.pathname).toBe('/admin');
    fireEvent.click(settings);
    await screen.findByRole('textbox', { name: 'Station name' });
    expect(window.location.pathname).toBe('/admin/station');
  });

  it('allows direct owner navigation to /admin/station while ownership is still resolving', async () => {
    window.history.replaceState({}, '', '/admin/station');
    render(<App />);
    await screen.findByRole('heading', { name: 'Station Settings' });
    await screen.findByRole('textbox', { name: 'Station name' });
    expect(window.location.pathname).toBe('/admin/station');
  });

  it('never grants Admin to another account with a matching displayed name', async () => {
    host.account = 'Q-visitor';
    render(<App />);
    await screen.findByRole('button', { name: 'Sign out' });
    await waitFor(() => expect(host.requests).toContain('GET_NAME_DATA'));
    expect(screen.queryByRole('link', { name: 'Admin' })).toBeNull();
    window.history.pushState({}, '', '/admin/station');
    fireEvent(window, new PopStateEvent('popstate'));
    await waitFor(() => expect(window.location.pathname).toBe('/'));
    expect(screen.queryByRole('heading', { name: 'Station Settings' })).toBeNull();
  });

  it('removes the owner menu after the active Hub account changes to a visitor', async () => {
    render(<App />);
    await screen.findByRole('link', { name: 'Admin' });
    host.account = 'Q-visitor';
    fireEvent(window, new Event('focus'));
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Admin' })).toBeNull());
    await screen.findByRole('button', { name: 'Sign out' });
    expect(host.requests.filter((action) => action === 'GET_USER_ACCOUNT')).toHaveLength(2);
    expect(screen.queryByRole('link', { name: 'Admin' })).toBeNull();
  });

  it('does not hide Admin from the publisher when station data cannot be loaded', async () => {
    host.configOffline = true;
    render(<App />);
    await screen.findByRole('link', { name: 'Admin' });
    expect(host.requests).toContain('FETCH_QDN_RESOURCE');
  });

  it('uses the authenticated address and name owner even if the account name list fails', async () => {
    host.namesOffline = true;
    render(<App />);
    await screen.findByRole('link', { name: 'Admin' });
    await screen.findByText('Q-publis…');
  });

  it('keeps ownership ungranted on lookup failure and offers a working retry', async () => {
    host.ownerOffline = true;
    render(<App />);
    const retry = await screen.findByRole('button', { name: 'Retry owner check' });
    expect(screen.queryByRole('link', { name: 'Admin' })).toBeNull();
    host.ownerOffline = false;
    fireEvent.click(retry);
    await screen.findByRole('link', { name: 'Admin' });
  });
});
