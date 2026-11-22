# NodeFM for Qortal — 0.1.0-qortal-rc.9

Runtime-accepted Qortal release. The owner confirmed RC.9 runtime and all tests
passed on 2026-11-22. This release contains the full Qortal port through RC.9.

- Named station collaborators/DJs, managed only by the APP owner. Collaborators
  publish under their own Qortal names and pay from their own wallets.
- Durable station removals, complete station discovery and long metadata through
  writer manifests. Current membership and frozen metadata share one access document.
- One Hub batch approval for complete publication actions, including local uploads,
  covers/metadata, listener submissions, bulk selections, programs and lineups.
- Bounded daily/weekly schedules with visible start/end dates and an actual
  1/2/3/6-month/custom review dialog reachable from the main Schedule Program form.
- Full Upcoming Schedule titles on phones, rotating progress and in-app preview.
- Native encrypted owner Chat, QORT tips, listener/public playlists, moderation,
  Request Shows and deterministic foreground radio playback.

The runtime ZIP is byte-for-byte the owner's tested RC.9 archive. Release
verification rebuilds the committed source and compares every application file
with that archive before publishing. Automated verification: 119 test files /
993 tests, TypeScript/Vite build, ESLint, formatting and whitespace checks.

## Assets

- **NodeFM_0.1.0-qortal-rc.9.zip** — publish this ZIP as the existing default-
  identifier Qortal APP, `qortal://APP/NodeFM/`. index.html and LICENSE are at root.
- **NodeFM_0.1.0-qortal-rc.9_release-source.zip** — complete release source and
  finalized documentation, including a commit/file checksum snapshot.
- **SHA256SUMS** — SHA-256 checksums of both ZIPs.

Reopen/update all working APP tabs. Existing content and access data are retained;
the current client reads the earlier registry/checkpoint format. Foreground
operation while Hub/the APP is open is the accepted scope. Android background
playback remains excluded. Unknown signed results must be resolved through
read-only verification before another publication; no automatic signed retries.

Qortium upstream is unchanged. License: GPL-3.0-only.
