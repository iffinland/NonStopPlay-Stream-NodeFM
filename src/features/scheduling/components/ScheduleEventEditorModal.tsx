import { Spinner } from '../../../components/Spinner';
/* ============================================================
 * NodeFM Station — Schedule Event Editor Modal
 *
 * Creates/edits a concrete UTC ScheduleEvent using station-local
 * wall-clock fields. Supports immutable playlist sources and
 * Request Show dynamic-program sources.
 * ============================================================ */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '../../../components/Modal';
import { UtcTimeInput } from '../../../components/UtcTimeInput';
import { QdnTransactionFlow } from '../../../components/QdnTransactionFlow';
import {
  createQdnTransactionState,
  markQdnTransactionChunkActive,
  type QdnTransactionState,
} from '../../../components/qdnTransactionFlow';
import { useStation, useStationIdentity } from '../../station';
import { usePlaylists } from '../../../hooks/usePlaylists';
import { useLibrary } from '../../../hooks/useLibrary';
import { useLikes } from '../../likes/useLikes';
import { useRequestShow } from '../../dynamic-programs/request-show/useRequestShow';
import { useScheduler } from '../hooks/useScheduler';
import { saveScheduledProgramAction, saveRecurringProgramAction } from '../services/scheduleStore';
import { ProgramPeriodDialog } from './ProgramPeriodDialog';
import type { ScheduleEvent, Track } from '../../../types/domain';
import { getNowUtcMs } from '../../radio/timeline';
import { isValidDurationMs } from '../../../utils/duration';
import {
  parseLocalDateInput,
  formatZonedDateInput,
  addDaysToLocalDate,
  parseLocalTimeInput,
  requireUnambiguousZonedUtcMs,
} from '../services/timezone';

export type ScheduleEventEditorModalProps = {
  mode: 'create' | 'edit';
  event?: ScheduleEvent;
  initialDate?: string;
  initialStartTime?: string;
  initialEndTime?: string;
  onClose: () => void;
};

function toTimeInput(utcMs: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(utcMs));
}

function rankFromAggregates(
  tracks: readonly Track[],
  aggregates: Record<string, { count: number }>,
) {
  return tracks
    .filter((track) => (aggregates[track.trackId]?.count ?? 0) > 0)
    .map((track) => ({
      trackId: track.trackId,
      likeCount: aggregates[track.trackId]?.count ?? 0,
      likerAddresses: [] as string[],
    }))
    .sort((left, right) => {
      if (right.likeCount !== left.likeCount) {
        return right.likeCount - left.likeCount;
      }

      return left.trackId.localeCompare(right.trackId);
    });
}

