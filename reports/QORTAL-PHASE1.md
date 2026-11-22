# Qortal NodeFM phase 1 — delivery report

Date: 2026-11-22. Version: 0.1.0-qortal-rc.1.

## Repository state

- Working repository: iffinland/NonStopPlay-Stream-NodeFM.
- Published main: 51b145eee892bd99bd43a6640f6cbe2e2f4e36b4 (import + audit only).
- Imported source: iffinland/nodefm-station at 654d17f30065ed7a5c3ce0579ae386180128a5a0.
- Phase 1 implementation is uncommitted and not pushed. No tag, release or QDN publication.
- Source repository untouched. Target history preserved.

## Delivered behavior

Qortal global lexical bridge and optional timed requests; public QDN reads and
Core filepath contract; explicit account connection with registered-name lookup;
anonymous startup; memory-only session invalidation; app-context station identity;
registered-owner/config validation; scoped missing/error handling; Qortal media
URL resolver; default APP links; foreground live/playlist playback integration.
Native background handoff is disabled. Signed/Home-only actions are blocked in
this preview until later port phases adapt their payloads/results.

The deterministic timeline, playlist queue and general player remain the
upstream implementation. This phase replaces their platform boundaries.

## Validation

- Clean lockfile install: passed.
- Full suite: 104 files / 911 tests passed.
- Final transport/lexical regression recheck: 2 files / 14 tests passed.
- TypeScript + production build: passed.
- ESLint: passed, no warnings.
- Prettier: passed.
- Git whitespace check: passed.
- Runtime ZIP integrity: passed.

Actual browser media/native Hub/mobile/live QDN behavior remains unverified.
Chromium launch was restricted by the execution environment, and its separate
browser could not reach the local test server. The optional Core host harness
is included for reproduction; no successful browser run is claimed.

## Runtime package

Filename: NodeFM_0.1.0-qortal-rc.1_phase1.zip

SHA-256: `304fa92a102c52c8b4090481d52fbda377fef855098d4e2c43544d7a61483a85`

The ZIP has index.html/assets at its root for Qortal APP publication. The source
ZIP is the complete pending source snapshot, without node_modules, dist or .git.
Keep Hub/the app open; Android background playback is outside the agreed scope.

Qortium data is not copied to Qortal by the source import. Without compatible
Qortal station config/media the expected result is an unconfigured station;
publication becomes usable in phase 2. See docs/QORTAL-PHASE1.md for runtime checks.
