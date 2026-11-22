# NodeFM Qortal RC.5 — complete bulk publishing and immediate library updates

Date: 2026-11-22. Version: `0.1.0-qortal-rc.5`.
Working base remains main `51b145eee892bd99bd43a6640f6cbe2e2f4e36b4`.

## Reported behavior and causes

A single Admin upload reported success but did not appear in the loaded list.
The publishing service confirmed Track JSON but never upserted that Track into
the subscribed library store. Waiting for node search indexing or reloading was
previously required. RC.5 upserts only after confirmed metadata publication.

The bulk footer published only AUDIO and expected manually prepared handles.
Missing preparation could leave a warning far from the clicked button. Cover
and JSON then required additional per-row prepare/publish/export actions. Replace
this fragmented workflow with one main action for the entire selected batch.

The RC.3/4 bulk adapter also used generic nodefm-audio-/nodefm-cover- identifiers
for listener proposals, while structural discovery required submission-specific
media identifiers. RC.5 uses canonical submission IDs for new listener uploads.
Previously published exact same-ID generic media remains readable; unrelated
identifiers, names or services are still rejected. This preserves existing paid
uploads instead of asking the owner to publish them again.

## Final behavior

Select local files, review/edit metadata, then click Publish selected (Admin) or
Submit selected (listener). Preparation is automatic. Media is sent in batches
of at most ten resources; confirmed media dependencies precede JSON creation and
publication. Three tracks with covers normally mean two Hub approvals. Larger
selections may require more host approval dialogs. No app-side per-resource
prepare/cover/JSON buttons remain. Signing and fees still use Hub approval.

A compact per-track status and phase/progress modal replace the long manual
checklist. Editing, double-click publication and publication while verification
is active are blocked. A completed selection is disabled. Listener completion
is explicitly submission for review, not automatic station acceptance.

Confirmed Track metadata updates the Admin list immediately for single and bulk
uploads. No AUDIO is copied when a result is already confirmed. Pending attempts
are saved atomically before a batch dispatch. If persistence fails, dispatch is
blocked. Preflight rejection is distinguished from an uncertain broadcast.
Incomplete batches stop subsequent batches and metadata. Signed requests are
never automatically retried.

Read-only exact-byte reconciliation remains available only for unknown results.
After verification the main action continues the unconfirmed steps. Original
JSON artifacts are saved in scoped session storage for exact metadata comparison
across frame reloads; binary files remain transient and must be reattached. Batch
clear/remove removes its artifact cache. Frame disposal and stale verification
cannot advance a replaced workspace.

## Verification

- Full suite: 110 files / 915 tests passed.
- Production TypeScript/Vite build, ESLint, Prettier and git diff --check passed.
- Real App/router/provider tests cover a successful single upload appearing in
  the Admin list immediately, and Admin/listener two-file full publication from
  one button click through the actual publishing boundary and fixture Hub.
- Three-track/cover service integration produces two batches and structurally
  valid discoverable listener submissions. Confirmed repeat execution sends no
  further requests. Twelve-track publication splits 10/2 media then 10/2 JSON.
- Partial result preserves confirmations, blocks unknown retries and sends no
  dependent metadata. Storage failure, changed workspace, known preflight refusal
  and continuing legacy RC.4 media without re-upload are covered.
- Existing account, picker lifecycle, QDN duration, timeline/player and domain
  regression suites remain covered. One obsolete manual-checklist presentation
  test was retired along with that removed UI; shared status tests remain.
- Native Hub/mobile and live QDN transaction behavior require owner runtime
  testing. Automated host fixtures are not claimed as native runtime acceptance.

## Runtime delivery

Publish `NodeFM_0.1.0-qortal-rc.5_bulk-publishing.zip` as the existing default APP.
Keep the matching source ZIP for recovery. Retest a single upload (immediate
listing), then two or three listener files using only Submit selected and Hub
approvals. Check Admin Listener Uploads, acceptance, and the resulting library.
For an existing uncertain batch, retain the original files and use Check pending
publications; do not clear and submit the same files again just to bypass its
unknown state. Confirmed steps can continue without repeat uploads.

No commit, push, tag, release, live QDN transaction or change to the Qortium
source repository was performed. Phase 3 features are not started.

Base RC.5 bulk ZIP SHA-256: `a1c38e7827abf0834b4984173e3182e89a27271058b5fa091a2970b4111b2080`.
