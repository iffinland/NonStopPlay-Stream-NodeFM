# Qortal phase 1: listening preview

**Release acceptance, 2026-11-22:** the owner confirmed RC.9 runtime and all tests passed, and authorized main/tag/release publication. Earlier candidate/pending statements below describe their historical checkpoints and are superseded by the [accepted release](../reports/QORTAL-RC9-ACCEPTANCE.md).

Historical phase checkpoint. Current state: RC.6 runtime accepted; RC.7
implements remaining phases 3–4 and awaits combined native acceptance. See
[phases 3–4](QORTAL-PHASE3-4.md).

Version: `0.1.0-qortal-rc.2`. Base: main `51b145eee892bd99bd43a6640f6cbe2e2f4e36b4`.
The import and audit are published. RC.2 passed owner runtime testing; conversion
changes are included in the owner-authorized RC.5 main checkpoint. Phase 2 is tracked in [QORTAL-PHASE2.md](QORTAL-PHASE2.md).

## Scope

This candidate adapts Qortal transport, public resource reads, Hub-controlled account
authentication, deployment identity and foreground live/playlist playback.
Android background execution and native audio queues are excluded by the owner.
Keep Hub and the app open while listening. Publishing, bulk import, station
editing, likes, messages, payments and resource removal await later port phases;
the transport blocks signed/Home-only actions before sending them to Hub.

The `src/qortium/` directory name is retained temporarily as an internal import
boundary; the phase 1 transport uses Qortal's injected functions. Do not mistake
the remaining Home publishing implementation for completed Qortal support.

## Publication and data identity

- Publish the runtime ZIP's root contents as a Qortal `APP`, using the default
  identifier and the desired registered Qortal publishing name.
- Core's injected `_qdnName` determines the station publisher. There is no need
  to change a hardcoded name in code for each publication.
- Station config is `JSON/<app publisher>/nodefm-station-config`. Its
  `publisherName` must equal that publisher and its `ownerAddress` must match
  the registered name's current owner.
- A confirmed missing config displays an unconfigured station. Node/read/owner
  lookup failures remain errors, with no global fallback to someone else's data.
- Source copying does not move Qortium resources into Qortal. Actual listening
  requires compatible station, playlist/version, track and media resources on
  Qortal. If these do not exist yet, phase 2 will enable their publication.

## Account behavior

Opening the app calls `GET_USER_ACCOUNT` automatically. Hub owns the permission
and its **always authenticate** checkbox: an existing permission is reused without
requiring a Connect click. Without permission Hub may show its normal approval
dialog. Declining leaves public listening available and does not trigger a
prompt loop; **Connect Qortal account** remains available for manual retry.

The session stays in memory; account addresses are never restored from local
storage as authentication evidence. Returning to an established app session
revalidates the current Hub account. Hub's own permission dialog does not cancel
its pending authentication. **Sign out** disconnects this app session, not the
Hub wallet or its saved permission.

Admin authorization compares the authenticated wallet with the registered owner
of the APP name through `GET_NAME_DATA`. It does not depend on station config,
account display names or the optional list of account names. The publisher gets
the Admin menu before a station has been created; all other accounts are guests
for station administration. Failed ownership lookup remains ungranted and offers
a retry. A missing configuration's explicit `NOT_PUBLISHED` status is recognized
without trying to download data that does not exist.

## Owner runtime checks

1. Open the APP published as `NodeFM`. If Hub already has automatic account
   access enabled, the account should connect without another button click.
2. As the owner of the registered `NodeFM` name, check **Admin → Station** opens
   before any station config exists. Actual config/media publication is still
   phase 2 work.
3. Close and reopen the app; confirm automatic account detection again. Switch
   to another Hub account and check that it gets no Admin menu and cannot open
   `/admin/station` directly.
4. Deny account access or use **Sign out** and confirm public listening remains
   available without repeated prompts. Use Connect to retry explicitly.
5. Foreground playback tests from RC.1 remain applicable when compatible Qortal
   station/media resources are available. Android background playback is excluded.

## Developer validation boundary

Unit/component tests cover the Qortal wire requests, native global lexical
binding resolution, automatic authentication, approval-dialog survival and session
revalidation, station publisher/owner integrity, scoped missing/error handling,
stale asynchronous results and the existing radio/playlist/domain regressions.

`scripts/check-qortal-host.mjs` is an optional integration harness. It serves
production `dist` with the pinned Core v6.1.9 `q-apps.js`, local data/media and a
surrogate Hub authentication response. It needs Playwright and a Core checkout selected by `QORTAL_CORE_ROOT`, pinned
to commit `108bf191d42d710ec617f535af30cfd82fc03c87`; set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE` when using system Chromium. It never publishes
to QDN. Even a successful fixture run would not prove native Hub behavior.

The current execution environment could not launch Chromium (socket restriction)
or expose the local fixture server to its separate browser. Therefore browser
media, mobile layout, native Hub and live QDN checks remain unverified. No
successful browser/audio runtime test is claimed for this candidate.
