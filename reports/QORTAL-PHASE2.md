# NodeFM Qortal phase 2 / RC.3 report

Date: 2026-11-22. Version: `0.1.0-qortal-rc.3`.
Working repository: `iffinland/NonStopPlay-Stream-NodeFM`.
Git base: `51b145eee892bd99bd43a6640f6cbe2e2f4e36b4` (import and audit).
Owner acceptance: RC.2 auto authentication and publisher Admin runtime passed.

## Result

Implemented Qortal single/batch publication, browser file acquisition, local
pre-publication duration resolution, ordinary uploads and listener submissions,
and a Qortal bulk adapter using the existing staged bytes. All existing domain
JSON publishers now use this boundary, including station bootstrap and rotation
playlist versions. JSON validation/25 KiB checks occur before approval. Native
Home staging/unlock dependencies were removed from active publication paths.

Hub approvals use fresh account/address and publishing-name ownership checks.
Core numeric services and signature responses are normalized; complete batch
arrays are matched by coordinates. Structured partial errors survive the bridge
wrapper. Omitted successes in Hub's partial response remain unknown. Incomplete
chunks stop later writes while earlier confirmed results remain retained. No
automatic retry of any signed action is introduced.

Bulk coordinates remain stable per row, source handles are revision/generation
bound, and current published dependencies are required before metadata. Attempts
are persisted as unknown before Hub dispatch; failed persistence prevents the
write. Read-only reconciliation streams exact remote/local byte comparison and
cannot turn an unavailable or mismatching resource into success. Browser file
objects stay out of durable drafts. Recovery is limited to available session
storage and original local source bytes; it is not a cross-device ledger.

The preview banner and active upload prompts now reflect phase 2. Generated bulk
JSON/covers no longer require downloading and selecting them again in Home.

## Verification

- Full automated suite: 106 files / 878 tests passed.
- TypeScript and Vite production build passed.
- ESLint, Prettier and Git whitespace checks passed.
- A real one-second PCM WAV is parsed for duration before any host call.
- A domain integration test uses the production bridge/publication boundary:
  AUDIO → Track JSON → Playlist → immutable version/pointer → Station config.
- Qortal tests cover File/filename/data64 requests, ownership and account switch,
  JSON UTF-8 bounds, malformed sources, explicit rejection vs lost response,
  partial Hub errors, coordinate mismatches and stopped later chunks.
- Bulk tests cover stable coordinates/no-op confirmation, stale rows/roles,
  dependencies, persistence refusal, uncertain writes/reconciliation, restored
  journals and disposal during approval. Streaming tests distinguish exact,
  changed, truncated and oversized remote data.
- Browser file-picker tests cover synchronous opening, cancellation and the
  legacy focus fallback. RC.2 App/AuthProvider/Admin regressions remain covered.

Obsolete Home-native unlock/staging/publish-envelope tests were replaced with
Qortal contract/recovery coverage. The lower test count than RC.2 reflects those
removed platform contracts; generic domain, journal, timeline/player and read
regressions remain in the suite.

Native Hub/mobile/live-QDN tests were not run here. Automated host fixtures do
not establish native runtime compatibility. A local browser harness from phase 1
remains optional and was not used as phase 2 acceptance evidence.

## Scope and delivery

See `docs/QORTAL-PHASE2.md` for runtime instructions, pinned Core/Hub sources and
limitations. Messages, tips and durable removals remain later phases; their
unported bridge actions still fail explicitly. Android background playback is
excluded. Long JSON schemas are not automatically migrated; oversized records
are rejected before approval.

Deliver `NodeFM_0.1.0-qortal-rc.3_phase2.zip` for Qortal publication and the matching
`NodeFM_0.1.0-qortal-rc.3_source.zip` for recovery. The runtime archive has
`index.html` at its root. Source snapshot records exact source hashes and the
unchanged Git base. No commit, push, tag, release or live QDN write was performed.
The source Qortium repository was not changed.

Runtime ZIP SHA-256: `11796af9a1ebc99b1a3ddd20de6cb3a4ce01fc28325ebe04bbff71437aae3af6`.
