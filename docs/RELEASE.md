# NodeFM Qortal release and deployment runbook

## Current accepted release

`0.1.0-qortal-rc.9` passed owner native runtime and all tests on 2026-11-22.
The owner authorized the complete main commit/push, documentation finalization
and official release of this exact state. See
[acceptance/provenance](../reports/QORTAL-RC9-ACCEPTANCE.md) and
[release notes](RELEASE-NOTES-RC9.md).

Runtime release ZIP is byte-identical to the accepted RC.9 archive. Source release
ZIP is generated from the final release commit and includes the completed docs.
The release's SHA256SUMS identifies both ZIPs.

`package.json` and the root lockfile package record are the Qortal build version.
The imported `qortium-app.json` is historical Qortium metadata and is not the
Qortal deployment manifest or version authority.

## Repository and authority

Work only in `iffinland/NonStopPlay-Stream-NodeFM`. Preserve target history.
`iffinland/nodefm-station` is read-only. New implementation iterations must pass
automated checks and owner runtime testing before owner-authorized commit/push.
Tags, official releases, deployment and live signing/payments/QDN publication
require their own authorization. Preserve existing station resources and data.

## Build verification

Record branch, HEAD, remote head and the working tree; confirm source scope and
that the root package/lockfile versions match. Run:

```bash
npm ci
npm test
npm run build
npm run lint
npm run format:check
git diff --check
```

Package the contents of `dist/` plus `LICENSE` with `index.html` at ZIP root.
Keep runtime and complete source archives separate. Record SHA-256 and source
provenance; an uncommitted runtime candidate must have an exact source snapshot.
Do not imply an older source ZIP contains later documentation-only commit edits.

## Qortal publication identity

Publish the runtime ZIP as the existing APP with the default identifier. For the
current deployment this is `qortal://APP/NodeFM/`. The app derives its publisher
name from Core's deployed identity; the registered name owner is the station
owner. RC.6 lets that owner explicitly grant collaborator access. Actual signed
resources use each writer's registered name/wallet; see the collaborator guide.
A display-name match grants no permissions. Qortium/Qortal content
is separate: importing Git source does not migrate existing audio or playlists.

## Runtime validation

Use the real Qortal Hub for cold/warm opens, automatic account permission,
owner/guest separation, direct routes, foreground radio/playlists and resource
loading. Verify local/QDN uploads, single and bulk listener submission/moderation,
playlist versions, station configuration, schedules and playback transitions.
Preview Audio must stay inside the app and stop on close. Transaction dialogs
must show rotating activity without a signed Retry action.

Unknown publication is not permission to submit again. Preserve the staged
source files/journal, use read-only exact verification, and continue only the
remaining steps. Hub approves signing and fees. A node-read failure after a
transaction is not proof that publication failed.

The accumulated port phases and RC.9 UI/batch work are owner-runtime accepted.
Foreground operation while Hub/the APP is open remains the scope. Android
background playback is excluded.

Automated fixtures, source inspection and local builds supplement owner runtime
evidence; they do not independently prove native-host playback or transactions.

## Publishing an accepted release

An explicit `.github/releases/<tag>.json` descriptor and its accepted runtime ZIP
are release inputs, added only under the owner's release instruction. Changing
one descriptor on main triggers `.github/workflows/release.yml`. Ordinary source
and documentation pushes do not trigger publication. The job runs locked install,
tests/build/lint/format checks, validates the accepted archive checksum and every
rebuilt application file, then creates a draft/tag, uploads runtime/source/checksums,
verifies the asset list and publishes. It refuses to overwrite an existing release.
The GitHub release and successful Actions run confirm remote publication.

`scripts/package_release.py` validates versions and runtime/build equality.
`--verify-only` performs that check locally without packaging an uncommitted tree.
Final source packaging requires a clean checkout and records the exact commit.
The accepted runtime ZIP is kept as a small, explicit release handoff so publication
does not silently replace the owner's tested bytes with a newly compressed build.
