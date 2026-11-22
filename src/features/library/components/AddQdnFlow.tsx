import { Spinner } from '../../../components/Spinner';
/* ============================================================
 * NodeFM Station — Add QDN Flow
 *
 * Wizard for adding an existing QDN audio resource to the
 * station library without duplicating the media.
 * ============================================================ */

import { useState, useCallback, useRef, useEffect } from 'react';
import { LoadingState } from '../../../components/LoadingState';
import { ErrorState } from '../../../components/ErrorState';
import { Modal } from '../../../components/Modal';
import {
  PublicationProgress,
  type PublicationProgressState,
} from '../../../components/PublicationProgress';
import {
  searchQdnResources,
  getQdnResourceUrl,
  ensureQdnResourceReady,
} from '../../../qortium/qdn';
import { useStationIdentity } from '../../station';
import { TaxonomyInput, useTaxonomy, getCanonicalTaxonomyValues } from '../../taxonomy';
import {
  AlbumInput,
  ArtistInput,
  ReleaseDateInput,
  TitleInput,
  isValidReleaseDateValue,
} from '../../metadata-intelligence';
import { publishNewTrackWithCover, readCoverFile } from '../services/coverService';
import { buildAddQdnTrackInput } from '../services/addQdnService';
import { qdnAudioDetails, parseManualAudioDuration } from '../services/qdnAudioDetails';
import { resolveQdnAudioDuration } from '../../../utils/qdnAudioDuration';
import { createTrack } from '../../tracks/services/trackService';
import { formatDurationMs, isValidDurationMs } from '../../../utils/duration';
import type { QdnResourceInfo } from '../../../qortium/qdn';

type Step = 'search' | 'confirm' | 'metadata' | 'importing' | 'done' | 'error';

type State = {
  step: Step;
  searchQuery: string;
  results: QdnResourceInfo[];
  searching: boolean;
  searchError: string | null;
  selected: QdnResourceInfo | null;
  durationMs: number | null;
  durationResolving: boolean;
  manualDuration: string;
  title: string;
  artist: string;
  album: string;
  releaseDate: string;
  description: string;
  genres: string;
  tags: string;
  coverFile: File | null;
  coverBytesBase64: string | null;
  coverWarning: string | null;
  error: string | null;
};

