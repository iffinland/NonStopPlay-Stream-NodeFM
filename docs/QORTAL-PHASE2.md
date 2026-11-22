# Qortal phase 2 — publication and station bootstrap

**Release acceptance, 2026-11-22:** the owner confirmed RC.9 runtime and all tests passed, and authorized main/tag/release publication. Earlier candidate/pending statements below describe their historical checkpoints and are superseded by the [accepted release](../reports/QORTAL-RC9-ACCEPTANCE.md).

Historical phase checkpoint. Current state: RC.6 runtime accepted; RC.7
implements remaining phases 3–4 and awaits combined native acceptance. See
[phases 3–4](QORTAL-PHASE3-4.md).

Version: `0.1.0-qortal-rc.5`, 2026-11-22. RC.2 authentication/Admin was passed
by the owner. The owner passed RC.5 bulk/library runtime tests. The same-version
progress and preview addendum also passed owner runtime testing. See the
[accepted RC.5 checkpoint](../reports/QORTAL-RC5-ACCEPTANCE.md).

## RC.3 owner runtime feedback and RC.4 correction

The owner confirmed QDN search/add and the single listener submission/acceptance
flow. Admin local upload and both bulk entry points lost selected files after
the native picker returned. Account revalidation temporarily replaced auth with
loading; AdminGuard unmounted the admin page, while the listener bulk scope/key
changed and discarded its transient files. RC.4 preserves the established auth
session during revalidation and retains its identity when the wallet is the
same. A changed account, denial or sign-out still removes authorization. Signed
writes continue to verify the live Hub account and name owner before dispatch.

Admin's sidebar return link was hidden by mobile CSS. RC.4 adds a main-area
Back to Station link on narrow screens. Library reconstruction also excludes
listener-proposal identifiers from the broad station-track search; these
share the `nodefm-track-` prefix but are not Track records. Genuine malformed
or unavailable Track resources still produce diagnostics.

## RC.4 QDN addendum

The preview banner is removed entirely. Add from QDN still searches **AUDIO** only,
with metadata/status included and a 20-result limit. It does not search JSON or
DOCUMENT music catalogues. Results expose publisher, identifier, description,
available artist/album hints, tags, category, size and status. The existing
`title=...;author=...` convention is recognized for editable form defaults.
Missing artist is left empty instead of copying the title into it.

QDN duration first uses native audio metadata without creating an AudioContext
or downloading the whole resource. On failure it tries bounded media-byte parsing
(up to 64 MiB, 30-second fetch budget). Missing/unsupported media remains an honest
failure. Retry is available. The owner can continue into metadata editing after
failure and enter the actual duration as `m:ss`, `m:ss.mmm` or `h:mm:ss`; a positive
valid duration is still required to publish and schedule the track. No duration
is guessed. Cancelled/old checks cannot overwrite a manual duration or a new
selection. The external AUDIO reference remains unchanged; audio is not copied.

## RC.5 bulk and library correction

Admin single-upload success now upserts the confirmed Track into the live library
store, so it appears immediately without waiting for QDN search indexing.

Bulk import is now **select files → edit details → Publish selected / Submit
selected**. Audio and optional covers are prepared automatically and published
in batches of at most ten resources. Only after the media is confirmed are the
canonical track/submission JSON records built and published in further batches.
Three tracks with covers normally require two Hub approval dialogs, rather than
separate app actions for every resource. Host signing/fee approval remains under
the user's control. A progress dialog shows the phase and completion; double
clicks and edits are blocked during publication. Fully completed selections are
disabled. The large resource-by-resource checklist has been removed.

New listener media uses the same submission-specific identifiers as single
submission. RC.3/4 bulk media identifiers are still accepted only when they match
the same submission ID, owner and service; existing uploads need not be copied.
Confirmed media is skipped when continuing. Partial/unknown outcomes stop further
writes. Check pending publications is shown only when needed and performs exact
read-back without a new transaction. Once verified, press the main button to
continue the remaining steps. Generated JSON bytes are retained in scoped session
storage as well as memory for exact verification after frame reload; original
media files still need to be reattached. Clearing the batch removes these cached
JSON records. Session storage is not a cross-device ledger.

Fresh name/account/source preflight failures are distinguished from uncertain
broadcast outcomes. There is no automatic signed retry. Failure to persist the
pre-dispatch journal blocks the request.

## RC.5 progress and preview addendum

Running transaction chunks and busy action buttons now show a rotating indicator.
Write transaction dialogs have no Retry action in running, success, partial or
failure states. Recurrence publication also has no Retry Failed Events button;
once a write begins, a failed attempt must be reviewed before another publication
is started. Read-only reload/search controls remain available.

