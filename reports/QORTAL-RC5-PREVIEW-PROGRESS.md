# NodeFM RC.5 addendum — progress indicators and submission preview

Date: 2026-11-22. Version remains `0.1.0-qortal-rc.5` as requested.
Owner runtime result: base RC.5 passed. This addendum requires retesting.
Git base remains `51b145eee892bd99bd43a6640f6cbe2e2f4e36b4`.

## Corrections

The shared QdnTransactionFlow rendered an active chunk as a literal ellipsis.
Its Retry condition excluded only idle, so it offered a signed retry while the
original request was still running. Replace the active marker with the shared
rotating Spinner and remove the retry prop/UI from the component and its callers.
Success, partial and failure states offer Close, not another transaction action.
Partial-result text now asks the owner to check saved results before proceeding.

Audited LoadingState, PublicationProgress, live-radio loading, dashboard counts,
modal actions and busy buttons. Existing rotating indicators remain; inline
save/publish/send/resolve/open actions now include the shared spinner. Ordinary
text punctuation and non-loading pending/skipped markers are not progress dots.

Remove the recurrence modal's paid Retry Failed Events control and prevent a
second save within that attempt after dispatch begins. The terminal QDN import
error no longer shows a Retry control. Read-only search/resource/list refresh and
preview reload controls remain; they do not send signed writes. Moderation also
has an immediate single-flight guard independent of React's async state update.

Listener upload cards previously sent Open Audio through external Qortal tab
navigation. The screenshot's tab URL lacked the media identifier and returned
Not Found. Replace it with Preview Audio: an in-app modal awaits resource readiness
and resolves the exact submitted AUDIO reference with its identifier. Native
controls require an explicit play action. Preview play pauses the global player
so both cannot play together; closing unloads preview audio and leaves radio
paused until explicitly resumed. Preparing/playback errors offer read-only
Reload audio. Stale async responses cannot update a closed/replaced preview.
No moderation or publication occurs merely by opening preview.

## Verification

- Full suite: 113 files / 925 tests passed.
- TypeScript/Vite production build, ESLint, Prettier and git whitespace check passed.
- Shared transaction UI tests cover a spinner, guarded close while running,
  no Retry for running/success/partial/failure, and terminal close behavior.
- Preview tests cover complete resource coordinates, native controls/no autoplay,
  pausing global playback only on preview play, cleanup, read-only reload and
  ignoring a late readiness response after close.
- Actual review-panel tests wire Preview Audio to the modal without a new tab or
  accepting the resource, and preserve single moderation dispatch without Retry.
- Existing single/bulk/account/duration/timeline regressions still pass.
- No native Hub/live-node transaction or mobile executable was run here. Owner
  runtime is required for media seek/buffering and the rendered animation.

## Delivery

Replace the existing RC.5 runtime and source ZIP items; version and filenames
remain unchanged. Re-download the updated runtime ZIP before publishing. Test
accept/reject and playlist publishing progress (spinner, no Retry) and Preview
Audio before accepting a submission. The preview should stay inside the app;
closing it must stop its playback.

No commit, push, tag, official release, live QDN write or Qortium repository
change was performed.

Runtime ZIP SHA-256: `2cb6c47e38cc107f2ab2b5582250dd985d7d662541ce69ecd36f30ce4746d3e8`.
