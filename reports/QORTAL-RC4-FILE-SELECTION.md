# NodeFM Qortal RC.4 — file selection and mobile admin return

Date: 2026-11-22. Version: `0.1.0-qortal-rc.4`.
Git base remains `51b145eee892bd99bd43a6640f6cbe2e2f4e36b4`.

## Owner RC.3 evidence

QDN search/add works. A single listener track reaches Admin and can be accepted
through the workflow. Local Admin audio selection disappears before metadata;
bulk Admin/listener selections leave no staged rows. Mobile Admin has no visible
Back to Station control. Library displays one malformed/unavailable resource.

## Correction

Native picker focus/visibility return triggers GET_USER_ACCOUNT revalidation.
AuthProvider previously set loading immediately, unmounting the guarded admin
page and its upload modal. Listener bulk simultaneously changed its actor scope
and remounted, losing its transient selected bytes. This is a lifecycle failure,
not an AUDIO publishing payload failure.

Keep established auth mounted while the host account is checked. For the same
wallet, background revalidation preserves the existing session object so owner
lookup does not tear down the route. Optional display-name lookup failure during
background revalidation also cannot discard an authenticated draft. Actual wallet
changes, denied account access and explicit sign-out still replace the session;
signed publication retains its fresh account and name-owner checks.

The existing sidebar return link is hidden at <=768px. Add a main-area return
link shown at that breakpoint, using the router to open the public station.

Library search for nodefm-track- also includes nodefm-track-submission- proposals.
Exclude that reserved proposal namespace before Track reconstruction. This is a
verified false-warning path; the owner's exact failing QDN resource was not
queried here. Real malformed/unavailable Track records remain visible as warnings.

## Verification

- Reinstating RC.3 loading behavior reproduced all three file-picker regressions
  in real App/provider/router tests: Admin upload, Admin bulk and listener bulk.
- Fixed full suite: 109 files / 905 tests passed (including the QDN addendum below).
- App tests preserve selected files, editable metadata and DOM identity while an
  account recheck is pending and after completion. They also verify that changing
  the actual Hub account dismisses an open admin form and revokes Admin access.
- Library regression excludes proposals without masking existing read errors.
- Main-area Back to Station router navigation passes.
- TypeScript/Vite production build, ESLint, Prettier and git diff --check passed.
- Native Hub/mobile runtime remains owner verification; no live QDN transaction
  or native browser-host result is claimed from the component tests.

## Delivery and retest

Publish `NodeFM_0.1.0-qortal-rc.4_file-selection.zip` as the existing default APP.
Keep the matching source ZIP for recovery. Retest local Admin file selection,
metadata editing and publication, then two-file bulk selection in Admin and in
Submit Music. Check Back to Station on mobile. If a library warning persists,
inspect its genuine remaining resource diagnostic rather than suppressing it.

No commit, push, tag, release or live QDN publication performed. Qortium source
repository remains unchanged. Phase 3 features have not been started.

## Same-version QDN addendum

At the owner's request, the same RC.4 package also removes the preview banner
and its spacing CSS. QDN search remains AUDIO-only, with more existing metadata
shown: publisher/identifier, parsed artist/album, tags/category, size/status and
original description. Result keys include identifier, so two AUDIO resources
from one publisher remain distinct. The standard title/author description is
used for editable defaults; absent artist is no longer replaced with title.

QDN duration now tries native audio metadata, then a bounded byte parser rather
than relying solely on full WebAudio decode. Manual actual-duration input and
retry are available; metadata editing is permitted after automatic failure.
Publication still rejects absent, zero, malformed or unsafe duration values.
Request cancellation protects manual input and replacement selections. Byte
fallback is limited to 64 MiB and a 30-second fetch timeout; native metadata has
a 15-second timeout. No guessed duration or live QDN write is introduced.

Verification adds 21 tests: metadata hints, duration input validation, real
AddQdnFlow search/failure/manual-add/retry, native metadata without a full fetch,
actual WAV-byte fallback, oversized response and cancellation. Full result:
109 files / 905 tests; build, lint, formatting and whitespace checks passed.
Native Hub/selected screenshot resource remains owner runtime verification.

Same filenames and RC.4 version are retained; previous Library items are updated
with these replacement bytes. Retest the screenshot track through automatic
retry or its actual manually supplied duration, then verify enriched metadata.

Runtime ZIP SHA-256: `562201dea4b6d850c601eadf1b3026cc2796ca174a7c845ceccabb1907734eea`.
