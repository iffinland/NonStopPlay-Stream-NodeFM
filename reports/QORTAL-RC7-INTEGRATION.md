# RC.7 — combined Qortal port phases 3–4

Historical candidate report. The owner accepted the accumulated RC.9 runtime on 2026-11-22 and authorized release; see [RC.9 acceptance](QORTAL-RC9-ACCEPTANCE.md).

Date: 2026-11-22. Candidate: `0.1.0-qortal-rc.7`.
Base main: `5167d1f59aada86d48c01b7c3f929b71b46b3acb`.
Includes the uncommitted RC.6 collaborator/social work, accepted by the owner in
native runtime on 2026-11-22, plus this integration work.

## Result

- All existing station removal actions publish signed DOCUMENT manifest markers;
  the unsupported Core deletion action is never dispatched. Search/list, exact
  fetch, status and URL reads respect removal, including legacy owner metadata.
- Owner-only stations use the same manifest boundary from epoch zero. Owner and
  collaborators retain their own real publication/payment identities. Access
  checkpoints preserve removal markers, and removed writers cannot revive them.
- A removal wins a same-sequence concurrent edit; intentional later publication
  uses a higher revision. Unknown outcomes do not remove the local object and
  never trigger an automatic signed retry.
- Historical playlist-version deletion now fails on uncertain/unavailable
  reference reads. Latest/default/scheduled versions remain protected.
- Station legacy discovery uses exact publisher matching and 200-item pagination.
  Repeated pages or incomplete/malformed discovery fail explicitly. Merging all
  manifest records retains the existing per-writer revision ordering.
- Long logical station JSON records use physical DOCUMENT manifests. Registry and
  personal/listener JSON keep Core's 25 KiB limit. Manifests/checkpoints are
  bounded to 16 MiB; per-writer records to 10,000. Oversized writes are rejected
  before any physical publication.
- Qortal identity/validation wording, current-state docs, user guide, release
  runbook and combined desktop/Android native checklist are updated.

## Verification

| Check                                      | Result                       |
| ------------------------------------------ | ---------------------------- |
| Full Vitest suite                          | 118 files / 974 tests passed |
| Production collaboration/integration suite | 28 tests passed              |
| TypeScript + production Vite build         | Passed                       |
| ESLint                                     | Passed                       |
| Prettier                                   | Passed                       |
| Git whitespace                             | Passed                       |
| JavaScript                                 | 959.10 kB; gzip 272.53 kB    |
| CSS                                        | 65.29 kB; gzip 10.89 kB      |

Sixteen added integration cases exercise production bridge/store paths:

- legacy-resource removal without a team and as a named collaborator;
- cold-session search, fetch, status and URL behavior after removal;
- revocation checkpoints, rejected revoked writes, explicit republication and
  concurrent removal/edit precedence;
- unconfirmed signed outcomes, no duplicate request and unchanged local library;
- track/notice/one-off-event cleanup through real stores;
- recurring-show parent/future-occurrence deletion and cold reconstruction;
- unauthorized-wallet deletion rejected before publication;
- collaborator Request Show publication and exact lineup reuse after reopening;
- public/private listener playlists retaining personal publishing identity,
  public reconstruction and Qortal deep links;
- > 25 KiB station records round-tripping via DOCUMENT, personal JSON rejection,
  > and >16 MiB station documents rejected before publication;
- 430-record legacy pagination, removal on a later page, repeated-page failure;
- referenced/unknown-read version protection and successful unused-version removal
  without deleting the latest logical playlist.

These tests use controlled host responses and do not execute a live QDN write,
Chat, payment or native Hub playback. Existing regression coverage includes
UTC/DST scheduling, ranking/likes, deterministic playback, account isolation,
publication recovery and signed social actions. This is not a new claim of
native Android/desktop acceptance.

## Delivery and remaining gate

Runtime archive: `NodeFM_0.1.0-qortal-rc.7_integration.zip`.
Source archive: `NodeFM_0.1.0-qortal-rc.7_source.zip`.
Runtime has `index.html` and LICENSE at ZIP root. Source includes this report,
operator docs and `SOURCE-SNAPSHOT.json` with base revision, per-file hashes and
the exact runtime checksum. The runtime ZIP is the one to publish for testing.

Owner RC.7 combined desktop/mobile acceptance remains pending; see
[the focused checklist](../docs/QORTAL-PHASE3-4.md#combined-native-acceptance).
All working clients must reopen the updated app. QDN propagation still applies;
removal hides station content rather than erasing media from the network.
Global/personal index searches retain their existing per-query limits.
Foreground operation is the accepted scope; background playback is excluded.

No commit/push, tag, official release, APP deployment or real transaction has
been performed in this iteration. Final main/tag/release publication follows
RC.7 owner acceptance and the release instruction. Qortium upstream is unchanged.
