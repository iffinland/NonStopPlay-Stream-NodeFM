# NodeFM Station for Qortal

Scheduled auto-DJ radio for Qortal. Listeners join a shared broadcast position
computed from published playlist versions, schedules, verified track lengths and
the station clock. No continuously running streaming server is required.

Working repository: <https://github.com/iffinland/NonStopPlay-Stream-NodeFM>.

## Runtime-accepted Qortal release

**0.1.0-qortal-rc.9 — owner runtime and all tests passed (2026-11-22).**
The owner authorized the complete main update and official GitHub release.

- [Release page](https://github.com/iffinland/NonStopPlay-Stream-NodeFM/releases/tag/v0.1.0-qortal-rc.9)
- [Runtime APP ZIP](https://github.com/iffinland/NonStopPlay-Stream-NodeFM/releases/download/v0.1.0-qortal-rc.9/NodeFM_0.1.0-qortal-rc.9.zip)
- [Release source ZIP](https://github.com/iffinland/NonStopPlay-Stream-NodeFM/releases/download/v0.1.0-qortal-rc.9/NodeFM_0.1.0-qortal-rc.9_release-source.zip)
- [SHA256SUMS](https://github.com/iffinland/NonStopPlay-Stream-NodeFM/releases/download/v0.1.0-qortal-rc.9/SHA256SUMS)

The runtime ZIP is exactly the tested RC.9 archive, with index.html and LICENSE
at root. Publish it as the existing default-identifier APP, `qortal://APP/NodeFM/`.
The source ZIP contains the release commit, finalized docs and a file checksum
snapshot. See [release notes](docs/RELEASE-NOTES-RC9.md) and
[owner acceptance](reports/QORTAL-RC9-ACCEPTANCE.md).

Implemented and accepted:

- owner-managed named collaborators/DJs publishing under their own names/wallets;
- durable removal, complete station discovery and bounded long metadata;
- one Hub approval for complete uploads, bulk selections, programs and lineups;
- visible start/end dates, Once/Daily/Weekly selection and real period review;
- full Upcoming Schedule names on phones, progress and in-app audio preview;
- encrypted native owner Chat, QORT tips, listener/public playlists and moderation;
- deterministic foreground radio, scheduled programs and Request Show playback.

See [user/station guide](docs/USER-GUIDE.md),
[schedule UI](docs/QORTAL-SCHEDULE-UI.md),
[batch publication](docs/QORTAL-BATCH-PUBLISHING.md) and
[collaborators](docs/QORTAL-COLLABORATORS.md).
Keep Hub/the APP open for supported playback; Android background operation is
outside this release's scope. Update/reopen all working APP tabs.

## Build and publish

```bash
npm ci
npm test
npm run build
npm run lint
npm run format:check
```

Package the **contents** of `dist/`, with `index.html` at the ZIP root, and retain
`LICENSE`. Publish the runtime ZIP as the existing Qortal APP using its default
identifier. Do not publish the source ZIP. The registered owner of the deployed
APP name receives owner access. Only accounts granted by this owner receive
collaborator Admin access; all other accounts remain station guests.

Publishing/signing/fees use Qortal Hub approvals. Do not repeat an unknown signed
request: for bulk work, use Check pending publications, then continue confirmed
progress. Read-only refresh/reload controls send no new publication transaction.
Preview Audio opens inside the app, pauses the global player only when preview
playback starts and unloads when closed. Resume radio explicitly afterwards.

See [Qortal phase 2 and operator checks](docs/QORTAL-PHASE2.md),
[phase 1 identity/playback](docs/QORTAL-PHASE1.md),
[release runbook](docs/RELEASE.md) and
[accepted RC.5 checkpoint](reports/QORTAL-RC5-ACCEPTANCE.md).

## Source provenance and scope

Imported from the read-only Qortium repository
<https://github.com/iffinland/nodefm-station> at
`654d17f30065ed7a5c3ce0579ae386180128a5a0`.
Import: `353092e5e999fa8194a6fa7b2f3ca37e3c1a2020`;
audit baseline: `51b145eee892bd99bd43a6640f6cbe2e2f4e36b4`.
The original Qortium repository is unchanged. Port commits preserve target history.

The deterministic timeline, scheduling and domain model come from the imported
product. Qortal-specific boundaries and accepted scope are described in the
[compatibility audit](docs/QORTAL-PORT-AUDIT.md). Older Qortium specifications and
iteration reports are historical unless superseded by the Qortal documents.

Durable specifications:

- [Project vision](docs/PROJECT-VISION.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Imported data model](docs/QORTIUM-DATA-MODEL.md)
- [Radio timeline](docs/RADIO-TIMELINE-SPEC.md)
- [Player](docs/PLAYER-SPEC.md)
- [Admin](docs/ADMIN-SPEC.md)
- [Roadmap](docs/ROADMAP.md)

## Verification and workflow

**119 test files / 993 tests passed**, with TypeScript/Vite production build,
ESLint, formatting and whitespace checks. Owner RC.9 native runtime passed.
See [acceptance and release provenance](reports/QORTAL-RC9-ACCEPTANCE.md).
Controlled host fixtures supplement that runtime result; tests send no live
QDN publication, payment or Chat.

Follow [AGENTS.md](AGENTS.md). New development iterations are delivered as runtime
and source ZIPs; commit/push follows owner authorization after runtime acceptance.
Tag, official release and deployment require separate authorization.

License: GPL-3.0-only; see [LICENSE](LICENSE).
