# NodeFM Qortal RC.5 accepted main checkpoint

Date: 2026-11-22. Version: `0.1.0-qortal-rc.5`.
Repository: `iffinland/NonStopPlay-Stream-NodeFM`.
Parent/base: `51b145eee892bd99bd43a6640f6cbe2e2f4e36b4` (import and audit).

## Owner acceptance and authorization

The owner passed base RC.5 runtime and then passed the same-version progress and
in-app submission-preview refinements. The latest instruction authorizes commit
and push to main plus documentation updates. This checkpoint includes all
previously uncommitted Qortal phase 1–2 implementation and RC.1–5 fixes. It does
not start phase 3 or authorize an official tag/release/deployment.

## Accepted behavior

Hub authentication/auto-auth, registered APP publisher administration, foreground
QDN radio/playlist reads/playback, local/QDN uploads and metadata/duration flows,
station configuration and playlist/version publishing. Single uploads update
the live library immediately. Bulk publishes audio/covers and canonical metadata
from one app action with Hub approvals, preserving confirmed/unknown outcomes.
Listener submissions and moderation use compatible media identities. Signed
Retry controls are removed from transaction dialogs; progress uses rotating
indicators. Review preview opens the full AUDIO reference inside the app and
unloads when closed. Android background playback remains excluded.

## Validation

Latest implementation validation: 113 files / 925 tests passed, TypeScript/Vite
production build passed, ESLint/Prettier and Git whitespace checks passed. Owner
native runtime acceptance is recorded separately from automated host fixtures.
No test performed a live paid QDN transaction. Documentation-only checkpoint
edits are verified again before main publication.

Accepted runtime artifact:
`NodeFM_0.1.0-qortal-rc.5_bulk-publishing.zip`
SHA-256: `2cb6c47e38cc107f2ab2b5582250dd985d7d662541ce69ecd36f30ce4746d3e8`.

Matching accepted implementation source snapshot:
`NodeFM_0.1.0-qortal-rc.5_source.zip`
SHA-256: `248f40b23d1c1f17d39cef713bd66b0d6ed9593419526942ee7b60a0847c281a`.

These pre-commit archives contain the accepted implementation and their exact
source manifest. Main adds acceptance/finalization documentation; the previous
source archive is not represented as an archive of this later documentation
commit. Iteration reports describe their historical stage; this report and the
Qortal phase documents supersede their pending/uncommitted status statements.

## Next boundary

Phase 3 is not started: durable removal, Qortal messages/tips and remaining
integration. Phase 4/final release validation remains later. No Qortium upstream,
Core or Hub changes are included. Target Git history is preserved; no force push.
