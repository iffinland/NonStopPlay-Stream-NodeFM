# RC.6 — owner-managed station collaborators

Historical candidate report. The owner accepted the accumulated RC.9 runtime on 2026-11-22 and authorized release; see [RC.9 acceptance](QORTAL-RC9-ACCEPTANCE.md).

Date: 2026-11-22. Candidate: `0.1.0-qortal-rc.6`.
Base: accepted main `5167d1f59aada86d48c01b7c3f929b71b46b3acb`.
Status: implemented, automated checks passed; native Hub runtime acceptance
pending. No commit, push, tag, release or live QDN transaction performed.

## Result

- APP owner-only Manage admins page accepts a Qortal name or named wallet,
  shows the resolved identity, and adds/removes collaborators.
- Owner identity still comes from registered APP name ownership. Registry
  contents cannot replace that authority. Grants bind wallet, registered name
  and grant ID; a name transfer does not transfer access.
- Collaborators receive existing station management routes and write access,
  except membership management. Both direct membership routes and service calls
  are protected. An unrelated guest remains a guest.
- Station publication is routed to each writer's own name and wallet using
  owner-authorized manifests. Existing station domain identity and legacy
  owner-published resources remain compatible with the new client.
- Membership changes checkpoint currently accepted metadata before advancing
  the access epoch. Removed members' later manifests are excluded. Media remains
  under its original publisher; the checkpoint does not archive binary bytes.
- Actual account is separate from station owner in bulk publication, notices
  and moderation. Personal submissions/playlists are outside this station adapter.
- Every physical transaction must match the requested coordinates and have a
  signature before logical success. Unknown/partial outcomes do not cause an
  automatic signed retry. The access editor shows a spinner and prevents another
  write after an uncertain outcome.
- Pure JavaScript SHA-256 supports Hub apps rendered through HTTP node URLs
  without SubtleCrypto. Dependency `@noble/hashes` is pinned at `2.4.0`.

See [operator/data contract and native test checklist](../docs/QORTAL-COLLABORATORS.md).

## Verification

| Check                              | Result                       |
| ---------------------------------- | ---------------------------- |
| Full Vitest suite                  | 116 files / 942 tests passed |
| TypeScript + production Vite build | Passed                       |
| ESLint                             | Passed                       |
| Prettier                           | Passed                       |
| Git whitespace check               | Passed                       |
| Production JS                      | 955.99 kB; gzip 271.46 kB    |
| Production CSS                     | 65.29 kB; gzip 10.89 kB      |

New tests exercise the production bridge, Qortal publication normalizer and
domain stores against a name-ownership-enforcing transport fixture:

- named-wallet requirement, owner grants and real writer identity;
- library, playlist/version, public playlist, schedule, station and notice
  publication as collaborator, reconstructed for an unrelated listener;
- listener track acceptance as collaborator and moderation reloaded as owner;
- unauthorized wallets and owner-only registry writes rejected;
- independent writers' merges and deterministic revision precedence;
- revocation retains accepted metadata and ignores removed-member changes;
- media/metadata sequencing before node indexing;
- malformed manifests cannot prevent owner removal;
- registry owner mismatch and incomplete physical batch failure;
- operation without SubtleCrypto;
- owner-only UI, explicit identity review, progress and no duplicate retry;
- focus-check read failure preserves an editor, while verified revocation or
  a different wallet removes access and stale responses cannot restore it.

Fixtures are not native Hub transaction or payment evidence. Runtime acceptance
must use a second named wallet and verify real name/fee ownership, propagation,
moderation, media/playback and revocation. The new adapter requires current RC.6
clients; reopen/update older working tabs.

## Delivery and next work

Runtime ZIP contains `dist/` contents and `LICENSE` with `index.html` at root.
The separate source ZIP includes the exact uncommitted source and a generated
`SOURCE-SNAPSHOT.json` with per-file hashes, base revision and runtime checksum.
Publish only the runtime ZIP for testing. Source archive is for review/recovery.

Qortal port phases 3–4 remain pending: durable removal and remaining feature
integration, then final release validation. The later
[RC.6 social addendum](QORTAL-RC6-SOCIAL.md) implements outgoing messages/tips and
awaits native runtime acceptance. Android background playback remains excluded.
Original Qortium upstream is unchanged.
