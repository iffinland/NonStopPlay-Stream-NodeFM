# RC.9 — visible dates, recurring-program review and mobile schedule titles

**Release acceptance, 2026-11-22:** the owner confirmed RC.9 runtime and all tests passed, and authorized main/tag/release publication. Earlier candidate/pending statements below describe their historical checkpoints and are superseded by the [accepted release](../reports/QORTAL-RC9-ACCEPTANCE.md).

Date: 2026-11-22. Candidate: `0.1.0-qortal-rc.9`. Native acceptance pending.

## Schedule Program

The main **Schedule Program** form now includes both **Start date** and
**End date**, plus an explicit **Repeat: Once / Daily / Weekly** selection for
new programs. Select the source/Request Show definition in this same form.

- **Once** schedules one program using the selected start/end dates and times.
  Different dates and overnight programs are supported; editing restores the
  actual date of the end timestamp.
- **Daily / Weekly** creates a recurring series. End date is optional here;
  choose weekdays for a weekly series. The start/end clock fields describe each
  program's duration, while End date describes the last date of the series.
- With a recurrence selected, **Schedule & Generate** / **Schedule Program** opens
  a real **Choose program period** dialog before any publication request.

The dialog offers 1 month (default without an explicit end), 2/3/6 months and
Custom end date, up to 12 months. It shows the title, dates, local start time,
duration and concrete program count. **Back** returns to the unchanged form
without publishing. **Continue to Hub approval** submits the complete action
once through the existing batch publisher. Pending controls, including Close,
are disabled. Unknown results are not automatically retried.

The separate **New Recurring Program / Edit Recurring Program** form also keeps
both date controls visible and uses this same period dialog. No special entry
point is required to discover recurring scheduling from Schedule Program.
Existing occurrence edits stay single-occurrence edits; edit a series from the
recurring-program controls when changing the whole series.

## Mobile Upcoming Schedule

At phone widths up to 600px, schedule cards show the date/time and UTC line first,
then the complete program title on a separate full-width line. Names wrap rather
than using an ellipsis. This rule is scoped to Upcoming Schedule; upcoming music
track rows retain their compact layout. Desktop rows retain their existing layout.

## Focused native check

1. Open Schedule Program, select Request Show and a definition, then choose
   **Repeat → Daily**. Check that both date inputs are visible.
2. Leave End date blank and press Schedule & Generate. Confirm the period dialog
   opens with 1 month selected. Choose 2 months and review the count/end date.
3. Press Back: no transaction should have been requested, and form values remain.
   Reopen the dialog and Continue to Hub approval: expect one native batch dialog.
4. Check a long Upcoming Schedule title on a phone: its full name appears below
   the time. Also check an overnight single-program edit retains both dates.

RC.8 batching, ownership and recovery contracts remain in
[the publication guide](QORTAL-BATCH-PUBLISHING.md). RC.6 remains the last explicitly
owner-accepted native checkpoint; the accumulated later candidate still needs
native acceptance before final main/tag/release publication.
