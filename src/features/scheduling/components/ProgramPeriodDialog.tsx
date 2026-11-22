import { useMemo, useRef, useState } from 'react';
import { Modal } from '../../../components/Modal';
import { Spinner } from '../../../components/Spinner';
import {
  createScheduleRecurrence,
  type CreateScheduleRecurrenceInput,
} from '../services/scheduleService';
import { compileScheduleRecurrence, recurrencePeriodEnd } from '../services/recurrenceCompiler';
import { getNowUtcMs } from '../../radio/timeline';

type Props = {
  input: CreateScheduleRecurrenceInput;
  endDate?: string;
  busy: boolean;
  onBack: () => void;
  onConfirm: (endDate: string) => void;
};

/** A read-only planning step until the user explicitly continues to Hub. */
export function ProgramPeriodDialog({ input, endDate, busy, onBack, onConfirm }: Props) {
  const [period, setPeriod] = useState(endDate ? 'custom' : '1');
  const [customEnd, setCustomEnd] = useState(endDate ?? '');
  const submitted = useRef(false);
  const until = useMemo(() => {
    if (period === 'custom') return customEnd;
    try {
      return recurrencePeriodEnd(input.activeFromLocalDate, Number(period));
    } catch {
      return '';
    }
  }, [period, customEnd, input.activeFromLocalDate]);
  const preview = useMemo(() => {
    if (!until) return { ok: false as const, errors: ['Choose an end date.'] };
    try {
      return compileScheduleRecurrence(
        createScheduleRecurrence({ ...input, activeUntilLocalDate: until }),
        getNowUtcMs(),
      );
    } catch (error) {
      return {
        ok: false as const,
        errors: [error instanceof Error ? error.message : 'Invalid program period.'],
      };
    }
  }, [input, until]);
  const valid = preview.ok && preview.events.length > 0;
  return (
    <Modal title="Choose program period" onClose={onBack} busy={busy}>
      <p>How long should this recurring program be created?</p>
      <fieldset className="program-period__choices" disabled={busy}>
        <legend>Publication period</legend>
        {[
          ['1', '1 month'],
          ['2', '2 months'],
          ['3', '3 months'],
          ['6', '6 months'],
          ['custom', 'Custom end date'],
        ].map(([value, label]) => (
          <label key={value}>
            <input
              type="radio"
              name="program-period"
              value={value}
              checked={period === value}
              onChange={() => setPeriod(value)}
            />
            {label}
          </label>
        ))}
      </fieldset>
      {period === 'custom' && (
        <label className="form-field">
          End date
          <input
            type="date"
            value={customEnd}
            min={input.activeFromLocalDate}
            onChange={(event) => setCustomEnd(event.target.value)}
            disabled={busy}
          />
        </label>
      )}
      <p className="program-period__summary">
        <strong>{input.title}</strong>
        <br />
        Start date: {input.activeFromLocalDate}
        <br />
        End date: {until || 'Choose a date'}
        <br />
        {input.frequency === 'daily' ? 'Daily' : 'Weekly'} at {input.localStartTime} (
        {input.timezone}) · {input.durationMs / 60000} min
        <br />
        {preview.ok ? `${preview.events.length} programs` : preview.errors.join(' ')}
      </p>
      <p>
        The complete schedule and Request Show lineups use one Hub approval. Hub shows the total
        fee. The series stops on this date; it does not renew automatically.
      </p>
      <div className="form-actions">
        <button type="button" className="button button--secondary" disabled={busy} onClick={onBack}>
          Back
        </button>
        <button
          type="button"
          className="button button--primary"
          disabled={busy || !valid}
          onClick={() => {
            if (submitted.current || !valid) return;
            submitted.current = true;
            onConfirm(until);
          }}
        >
          {busy ? (
            <>
              <Spinner /> Publishing
            </>
          ) : (
            'Continue to Hub approval'
          )}
        </button>
      </div>
    </Modal>
  );
}
