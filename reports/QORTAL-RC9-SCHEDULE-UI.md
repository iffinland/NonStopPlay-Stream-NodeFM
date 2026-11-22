# RC.9 — schedule form and mobile Upcoming Schedule

Historical candidate report. The owner accepted the accumulated RC.9 runtime on 2026-11-22 and authorized release; see [RC.9 acceptance](QORTAL-RC9-ACCEPTANCE.md).

Date: 2026-11-22. Candidate: `0.1.0-qortal-rc.9`.
Base main remains `5167d1f59aada86d48c01b7c3f929b71b46b3acb`.
This candidate includes the accumulated uncommitted RC.6–RC.8 changes. Native
RC.9 acceptance is pending; no commit/push/tag/release, deployment or real signed
transaction was performed.

## Defects and corrections

The screenshot showed ScheduleEventEditorModal, while RC.8 offered periods only
inside the separate RecurrenceEditorModal. Its inline dropdown was not the
requested review dialog, and the single-program editor had only one date input.

- Main Schedule Program now shows Start date, End date and Repeat Once/Daily/Weekly.
  Daily/Weekly use the same form source, time and Request Show selections to plan
  a complete recurring publication; weekly mode exposes weekday selection.
- Recurring saves in both editors show shared ProgramPeriodDialog before dispatch:
  1/2/3/6 months/custom end, actual dates/count, Back, Continue to Hub approval.
  Back sends no transaction and keeps typed values. Pending controls prevent
  duplicate confirmation/dismissal. The one-batch publication boundary is retained.
- Both date fields stay visible in the recurring editor, including when no end
  date has been entered. Single programs accept independent start/end dates;
  overnight edits restore the real ending date instead of assuming the start day.
- Upcoming Schedule cards at <=600px stack their time information above the full
  program title. Titles wrap without ellipsis, including long unbroken names.
  Other upcoming-track rows and desktop schedule rows retain their prior layout.

## Verification

| Check                              | Result                       |
| ---------------------------------- | ---------------------------- |
| Full Vitest suite                  | 119 files / 993 tests passed |
| Scheduler UI regression suite      | 7 tests passed               |
| TypeScript + production Vite build | Passed                       |
| ESLint                             | Passed                       |
| Prettier                           | Passed                       |
| Git whitespace                     | Passed                       |
| JavaScript                         | 965.75 kB; gzip 274.87 kB    |
| CSS                                | 66.24 kB; gzip 11.07 kB      |

The UI tests render the real main/editor/dialog components with controlled
service responses. They exercise main-form daily -> actual period dialog ->
two months -> one publication invocation; separate-editor one-month default;
weekly weekdays/explicit end; Back with retained values/no writes; empty custom
end and pending duplicate prevention; independent dates and overnight edit
restoration. Existing full-suite coverage verifies the actual batch bridge,
lineups, permissions, removal, recovery and social paths.

Browser preview verification was unavailable in this environment. DOM tests and
CSS source checks are not native/mobile visual acceptance; that remains with
the owner. No live chat/payment/publication is included in automated evidence.

## Delivery and native gate

Runtime: `NodeFM_0.1.0-qortal-rc.9_schedule-ui.zip`.
Source: `NodeFM_0.1.0-qortal-rc.9_source.zip`.
The runtime has index.html and LICENSE at root. Source contains this report,
current operator docs and SOURCE-SNAPSHOT.json with source hashes, base revision
and exact runtime checksum. Temporary preview fixtures are excluded.

Use the [focused native checklist](../docs/QORTAL-SCHEDULE-UI.md#focused-native-check).
Reopen the APP after updating. Existing saved schedules are preserved; choose
Repeat Daily/Weekly to author a series and Once for a single program. Complete
the accumulated runtime gate before authorizing final main/tag/release work.
