# NodeFM Station for Qortal

Scheduled auto-DJ radio for Qortal. Listeners join a shared broadcast position
computed from published playlist versions, schedules, verified track lengths and
the station clock. No continuously running streaming server is required.

Working repository: <https://github.com/iffinland/NonStopPlay-Stream-NodeFM>.

## Current accepted version

**0.1.0-qortal-rc.5 — owner runtime passed, including the progress/preview addendum
(2026-11-22).** Qortal port phases 1 and 2 are accepted for foreground operation
while Hub/the app is open. Android background playback is outside the scope.

Implemented and accepted:

- Hub automatic account authentication and registered APP publisher Admin access;
- Qortal resource reads, foreground radio/playlist playback and navigation;
- local audio/cover uploads and QDN audio search/add with duration recovery;
- immediate library updates after confirmed Track publication;
- single listener submissions, review, acceptance and rejection;
- one-action bulk publication: select files, edit metadata, then Publish selected
  or Submit selected; Hub approves the media and track-detail batches;
- station configuration and playlist/version publication;
- rotating progress indicators, no signed Retry buttons in transaction dialogs,
  and in-app listener audio preview using the complete AUDIO identifier.

Pending Qortal port phases: durable resource removal, messages/tips and remaining
feature integration, followed by final release validation. Unported bridge actions
fail explicitly. RC.5 is an accepted development checkpoint, not a final release.

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
APP name receives Admin access; other accounts remain station guests.

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

Accepted RC.5: **113 test files / 925 tests**, production build, ESLint, formatting
and Git whitespace checks passed. Automated host fixtures supplement the owner's
native Hub runtime result; they do not independently prove native compatibility.
No live QDN transactions are performed by the test suite.

Follow [AGENTS.md](AGENTS.md). New development iterations are delivered as runtime
and source ZIPs; commit/push follows owner authorization after runtime acceptance.
Tag, official release and deployment require separate authorization.

License: GPL-3.0-only; see [LICENSE](LICENSE).
