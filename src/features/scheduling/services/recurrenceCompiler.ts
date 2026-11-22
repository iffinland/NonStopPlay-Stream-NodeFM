/* ============================================================
 * NodeFM Station — Recurrence Compiler
 *
 * Converts admin ScheduleRecurrence intent into concrete UTC
 * ScheduleEvent instances. The runtime timeline engine never
 * evaluates recurrence rules.
 * ============================================================ */

import type { ScheduleEvent, ScheduleRecurrence } from '../../../types/domain';
import { isValidDurationMs } from '../../../utils/duration';
import {
  addDaysToLocalDate,
  compareLocalDates,
  formatZonedDateInput,
  localDateForWeekday,
  parseLocalTimeInput,
  parseLocalDateInput,
  requireUnambiguousZonedUtcMs,
} from './timezone';
import {
  isScheduleEventSource,
  validateScheduleEvent,
  validateScheduleRecurrence,
} from './scheduleService';

export const DEFAULT_RECURRENCE_MONTHS = 1;

/** Inclusive end of a bounded calendar-month publication period. */
export function recurrencePeriodEnd(start: string, months = DEFAULT_RECURRENCE_MONTHS): string {
  if (!Number.isInteger(months) || months < 1 || months > 12)
    throw new Error('Choose a publication period between 1 and 12 months.');
  const { year, month, day } = parseLocalDateInput(start);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const date = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(day, last)),
  );
  return addDaysToLocalDate(date.toISOString().slice(0, 10), -1);
}

export type RecurrenceCompileFailure = {
  ok: false;
  errors: string[];
};

export type RecurrenceCompileSuccess = {
  ok: true;
  events: ScheduleEvent[];
  generatedDates: string[];
};

export type RecurrenceCompileResult = RecurrenceCompileFailure | RecurrenceCompileSuccess;

function fnv1aHash(value: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function getDeterministicOccurrenceEventId(
  recurrenceId: string,
  startUtcMs: number,
): string {
  return `nodefm-generated-event-${fnv1aHash(`${recurrenceId}\u0000${startUtcMs}`)}`;
}

function buildEvent(
  recurrence: ScheduleRecurrence,
  localDate: string,
  startUtcMs: number,
  nowUtcMs: number,
): ScheduleEvent {
  const startUtc = new Date(startUtcMs).toISOString();
  const endUtc = new Date(startUtcMs + recurrence.durationMs).toISOString();

  return {
    schemaVersion: 1,
    eventId: getDeterministicOccurrenceEventId(recurrence.recurrenceId, startUtcMs),
    title: recurrence.title,
    startUtc,
    endUtc,
    source: recurrence.source,
    recurrenceId: recurrence.recurrenceId,
    recurrenceInstanceKey: localDate,
    createdAt: new Date(nowUtcMs).toISOString(),
    updatedAt: new Date(nowUtcMs).toISOString(),
  };
}

function isValidCompileInput(recurrence: ScheduleRecurrence, nowUtcMs: number): string[] {
  const errors: string[] = [];

  const validation = validateScheduleRecurrence(recurrence);
  if (!validation.ok) {
    errors.push(...validation.errors);
  }

  if (!Number.isFinite(nowUtcMs) || !Number.isInteger(nowUtcMs)) {
    errors.push('nowUtcMs must be a finite integer UTC timestamp.');
  }

  if (!isScheduleEventSource(recurrence.source)) {
    errors.push('Recurrence source is not schedule-valid.');
  }

  if (!isValidDurationMs(recurrence.durationMs)) {
    errors.push('Recurrence durationMs must be a positive integer.');
  }

  return errors;
}

/**
 * Generate bounded future concrete events for a recurrence definition.
 *
 * An omitted end defaults to one calendar month. Explicit periods are fully
 * compiled up to twelve months; runtime never extends them automatically.
 *
 * Ambiguous/nonexistent local wall times cause the entire compilation to
 * fail with a date-specific error rather than being silently resolved.
 */
export function compileScheduleRecurrence(
  recurrence: ScheduleRecurrence,
  nowUtcMs: number,
): RecurrenceCompileResult {
  const inputErrors = isValidCompileInput(recurrence, nowUtcMs);
  if (inputErrors.length > 0) {
    return { ok: false, errors: inputErrors };
  }

  const time = parseLocalTimeInput(recurrence.localStartTime);
  const localToday = formatZonedDateInput(nowUtcMs, recurrence.timezone);

  const effectiveFrom =
    compareLocalDates(recurrence.activeFromLocalDate, localToday) > 0
      ? recurrence.activeFromLocalDate
      : localToday;
  const effectiveUntil = recurrence.activeUntilLocalDate ?? recurrencePeriodEnd(effectiveFrom);
  if (compareLocalDates(effectiveUntil, recurrencePeriodEnd(effectiveFrom, 12)) > 0)
    return {
      ok: false,
      errors: ['Choose a publication period of at most 12 months. Nothing was published.'],
    };

  if (compareLocalDates(effectiveFrom, effectiveUntil) > 0) {
    return { ok: true, events: [], generatedDates: [] };
  }

  const events: ScheduleEvent[] = [];
  const generatedDates: string[] = [];
  const errors: string[] = [];
  const daysOfWeek = recurrence.frequency === 'weekly' ? (recurrence.daysOfWeek ?? []) : [];

  let cursor = effectiveFrom;

  while (compareLocalDates(cursor, effectiveUntil) <= 0) {
    if (recurrence.frequency === 'weekly' && !localDateForWeekday(cursor, daysOfWeek)) {
      cursor = addDaysToLocalDate(cursor, 1);
      continue;
    }

    try {
      const startUtcMs = requireUnambiguousZonedUtcMs(
        {
          year: Number(cursor.slice(0, 4)),
          month: Number(cursor.slice(5, 7)),
          day: Number(cursor.slice(8, 10)),
          hour: time.hour,
          minute: time.minute,
        },
        recurrence.timezone,
      );

      events.push(buildEvent(recurrence, cursor, startUtcMs, nowUtcMs));
      generatedDates.push(cursor);
    } catch (error) {
      errors.push(
        `${cursor}: ${error instanceof Error ? error.message : 'Unable to convert local time to UTC.'}`,
      );
    }

    cursor = addDaysToLocalDate(cursor, 1);
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  for (const event of events) {
    const validation = validateScheduleEvent(event);
    if (!validation.ok) {
      errors.push(
        `${event.recurrenceInstanceKey ?? event.eventId}: ${validation.errors.join(' ')}`,
      );
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, events, generatedDates };
}
