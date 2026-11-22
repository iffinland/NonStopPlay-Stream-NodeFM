// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AddQdnFlow } from './AddQdnFlow';
import { TaxonomyContext } from '../../taxonomy/taxonomyContext';
import { MetadataIntelligenceContext } from '../../metadata-intelligence/metadataIntelligenceContext';
import { searchQdnResources } from '../../../qortium/qdn';
import { resolveQdnAudioDuration } from '../../../utils/qdnAudioDuration';
import { publishNewTrackWithCover } from '../services/coverService';
vi.mock('../../station', () => ({
  useStationIdentity: () => ({ ownerAddress: 'Q-owner', publisherName: 'Station' }),
}));
vi.mock('../../../qortium/qdn', () => ({
  searchQdnResources: vi.fn(),
  ensureQdnResourceReady: vi.fn(),
  getQdnResourceUrl: vi.fn(async () => '/arbitrary/AUDIO/Publisher/song'),
}));
vi.mock('../../../utils/qdnAudioDuration', () => ({ resolveQdnAudioDuration: vi.fn() }));
vi.mock('../services/coverService', () => ({
  publishNewTrackWithCover: vi.fn(),
  readCoverFile: vi.fn(),
}));
const resource = {
  service: 'AUDIO',
  name: 'Publisher',
  identifier: 'song',
  size: 12345,
  metadata: {
    title: 'Ameno',
    description: 'title=Ameno;author=Era;album=Mix',
    tags: ['dance'],
    category: 'MUSIC',
  },
  status: { status: 'READY' },
};
beforeEach(() => {
  vi.mocked(searchQdnResources).mockResolvedValue([
    resource,
    { ...resource, identifier: 'another-song', metadata: { title: 'Another song' } },
  ]);
  vi.mocked(resolveQdnAudioDuration).mockRejectedValue(new Error('Codec or node unavailable'));
  vi.mocked(publishNewTrackWithCover).mockReset();
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
async function select() {
  render(
    <TaxonomyContext.Provider value={{ genres: [], tags: [], remember: vi.fn() }}>
      <MetadataIntelligenceContext.Provider
        value={{
          index: { artists: [], titlesByArtist: new Map(), albumsByArtist: new Map(), albums: [] },
          artists: [],
          getTitlesForArtist: () => [],
          getAlbumsForArtist: () => [],
        }}
      >
        <AddQdnFlow onClose={vi.fn()} onComplete={vi.fn()} />
      </MetadataIntelligenceContext.Provider>
    </TaxonomyContext.Provider>,
  );
  fireEvent.change(screen.getByPlaceholderText('Search QDN audio…'), {
    target: { value: 'Ameno' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  const result = await screen.findByRole('button', { name: /Ameno.*Publisher.*song/ });
  expect(result.textContent).toContain('Artist: Era');
  expect(result.textContent).toContain('Album: Mix');
  expect(result.textContent).toContain('Tags: dance');
  expect(searchQdnResources).toHaveBeenCalledWith(
    expect.objectContaining({ service: 'AUDIO', includeMetadata: true, includeStatus: true }),
  );
  fireEvent.click(result);
}
describe('adding QDN audio without a browser-decoded duration', () => {
  it('lets the owner edit metadata and add the original reference with an explicit valid duration', async () => {
    await select();
    await screen.findByText(/Automatic duration detection failed/);
    fireEvent.click(screen.getByRole('button', { name: 'Add Metadata' }));
    expect(screen.getByRole('heading', { name: 'Track Metadata' })).toBeTruthy();
    expect(screen.getByDisplayValue('Era')).toBeTruthy();
    expect(screen.getByDisplayValue('Mix')).toBeTruthy();
    const add = screen.getByRole('button', { name: 'Add to Library' }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    fireEvent.change(screen.getByRole('textbox', { name: 'Duration (m:ss or h:mm:ss)' }), {
      target: { value: '3:45' },
    });
    expect(add.disabled).toBe(false);
    fireEvent.click(add);
    await waitFor(() =>
      expect(publishNewTrackWithCover).toHaveBeenCalledWith(
        expect.objectContaining({
          track: expect.objectContaining({
            durationMs: 225000,
            artist: 'Era',
            album: 'Mix',
            audio: { service: 'AUDIO', name: 'Publisher', identifier: 'song' },
          }),
        }),
      ),
    );
  });
  it('does not publish a guessed or malformed duration and supports an automatic retry', async () => {
    await select();
    await screen.findByText(/Automatic duration detection failed/);
    const duration = screen.getByRole('textbox', { name: 'Duration (m:ss or h:mm:ss)' });
    fireEvent.change(duration, { target: { value: '3:99' } });
    expect(publishNewTrackWithCover).not.toHaveBeenCalled();
    vi.mocked(resolveQdnAudioDuration).mockResolvedValueOnce(123000);
    fireEvent.click(screen.getByRole('button', { name: 'Retry automatic duration' }));
    await screen.findByText('2:03');
    fireEvent.click(screen.getByRole('button', { name: 'Add Metadata' }));
    expect(
      (screen.getByRole('button', { name: 'Add to Library' }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });
});
