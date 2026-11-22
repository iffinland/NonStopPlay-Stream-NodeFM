// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  single: vi.fn(),
  tracks: [],
  definitions: [{ programDefinitionId: 'likes', title: 'Likes' }],
}));
vi.mock('../../station', () => ({
  useStation: () => ({ station: { timezone: 'Europe/Helsinki' } }),
  useStationIdentity: () => ({ publisherName: 'Station', ownerAddress: 'Q-owner' }),
}));
vi.mock('../../../hooks/usePlaylists', () => ({
  usePlaylists: () => ({ playlists: [], getVersions: () => [] }),
}));
vi.mock('../../../hooks/useLibrary', () => ({
  useLibrary: () => ({ tracks: mocks.tracks, loaded: true, loading: false }),
}));
vi.mock('../../likes/useLikes', () => ({
  useLikes: () => ({ aggregates: {}, ready: true, loading: false, incomplete: false }),
}));
vi.mock('../../dynamic-programs/request-show/useRequestShow', () => ({
  useRequestShow: () => ({ definitions: mocks.definitions, loaded: true, loading: false }),
}));
vi.mock('../services/scheduleStore', () => ({
  saveRecurringProgramAction: mocks.save,
  saveScheduledProgramAction: mocks.single,
}));
vi.mock('../hooks/useScheduler', () => ({ useScheduler: () => ({ deleteEvent: vi.fn() }) }));
import { RecurrenceEditorModal } from './RecurrenceEditorModal';
import { ScheduleEventEditorModal } from './ScheduleEventEditorModal';
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-22T00:00:00.000Z'));
  mocks.save.mockReset().mockResolvedValue({});
  mocks.single.mockReset().mockResolvedValue({});
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
function setup(main = false) {
  const close = vi.fn();
  render(
    main ? (
      <ScheduleEventEditorModal mode="create" onClose={close} />
    ) : (
      <RecurrenceEditorModal mode="create" onClose={close} />
    ),
  );
  fireEvent.change(screen.getByLabelText('Program title'), { target: { value: 'Liked songs' } });
  fireEvent.change(screen.getByLabelText('Source type'), { target: { value: 'dynamic-program' } });
  fireEvent.change(screen.getByLabelText('Request Show definition'), {
    target: { value: 'likes' },
  });
  return close;
}
it('shows both recurrence dates, then a real one-month review dialog before any publication', async () => {
  const close = setup();
  expect(screen.getByLabelText('Start date')).toBeTruthy();
  expect(screen.getByLabelText('End date (optional)')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Create Recurrence' }));
  expect(screen.getByRole('dialog', { name: 'Choose program period' })).toBeTruthy();
  expect((screen.getByRole('radio', { name: '1 month' }) as HTMLInputElement).checked).toBe(true);
  expect(mocks.save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Continue to Hub approval' }));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
  expect(mocks.save.mock.calls[0][0]).toMatchObject({
    activeFromLocalDate: '2026-11-22',
    activeUntilLocalDate: '2026-12-21',
    source: { type: 'dynamic-program', programDefinitionId: 'likes' },
  });
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
});
it('exposes the two-month offer from the main Schedule Program flow and submits it once', async () => {
  setup(true);
  expect(screen.getByLabelText('Start date (Europe/Helsinki)')).toBeTruthy();
  expect(screen.getByLabelText('End date')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Repeat'), { target: { value: 'daily' } });
  expect(screen.getByLabelText('End date (optional)')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Schedule & Generate' }));
  expect(mocks.save).not.toHaveBeenCalled();
  expect(mocks.single).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('radio', { name: '2 months' }));
  expect(screen.getByText(/61 programs/)).toBeTruthy();
  expect(screen.getByText(/2027-01-21/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Continue to Hub approval' }));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
  expect(mocks.save.mock.calls[0][0]).toMatchObject({
    frequency: 'daily',
    activeUntilLocalDate: '2027-01-21',
  });
  expect(mocks.single).not.toHaveBeenCalled();
});
it('Back preserves entered form data and sends nothing', () => {
  setup(true);
  fireEvent.change(screen.getByLabelText('Repeat'), { target: { value: 'daily' } });
  fireEvent.click(screen.getByRole('button', { name: 'Schedule & Generate' }));
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  expect((screen.getByLabelText('Program title') as HTMLInputElement).value).toBe('Liked songs');
  expect((screen.getByLabelText('Repeat') as HTMLSelectElement).value).toBe('daily');
  expect(mocks.save).not.toHaveBeenCalled();
  expect(mocks.single).not.toHaveBeenCalled();
});
it('requires a custom end date and prevents another send while the reviewed batch is pending', async () => {
  setup();
  fireEvent.click(screen.getByRole('button', { name: 'Create Recurrence' }));
  fireEvent.click(screen.getByRole('radio', { name: 'Custom end date' }));
  expect(
    (screen.getByRole('button', { name: 'Continue to Hub approval' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-11-30' } });
  let finish!: () => void;
  mocks.save.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const button = screen.getByRole('button', { name: 'Continue to Hub approval' });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(mocks.save).toHaveBeenCalledTimes(1);
  expect((screen.getByRole('button', { name: /Publishing/ }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  expect((screen.getByRole('button', { name: 'Close' }) as HTMLButtonElement).disabled).toBe(true);
  finish();
  await waitFor(() => expect(screen.queryByText(/Publishing/)).toBeNull());
});
it('supports independent start/end dates when creating a single program', async () => {
  setup(true);
  fireEvent.change(screen.getByLabelText('Start date (Europe/Helsinki)'), {
    target: { value: '2026-11-24' },
  });
  fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-11-25' } });
  fireEvent.click(screen.getByRole('button', { name: 'Schedule & Generate' }));
  await waitFor(() => expect(mocks.single).toHaveBeenCalledTimes(1));
  expect(mocks.single.mock.calls[0][0]).toMatchObject({
    startUtc: '2026-11-24T10:00:00.000Z',
    endUtc: '2026-11-25T11:00:00.000Z',
  });
  expect(mocks.save).not.toHaveBeenCalled();
});
it('reviews a weekly series with selected weekdays and an explicit end date', async () => {
  setup(true);
  fireEvent.change(screen.getByLabelText('Repeat'), { target: { value: 'weekly' } });
  fireEvent.click(screen.getByRole('button', { name: 'Mon' }));
  fireEvent.change(screen.getByLabelText('End date (optional)'), {
    target: { value: '2026-12-07' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Schedule & Generate' }));
  expect((screen.getByRole('radio', { name: 'Custom end date' }) as HTMLInputElement).checked).toBe(
    true,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Continue to Hub approval' }));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
  expect(mocks.save.mock.calls[0][0]).toMatchObject({
    frequency: 'weekly',
    daysOfWeek: [1],
    activeUntilLocalDate: '2026-12-07',
  });
});

it('restores the actual ending calendar date when editing an overnight program', () => {
  render(
    <ScheduleEventEditorModal
      mode="edit"
      event={{
        schemaVersion: 1,
        eventId: 'overnight',
        title: 'Overnight show',
        startUtc: '2026-11-24T21:00:00.000Z',
        endUtc: '2026-11-25T02:00:00.000Z',
        source: { type: 'dynamic-program', programDefinitionId: 'likes' },
        createdAt: '2026-11-22T00:00:00.000Z',
        updatedAt: '2026-11-22T00:00:00.000Z',
      }}
      onClose={vi.fn()}
    />,
  );
  expect((screen.getByLabelText('Start date (Europe/Helsinki)') as HTMLInputElement).value).toBe(
    '2026-11-24',
  );
  expect((screen.getByLabelText('End date') as HTMLInputElement).value).toBe('2026-11-25');
  expect((screen.getByLabelText('Start time (Europe/Helsinki)') as HTMLInputElement).value).toBe(
    '23:00',
  );
  expect((screen.getByLabelText('End time (Europe/Helsinki)') as HTMLInputElement).value).toBe(
    '04:00',
  );
  expect(mocks.save).not.toHaveBeenCalled();
  expect(mocks.single).not.toHaveBeenCalled();
});
