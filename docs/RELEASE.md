# NodeFM Qortal release and deployment runbook

## Current checkpoint

Accepted version: `0.1.0-qortal-rc.5`, including progress and submission preview.
The owner passed native Hub runtime checks and authorized the main commit/push
on 2026-11-22. This is a phase 1–2 development checkpoint; no official release/tag
is created by that instruction. See [acceptance](../reports/QORTAL-RC5-ACCEPTANCE.md).

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
administrator. A display-name match grants no permissions. Qortium/Qortal content
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

Phases 3–4 must add and validate durable removal, messages/tips and remaining
integration before a feature-complete release. Foreground operation while Hub/the
app is open is the accepted scope; Android background playback remains excluded.

Automated fixtures, source inspection and local builds supplement owner runtime
evidence; they do not independently prove native-host playback or transactions.