export function AddQdnFlow({
  onClose,
  onComplete,
}: {
  onClose: () => void;
  onComplete: () => void;
}) {
  const { ownerAddress, publisherName } = useStationIdentity();
  const { remember, genres: genreSuggestions, tags: tagSuggestions } = useTaxonomy();
  const durationRequest = useRef<AbortController | null>(null);
  useEffect(() => () => durationRequest.current?.abort(), []);
  const [publication, setPublication] = useState<PublicationProgressState | null>(null);

  const [state, setState] = useState<State>({
    step: 'search',
    searchQuery: '',
    results: [],
    searching: false,
    searchError: null,
    selected: null,
    durationMs: null,
    durationResolving: false,
    manualDuration: '',
    title: '',
    artist: '',
    album: '',
    releaseDate: '',
    description: '',
    genres: '',
    tags: '',
    coverFile: null,
    coverBytesBase64: null,
    coverWarning: null,
    error: null,
  });

  const handleSearch = useCallback(async () => {
    if (!state.searchQuery.trim()) return;

    setState((s) => ({ ...s, searching: true, searchError: null, results: [] }));

    try {
      const results = await searchQdnResources({
        service: 'AUDIO',
        query: state.searchQuery.trim(),
        limit: 20,
        includeMetadata: true,
        includeStatus: true,
      });

      setState((s) => ({ ...s, results, searching: false }));
    } catch (error) {
      setState((s) => ({
        ...s,
        searching: false,
        searchError: error instanceof Error ? error.message : 'Search failed.',
      }));
    }
  }, [state.searchQuery]);

  const handleSelect = useCallback(async (resource: QdnResourceInfo) => {
    durationRequest.current?.abort();
    const request = new AbortController();
    durationRequest.current = request;
    const details = qdnAudioDetails(resource);
    setState((s) => ({
      ...s,
      ...details,
      step: 'confirm',
      selected: resource,
      durationResolving: true,
      durationMs: null,
      manualDuration: '',
      coverFile: null,
      coverBytesBase64: null,
      coverWarning: null,
      error: null,
    }));
    try {
      const ref = {
        service: resource.service,
        name: resource.name,
        identifier: resource.identifier,
      };
      await ensureQdnResourceReady(ref);
      if (request.signal.aborted) return;
      const url = await getQdnResourceUrl(ref);
      const durationMs = await resolveQdnAudioDuration(url, request.signal);
      if (!request.signal.aborted)
        setState((s) => ({ ...s, durationMs, durationResolving: false, error: null }));
    } catch {
      if (!request.signal.aborted)
        setState((s) => ({
          ...s,
          durationResolving: false,
          error:
            'Automatic duration detection failed. Retry, or enter the correct duration below to add this track.',
        }));
    }
  }, []);

  const setManualDuration = (value: string) => {
    durationRequest.current?.abort();
    setState((s) => ({
      ...s,
      manualDuration: value,
      durationMs: parseManualAudioDuration(value),
      durationResolving: false,
      error: null,
    }));
  };

  const handleCoverSelected = useCallback(async (file: File) => {
    try {
      const cover = await readCoverFile(file);
      setState((s) => ({
        ...s,
        coverFile: file,
        coverBytesBase64: cover.bytesBase64,
        coverWarning: null,
        error: null,
      }));
    } catch (error) {
      setState((s) => ({
        ...s,
        error: error instanceof Error ? error.message : 'Failed to read cover image.',
      }));
    }
  }, []);

  const handleImport = useCallback(async () => {
    if (!state.selected || !ownerAddress) return;

    if (state.releaseDate.trim() && !isValidReleaseDateValue(state.releaseDate)) {
      setState((s) => ({
        ...s,
        step: 'error',
        error: 'Release date must use YYYY, YYYY-MM, or YYYY-MM-DD.',
      }));
      return;
    }

    if (state.durationMs === null || !isValidDurationMs(state.durationMs)) {
      setState((s) => ({
        ...s,
        step: 'error',
        error:
          'Cannot add this track because its audio duration could not be resolved or is invalid.',
      }));
      return;
    }

    setState((s) => ({ ...s, step: 'importing', error: null, coverWarning: null }));
    const hasCover = Boolean(state.coverFile && state.coverBytesBase64 && publisherName);
    const rows: PublicationProgressState['rows'] = [
      ...(hasCover
        ? [{ id: 'cover' as const, label: 'Cover image', status: 'active' as const }]
        : []),
      { id: 'track', label: 'Track metadata', status: 'active' },
    ];
    setPublication({ phase: 'publishing', rows });

    try {
      const genres = state.genres.trim()
        ? getCanonicalTaxonomyValues(state.genres, genreSuggestions)
        : undefined;
      const tags = state.tags.trim()
        ? getCanonicalTaxonomyValues(state.tags, tagSuggestions)
        : undefined;
      const track = createTrack(
        buildAddQdnTrackInput({
          title: state.title || state.selected.name || 'Untitled',
          artist: state.artist || undefined,
          album: state.album || undefined,
          releaseDate: state.releaseDate || undefined,
          description: state.description || undefined,
          audio: {
            service: state.selected.service,
            name: state.selected.name,
            identifier: state.selected.identifier || 'default',
          },
          durationMs: state.durationMs,
          genres,
          tags,
          ownerAddress,
        }),
      );

      await publishNewTrackWithCover({
        track,
        publisherName: publisherName!,
        cover:
          state.coverFile && state.coverBytesBase64 && publisherName
            ? {
                publisherName,
                title: track.title,
                file: state.coverFile,
                bytesBase64: state.coverBytesBase64,
              }
            : undefined,
      });

      remember('genres', genres ?? []);
      remember('tags', tags ?? []);

      setPublication((current) =>
        current
          ? {
              phase: 'success' as const,
              rows: current.rows.map((row) => ({
                ...row,
                status: 'succeeded' as const,
                error: undefined,
              })),
              error: undefined,
            }
          : current,
      );
      setState((s) => ({ ...s, step: 'done', coverWarning: null }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Import failed.';

      setPublication((current) =>
        current
          ? {
              phase: 'failed' as const,
              rows: current.rows.map((row) =>
                row.status === 'active'
                  ? { ...row, status: 'failed' as const, error: message }
                  : row,
              ),
              error: message,
            }
          : current,
      );
      setState((s) => ({
        ...s,
        step: 'error',
        error: message,
      }));
    }
  }, [
    state.selected,
    state.title,
    state.artist,
    state.album,
    state.releaseDate,
    state.description,
    state.genres,
    state.tags,
    state.coverFile,
    state.coverBytesBase64,
    state.durationMs,
    ownerAddress,
    publisherName,
    genreSuggestions,
    tagSuggestions,
    remember,
  ]);

  if (publication) {
    const title = publication.phase === 'success' ? 'Track Added' : 'Adding Track';

    return (
      <PublicationProgress
        title={title}
        state={publication}
        successMessage="Track added to library."
        onClose={onClose}
        onSuccess={onComplete}
      />
    );
  }

  return (
    <Modal title="Add from QDN" onClose={onClose} wide>
      <>
        {state.step === 'search' && (
          <div className="add-qdn__search">
            <p>Search for existing QDN audio resources to add to your library.</p>
            <div className="add-qdn__search-bar">
              <input
                type="text"
                value={state.searchQuery}
                onChange={(e) => setState((s) => ({ ...s, searchQuery: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Search QDN audio…"
              />
              <button
                className="button button--primary"
                type="button"
                onClick={handleSearch}
                disabled={state.searching || !state.searchQuery.trim()}
              >
                Search
              </button>
            </div>

            {state.searching && <LoadingState message="Searching QDN…" />}

            {state.searchError && (
              <ErrorState
                message="Search failed"
                detail={state.searchError}
                onRetry={handleSearch}
              />
            )}

            {!state.searching && state.results.length > 0 && (
              <div className="add-qdn__results">
                {state.results.map((r) => (
                  <button
                    type="button"
                    key={`${r.service}-${r.name}-${r.identifier ?? 'default'}`}
                    className="add-qdn__result-item"
                    onClick={() => handleSelect(r)}
                  >
                    <div className="add-qdn__result-info">
                      <strong>{r.metadata?.title ?? r.name}</strong>
                      {r.metadata?.description && (
                        <span className="add-qdn__result-desc">{r.metadata.description}</span>
                      )}
                      <span className="add-qdn__result-service">
                        {r.service} · Publisher: {r.name} · ID: {r.identifier || 'default'}
                      </span>
                      {qdnAudioDetails(r).artist && (
                        <span>Artist: {qdnAudioDetails(r).artist}</span>
                      )}
                      {qdnAudioDetails(r).album && <span>Album: {qdnAudioDetails(r).album}</span>}
                      {r.metadata?.tags?.length ? (
                        <span>Tags: {r.metadata.tags.join(', ')}</span>
                      ) : null}
                      {r.metadata?.category && <span>Category: {r.metadata.category}</span>}
                      {r.size != null && <span>Size: {(r.size / 1024 / 1024).toFixed(2)} MiB</span>}
                      {r.status?.status && <span>Status: {r.status.status}</span>}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {!state.searching && state.results.length === 0 && !state.searchError && (
              <p className="add-qdn__empty">Enter a search query to find QDN audio resources.</p>
            )}
          </div>
        )}

        {state.step === 'confirm' && state.selected && (
          <div className="add-qdn__confirm">
            <h3>Selected Resource</h3>
            <div className="add-qdn__resource-detail">
              <p>
                <strong>Title:</strong> {state.title}
              </p>
              <p>
                <strong>Publisher:</strong> {state.selected.name}
              </p>
              <p>
                <strong>Identifier:</strong> {state.selected.identifier || 'default'}
              </p>
              {state.artist && (
                <p>
                  <strong>Artist:</strong> {state.artist}
                </p>
              )}
              {state.album && (
                <p>
                  <strong>Album:</strong> {state.album}
                </p>
              )}
              <p>
                <strong>Service:</strong> {state.selected.service}
              </p>
              {state.selected.metadata?.description && (
                <p>
                  <strong>Description:</strong> {state.selected.metadata.description}
                </p>
              )}
              <p>
                <strong>Duration:</strong>{' '}
                {state.durationResolving ? (
                  <>
                    <Spinner /> Resolving
                  </>
                ) : state.durationMs !== null ? (
                  formatDurationMs(state.durationMs)
                ) : (
                  'Unknown'
                )}
              </p>
            </div>

            {state.error && <p className="form-error">{state.error}</p>}
            <label className="form-field">
              Duration (m:ss or h:mm:ss)
              <input
                type="text"
                placeholder="3:45"
                value={state.manualDuration}
                onChange={(e) => setManualDuration(e.target.value)}
              />
            </label>
            <p className="form-hint">Use the actual track length; this controls station timing.</p>
            {state.manualDuration && state.durationMs === null && (
              <p className="form-error">Enter a positive duration, for example 3:45.</p>
            )}
            <button
              className="button button--secondary"
              type="button"
              disabled={state.durationResolving}
              onClick={() => state.selected && void handleSelect(state.selected)}
            >
              Retry automatic duration
            </button>

            <div className="form-actions">
              <button
                className="button button--secondary"
                type="button"
                onClick={() => {
                  durationRequest.current?.abort();
                  setState((s) => ({ ...s, step: 'search', durationResolving: false }));
                }}
              >
                Back to Search
              </button>
              <button
                className="button button--primary"
                type="button"
                onClick={() => setState((s) => ({ ...s, step: 'metadata' }))}
                disabled={state.durationResolving}
              >
                Add Metadata
              </button>
            </div>
          </div>
        )}

        {state.step === 'metadata' && (
          <div className="add-qdn__metadata">
            <h3>Track Metadata</h3>
            <p>
              Duration:{' '}
              {state.durationMs !== null
                ? formatDurationMs(state.durationMs)
                : 'Unknown — enter the correct duration to publish.'}
            </p>
            <label className="form-field">
              Duration (m:ss or h:mm:ss)
              <input
                type="text"
                placeholder="3:45"
                value={state.manualDuration}
                onChange={(e) => setManualDuration(e.target.value)}
              />
            </label>
            <p className="form-hint">Use the actual track length; this controls station timing.</p>
            {state.manualDuration && state.durationMs === null && (
              <p className="form-error">Enter a positive duration, for example 3:45.</p>
            )}

            <label className="form-field">
              Title
              <TitleInput
                value={state.title}
                onChange={(value) => setState((s) => ({ ...s, title: value }))}
                artistValue={state.artist}
              />
            </label>

            <label className="form-field">
              Artist
              <ArtistInput
                value={state.artist}
                onChange={(value) => setState((s) => ({ ...s, artist: value }))}
              />
            </label>

            <label className="form-field">
              Album
              <AlbumInput
                value={state.album}
                onChange={(value) => setState((s) => ({ ...s, album: value }))}
                artistValue={state.artist}
                placeholder="Optional album name"
              />
            </label>

            <label className="form-field">
              Release date
              <ReleaseDateInput
                value={state.releaseDate}
                onChange={(value) => setState((s) => ({ ...s, releaseDate: value }))}
                placeholder="1991-08-12"
              />
            </label>

            <label className="form-field">
              Description
              <textarea
                value={state.description}
                onChange={(e) => setState((s) => ({ ...s, description: e.target.value }))}
                rows={2}
              />
            </label>

            <label className="form-field">
              Genres
              <TaxonomyInput
                kind="genres"
                value={state.genres}
                onChange={(value) => setState((s) => ({ ...s, genres: value }))}
                placeholder="Rock, Electronic"
              />
            </label>

            <label className="form-field">
              Tags
              <TaxonomyInput
                kind="tags"
                value={state.tags}
                onChange={(value) => setState((s) => ({ ...s, tags: value }))}
                placeholder="chill, upbeat, instrumental"
              />
            </label>

            <div className="form-field">
              <label>Cover Image (optional, max 2 MB)</label>
              <input
                type="file"
                accept="image/*"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void handleCoverSelected(file);
                }}
              />
              {state.coverBytesBase64 ? (
                <img
                  src={state.coverFile ? URL.createObjectURL(state.coverFile) : ''}
                  alt="Cover preview"
                  className="upload-flow__cover-preview"
                />
              ) : null}
            </div>

            <div className="form-actions">
              <button
                className="button button--secondary"
                type="button"
                onClick={() => setState((s) => ({ ...s, step: 'confirm' }))}
              >
                Back
              </button>
              <button
                className="button button--primary"
                type="button"
                onClick={handleImport}
                disabled={
                  !state.title || state.durationMs === null || !isValidDurationMs(state.durationMs)
                }
              >
                Add to Library
              </button>
            </div>
          </div>
        )}

        {state.step === 'importing' && <LoadingState message="Adding track to library…" />}

        {state.step === 'done' && (
          <div className="upload-flow__done">
            <p className="upload-flow__success">✅ Track added to library!</p>
            {state.coverWarning ? (
              <p className="upload-flow__partial">{state.coverWarning}</p>
            ) : null}
            <div className="form-actions">
              <button className="button button--primary" type="button" onClick={onComplete}>
                Done
              </button>
            </div>
          </div>
        )}

        {state.step === 'error' && (
          <ErrorState message="Import failed" detail={state.error ?? undefined} />
        )}
      </>
    </Modal>
  );
}