export function ScheduleEventEditorModal({
  mode,
  event,
  initialDate,
  initialStartTime,
  initialEndTime,
  onClose,
}: ScheduleEventEditorModalProps) {
  const { station } = useStation();
  const { publisherName, ownerAddress } = useStationIdentity();
  const { playlists, getVersions } = usePlaylists();
  const { deleteEvent } = useScheduler();
  const { tracks: libraryTracks, loaded: libraryLoaded, loading: libraryLoading } = useLibrary();
  const { definitions, loaded: requestShowLoaded, loading: requestShowLoading } = useRequestShow();
  const timeZone = station?.timezone ?? '';

  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [repeat, setRepeat] = useState<'once' | 'daily' | 'weekly'>('once');
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([]);
  const [reviewing, setReviewing] = useState(false);
  const [startTime, setStartTime] = useState('12:00');
  const [endTime, setEndTime] = useState('13:00');
  const [sourceType, setSourceType] = useState<'playlist' | 'dynamic-program'>('playlist');
  const [playlistId, setPlaylistId] = useState('');
  const [versionId, setVersionId] = useState('');
  const [programDefinitionId, setProgramDefinitionId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const writeStartedRef = useRef(false);
  const [writeStarted, setWriteStarted] = useState(false);
  const [transaction, setTransaction] = useState<QdnTransactionState | null>(null);

  const eligibleTracks = useMemo(
    () => libraryTracks.filter((track) => isValidDurationMs(track.durationMs)),
    [libraryTracks],
  );
  const trackIds = useMemo(() => eligibleTracks.map((track) => track.trackId), [eligibleTracks]);
  const {
    aggregates,
    ready: likesReady,
    loading: likesLoading,
    incomplete: likesIncomplete,
  } = useLikes(trackIds);

  useEffect(() => {
    if (!timeZone) {
      return;
    }

    if (event) {
      setTitle(event.title ?? '');
      setDate(formatZonedDateInput(Date.parse(event.startUtc), timeZone));
      setEndDate(formatZonedDateInput(Date.parse(event.endUtc), timeZone));
      setStartTime(toTimeInput(Date.parse(event.startUtc), timeZone));
      setEndTime(toTimeInput(Date.parse(event.endUtc), timeZone));
      setSourceType(event.source.type);

      if (event.source.type === 'playlist') {
        setPlaylistId(event.source.playlistId);
        setVersionId(event.source.playlistVersionId);
        setProgramDefinitionId('');
      } else {
        setPlaylistId('');
        setVersionId('');
        setProgramDefinitionId(event.source.programDefinitionId);
      }
      return;
    }

    setDate(initialDate ?? formatZonedDateInput(Date.now(), timeZone));
    setEndDate(initialDate ?? formatZonedDateInput(Date.now(), timeZone));
    setStartTime(initialStartTime ?? '12:00');
    setEndTime(initialEndTime ?? '13:00');
    setSourceType('playlist');
    setPlaylistId('');
    setVersionId('');
    setProgramDefinitionId('');
  }, [event, initialDate, initialEndTime, initialStartTime, timeZone]);

  const versions = useMemo(
    () => (playlistId ? getVersions(playlistId) : []),
    [getVersions, playlistId],
  );

  const requestShowPlan = () => {
    const definition = definitions.find(
      (candidate) => candidate.programDefinitionId === programDefinitionId,
    );

    if (!definition) {
      throw new Error('Selected Request Show definition is no longer available.');
    }

    if (!publisherName) {
      throw new Error('A registered Qortal name is required to materialize Request Show.');
    }

    if (!libraryLoaded) {
      throw new Error('Station library is not ready. Wait for library loading to finish.');
    }

    if (!requestShowLoaded) {
      throw new Error('Request Show configuration is not ready.');
    }

    if (!likesReady) {
      throw new Error('Like records are not ready. Wait for Like loading to finish.');
    }

    return {
      definition,
      tracks: eligibleTracks,
      ranking: rankFromAggregates(eligibleTracks, aggregates),
    };
  };

  const handleSave = async (confirmedEnd?: string) => {
    if (writeStartedRef.current) return;
    if (!timeZone) {
      setError('Station timezone is not configured.');
      return;
    }

    if (sourceType === 'playlist' && (!playlistId || !versionId)) {
      setError('Select a playlist and an immutable published version.');
      return;
    }

    if (sourceType === 'dynamic-program' && !programDefinitionId) {
      setError('Select a Request Show definition.');
      return;
    }

    try {
      const dateParts = parseLocalDateInput(date);
      const startParts = parseLocalTimeInput(startTime);
      const endParts = parseLocalTimeInput(endTime);
      const startUtcMs = requireUnambiguousZonedUtcMs({ ...dateParts, ...startParts }, timeZone);
      const finishDate =
        repeat === 'once' ? endDate : endTime <= startTime ? addDaysToLocalDate(date, 1) : date;
      const endUtcMs = requireUnambiguousZonedUtcMs(
        { ...parseLocalDateInput(finishDate), ...endParts },
        timeZone,
      );

      if (endUtcMs <= startUtcMs) {
        setError('End date and time must be later than the start.');
        return;
      }

      const source =
        sourceType === 'playlist'
          ? ({ type: 'playlist', playlistId, playlistVersionId: versionId } as const)
          : ({ type: 'dynamic-program', programDefinitionId } as const);

      const input = {
        title: title.trim() || undefined,
        startUtc: new Date(startUtcMs).toISOString(),
        endUtc: new Date(endUtcMs).toISOString(),
        source,
      };

      if (!publisherName) throw new Error('A registered Qortal name is required.');
      if (repeat !== 'once' && !ownerAddress)
        throw new Error('Station owner identity is unavailable.');
      if (repeat === 'weekly' && !daysOfWeek.length)
        throw new Error('Select at least one weekday.');
      const plan = sourceType === 'dynamic-program' ? requestShowPlan() : undefined;
      if (repeat !== 'once' && !confirmedEnd) {
        setError(null);
        setReviewing(true);
        return;
      }
      writeStartedRef.current = true;
      setWriteStarted(true);
      setSaving(true);
      setError(null);
      if (repeat === 'once') {
        await saveScheduledProgramAction(
          input,
          publisherName,
          mode === 'edit' ? event?.eventId : undefined,
          plan,
        );
      } else {
        await saveRecurringProgramAction(
          {
            ownerAddress: ownerAddress!,
            title: title.trim() || 'Scheduled program',
            timezone: timeZone,
            frequency: repeat,
            daysOfWeek: repeat === 'weekly' ? daysOfWeek : undefined,
            localStartTime: startTime,
            durationMs: endUtcMs - startUtcMs,
            activeFromLocalDate: date,
            activeUntilLocalDate: confirmedEnd,
            source,
          },
          publisherName,
          getNowUtcMs(),
          undefined,
          plan,
        );
      }

      onClose();
    } catch (saveError) {
      setReviewing(false);
      setError(saveError instanceof Error ? saveError.message : 'Failed to save schedule event.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!event) return;

    setTransaction(
      createQdnTransactionState([{ id: 'delete', label: 'Delete this scheduled program' }], {
        retryable: true,
      }),
    );
    setTransaction((current) =>
      current ? markQdnTransactionChunkActive(current, 'delete') : current,
    );

    try {
      setSaving(true);
      setError(null);
      await deleteEvent(event.eventId);
      setTransaction((current) =>
        current
          ? {
              ...current,
              chunks: current.chunks.map((item) => ({ ...item, status: 'succeeded' as const })),
              phase: 'success' as const,
              successMessage: 'Program deleted.',
              retryable: false,
            }
          : current,
      );
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to delete schedule event.');
      setTransaction((current) =>
        current
          ? {
              ...current,
              chunks: current.chunks.map((item) =>
                item.status === 'active' ? { ...item, status: 'failed' as const } : item,
              ),
              phase: 'failed' as const,
              error:
                saveError instanceof Error ? saveError.message : 'Failed to delete schedule event.',
              retryable: true,
            }
          : current,
      );
    } finally {
      setSaving(false);
    }
  };

  if (reviewing && repeat !== 'once') {
    const durationMs = (() => {
      try {
        const start = requireUnambiguousZonedUtcMs(
          { ...parseLocalDateInput(date), ...parseLocalTimeInput(startTime) },
          timeZone,
        );
        const finishDate = endTime <= startTime ? addDaysToLocalDate(date, 1) : date;
        return (
          requireUnambiguousZonedUtcMs(
            { ...parseLocalDateInput(finishDate), ...parseLocalTimeInput(endTime) },
            timeZone,
          ) - start
        );
      } catch {
        return 0;
      }
    })();
    return (
      <ProgramPeriodDialog
        input={{
          ownerAddress: ownerAddress ?? '',
          title: title.trim() || 'Scheduled program',
          timezone: timeZone,
          frequency: repeat,
          daysOfWeek: repeat === 'weekly' ? daysOfWeek : undefined,
          localStartTime: startTime,
          durationMs,
          activeFromLocalDate: date,
          source:
            sourceType === 'playlist'
              ? { type: 'playlist', playlistId, playlistVersionId: versionId }
              : { type: 'dynamic-program', programDefinitionId },
        }}
        endDate={endDate || undefined}
        busy={saving}
        onBack={() => setReviewing(false)}
        onConfirm={(until) => void handleSave(until)}
      />
    );
  }

  return (
    <Modal
      title={mode === 'create' ? 'Schedule Program' : 'Edit Program'}
      busy={saving}
      onClose={saving ? () => undefined : onClose}
    >
      {transaction ? (
        <QdnTransactionFlow
          title="Delete Program"
          state={transaction}
          standalone={false}
          onClose={() => {
            setTransaction(null);
            if (transaction.phase === 'success') onClose();
          }}
        />
      ) : (
        <div className="schedule-editor">
          <label className="form-field">
            Program title
            <input
              type="text"
              value={title}
              onChange={(changeEvent) => setTitle(changeEvent.target.value)}
              placeholder="Evening Rock"
            />
          </label>

          <label className="form-field">
            Source type
            <select
              value={sourceType}
              onChange={(changeEvent) =>
                setSourceType(changeEvent.target.value as 'playlist' | 'dynamic-program')
              }
            >
              <option value="playlist">Immutable playlist</option>
              <option value="dynamic-program">Request Show</option>
            </select>
          </label>

          {mode === 'create' && (
            <label className="form-field">
              Repeat
              <select
                value={repeat}
                onChange={(changeEvent) => {
                  const value = changeEvent.target.value as 'once' | 'daily' | 'weekly';
                  setRepeat(value);
                  setEndDate(value === 'once' ? date : '');
                }}
              >
                <option value="once">Once</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </label>
          )}
          {repeat === 'weekly' && (
            <div className="form-field">
              Weekdays
              <div className="recurrence-editor__days">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, index) => (
                  <button
                    key={day}
                    type="button"
                    aria-pressed={daysOfWeek.includes(index)}
                    className={`recurrence-editor__day${daysOfWeek.includes(index) ? ' recurrence-editor__day--active' : ''}`}
                    onClick={() =>
                      setDaysOfWeek((days) =>
                        days.includes(index) ? days.filter((d) => d !== index) : [...days, index],
                      )
                    }
                  >
                    {day}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="schedule-editor__time-row">
            <label className="form-field">
              Start date ({timeZone || 'station timezone'})
              <input
                type="date"
                value={date}
                onChange={(changeEvent) => {
                  const value = changeEvent.target.value;
                  setDate(value);
                  if (repeat === 'once' && endDate === date) setEndDate(value);
                }}
              />
            </label>
            <label className="form-field">
              {repeat === 'once' ? 'End date' : 'End date (optional)'}
              <input
                type="date"
                value={endDate}
                min={date}
                onChange={(changeEvent) => setEndDate(changeEvent.target.value)}
                required={repeat === 'once'}
              />
            </label>
          </div>
          {repeat !== 'once' && (
            <p>
              Choose the publication period in the next dialog. Without an end date, one month is
              selected by default.
            </p>
          )}

          <div className="schedule-editor__time-row">
            <label className="form-field">
              Start time ({timeZone || 'station timezone'})
              <UtcTimeInput
                ariaLabel={`Start time (${timeZone || 'station timezone'})`}
                value={startTime}
                onChange={setStartTime}
                suffix={timeZone || 'station timezone'}
              />
            </label>
            <label className="form-field">
              End time ({timeZone || 'station timezone'})
              <UtcTimeInput
                ariaLabel={`End time (${timeZone || 'station timezone'})`}
                value={endTime}
                onChange={setEndTime}
                suffix={timeZone || 'station timezone'}
              />
            </label>
          </div>

          {sourceType === 'playlist' ? (
            <>
              <label className="form-field">
                Playlist
                <select
                  value={playlistId}
                  onChange={(changeEvent) => {
                    setPlaylistId(changeEvent.target.value);
                    setVersionId('');
                  }}
                >
                  <option value="">Select a playlist</option>
                  {playlists.map((playlist) => (
                    <option key={playlist.playlistId} value={playlist.playlistId}>
                      {playlist.title}
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-field">
                Immutable playlist version
                <select
                  value={versionId}
                  onChange={(changeEvent) => setVersionId(changeEvent.target.value)}
                  disabled={!playlistId}
                >
                  <option value="">Select a published version</option>
                  {versions.map((version) => (
                    <option key={version.versionId} value={version.versionId}>
                      v{version.versionNumber} — {version.tracks.length} tracks
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : (
            <label className="form-field">
              Request Show definition
              <select
                value={programDefinitionId}
                onChange={(changeEvent) => setProgramDefinitionId(changeEvent.target.value)}
              >
                <option value="">Select a Request Show definition</option>
                {definitions.map((definition) => (
                  <option
                    key={definition.programDefinitionId}
                    value={definition.programDefinitionId}
                  >
                    {definition.title}
                  </option>
                ))}
              </select>
            </label>
          )}

          {error && <p className="form-error">{error}</p>}

          <div className="form-actions">
            {mode === 'edit' && event && (
              <button
                className="button button--secondary"
                type="button"
                onClick={handleDelete}
                disabled={saving}
              >
                Delete
              </button>
            )}
            <button
              className="button button--secondary"
              type="button"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              className="button button--primary"
              type="button"
              onClick={() => void handleSave()}
              disabled={
                saving ||
                writeStarted ||
                !timeZone ||
                (sourceType === 'playlist' && (!playlistId || !versionId)) ||
                (sourceType === 'dynamic-program' &&
                  (!programDefinitionId || !libraryLoaded || !requestShowLoaded || !likesReady))
              }
            >
              {saving ? (
                <>
                  <Spinner /> Saving
                </>
              ) : mode === 'create' ? (
                sourceType === 'dynamic-program' ? (
                  'Schedule & Generate'
                ) : (
                  'Schedule Program'
                )
              ) : (
                'Save Changes'
              )}
            </button>
          </div>
          {sourceType === 'dynamic-program' &&
          (libraryLoading || requestShowLoading || likesLoading || likesIncomplete) ? (
            <p className="schedule-editor__unsupported">
              Waiting for station library and Like records before generating the lineup…
            </p>
          ) : null}
        </div>
      )}
    </Modal>
  );
}