Admin Listener Uploads uses Preview Audio to open in-app audio controls. It waits
for the full submitted AUDIO coordinate (including identifier), then resolves the
QDN URL without opening another Hub tab. Preview starts only from the user's play
action, which pauses the global radio/playlist player. Closing stops and unloads
preview audio. The global player stays paused until the user resumes it. Read-only
Reload audio is available for preparation/playback errors. Stale preview reads
cannot reopen or update a closed modal. Preview does not accept or publish a track.

## Delivered behavior

- Browser audio selection opens in the initiating user gesture. No Home native
  picker, staging token, host-info request or unlock command is used.
- Ordinary uploads and listener submissions resolve a positive audio duration
  from the selected file before any media transaction. Optional covers retain
  the existing 2 MiB inline limit.
- Signed publication re-reads the Hub account, checks registered-name ownership
  and checks the account again immediately before dispatch. Hub owns approvals
  and fees. Cached display names are not authority.
- Station configuration, track/submission metadata, playlists/versions, schedules
  and notices use the shared Qortal publication boundary. Single responses must
  carry a signature. Complete batch responses are arrays matched by exact
  name/service/identifier; Core numeric service codes are recognized.
- Bulk import uses its existing staged local audio and cover bytes, with JSON
  prepared in memory. No saving/reselecting generated cover or JSON is needed.
  Resource coordinates are stable per row. Dependency and content-revision
  checks prevent publishing metadata ahead of current media.
- Bulk journal uncertainty is saved synchronously in session storage before
  handing control to Hub. If that save fails, the write is not started. Local
  File/Blob objects stay outside serialized drafts. After frame reload, reattach
  the original files to perform verification; session storage does not survive
  every host/tab lifecycle and is not a cross-device transaction ledger.
- Unknown bulk attempts are blocked from repeat publication. **Verify uncertain
  publications** waits for QDN readiness and streams an exact byte comparison
  against the local source. Mismatch, missing data or node errors remain unknown;
  this check sends no publication transaction. Metadata verification uses the
  exact generated JSON retained for that attempt.
- JSON resources are checked for valid syntax and at most 25 KiB of UTF-8 bytes
  before approval. This rejects oversized records clearly; it does not split
  long playlists or migrate their schema automatically.

## Incomplete or uncertain publication

Hub loses successful signatures when a multi-resource request partly fails.
Absence from its failure list therefore does not prove publication. Such results
stay unknown, including generic network errors after dispatch. Writes are never
retried automatically. Explicit rejections stay separate. Later chunks stop
following an incomplete result; confirmed prior chunks are retained.

Ordinary upload dialogs report incomplete/unknown results and expose no automatic
Retry. Check the named resource before starting a fresh upload. Full durable
reconciliation of every non-bulk workflow is not provided by this phase.

## Owner runtime checks

Publish `NodeFM_0.1.0-qortal-rc.5_bulk-publishing.zip` as the existing APP/NodeFM with the
default identifier. Do not publish the source ZIP. Start with a small valid audio
file and optional cover; QDN publication uses Hub's normal fee approval.

1. Reopen with saved automatic authentication: owner Admin is present. A second
   account has no Admin access.
2. Admin Library: upload one short audio file with a cover. Cancel a file picker
   once. Confirm the completed track has duration and can be played.
3. Create a public rotation playlist, add the track and publish its version.
   Admin Station: save a default rotation and epoch. Reopen: station config,
   playlist/version, track metadata and media reload and radio plays while open.
4. Bulk import two short files. Edit their details and press Publish selected
   once. Approve Hub's media and detail requests; verify both complete tracks
   appear in the library without Prepare/JSON/cover steps.
5. With another account, submit a short track; return to the publisher and check
   submission discovery/moderation publication. Do not test deletion yet.
6. Decline a publication approval: no success claim. If an interrupted publication
   is shown as unknown, use bulk verification before any further attempt. Keep
   the original files; do not deliberately repeat a paid transaction to test it.

## Boundaries

Messages/tips, durable network removals and final release are phase 3/4 work.
Their unsupported bridge actions remain blocked. Android background playback is
excluded; foreground operation while Hub/the app is open is the accepted scope.
No live QDN writes or Core/Hub modifications were performed here. The owner
authorized committing/pushing the accepted RC.5 checkpoint to main. No tag or
official GitHub release is part of this checkpoint. Existing source/specifications still contain
historical Qortium names; `docs/QORTAL-PORT-AUDIT.md` records the port boundary.

## Verified source contracts

Inspected Core `108bf191d42d710ec617f535af30cfd82fc03c87` (v6.1.9), Hub stable
`f3b75daa717928c8a35491fd528a14dc3d4ee14d` (v3.0.3) and Hub develop
`42e2329aab337726d71faf34ebb68b091d7f9d61`. See pinned primary-source links in
the audit. File/data64, filename, signatures, partial batch responses and the
JSON cap were checked against these source contracts. No native host executable
or live-node transaction was run here; automated host fixtures are not native
Hub runtime evidence.
