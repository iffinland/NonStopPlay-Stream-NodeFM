# NodeFM Qortal port audit

Date: 2026-11-22. Baseline audit; implementation progress is tracked in
[QORTAL-PHASE1.md](QORTAL-PHASE1.md) and [QORTAL-PHASE2.md](QORTAL-PHASE2.md).
RC.5, including progress/preview refinements, passed owner runtime tests.
Phases 1–2 are accepted; phase 3 has not started. See the
[accepted RC.5 checkpoint](../reports/QORTAL-RC5-ACCEPTANCE.md). The owner has excluded Android background
playback: foreground operation while Hub/the app is open is the accepted scope.

## Decision

The port is feasible at application level without changing Qortal Core or Hub
for desktop/foreground use. It is a medium-to-large integration job. Preserve
the deterministic timeline, scheduling, player, domain objects, UI and journals.
Replace Qortium contracts and the feature code that depends on them.

Full Android background parity is unproven: the audited Qortal interfaces do not
expose Qortium's native background queue. Browser media cannot guarantee schedule
execution and track transitions after the host suspends its WebView. This is a
separate acceptance boundary from ordinary foreground playback.

## Audited baselines and repository isolation

| Repository                          | Ref                    | Commit                                     |
| ----------------------------------- | ---------------------- | ------------------------------------------ |
| iffinland/nodefm-station            | main                   | `654d17f30065ed7a5c3ce0579ae386180128a5a0` |
| iffinland/NonStopPlay-Stream-NodeFM | previous main          | `3051e780cf50f54816bbfabf52e657e67e7c3ab6` |
| Qortal/qortal                       | master; release v6.1.9 | `108bf191d42d710ec617f535af30cfd82fc03c87` |
| Qortal/Qortal-Hub                   | develop                | `42e2329aab337726d71faf34ebb68b091d7f9d61` |
| Qortal/Qortal-Hub                   | stable v3.0.3          | `f3b75daa717928c8a35491fd528a14dc3d4ee14d` |

GitHub's latest stable release endpoints returned Core v6.1.9 and Hub v3.0.3.
Both stable Hub and current development code were inspected. Development code
is not automatically treated as deployed behavior. No Core/Hub binaries were
built or executed, and no live-node or mobile-host validation was performed.

Import commit: `353092e5e999fa8194a6fa7b2f3ca37e3c1a2020`. Its complete tracked
tree matches upstream tree `c6ded4a5969534d2271473ff90e9036c9374830a` exactly.
The previous target main is its parent: no history rewrite or force push.
Audit/guidance edits follow separately. Upstream source stays unchanged; no
release, tag or QDN publication is included in the import/audit.

## Starting-point checks

- Lockfile installation passed: `npm ci --no-audit --no-fund`.
- Tests passed: 102 files / 899 tests (`--maxWorkers=2`).
- Build passed: executable JS 940.77 kB / gzip 263.80 kB; CSS 64.52 kB.
- ESLint passed; Prettier passed on the original baseline.
- 215 production TS/TSX files, approximately 44,238 lines excluding tests.

This is the size of the existing product, not the volume to rewrite. Passing
Qortium mocks confirms a healthy baseline, not Qortal runtime compatibility.

## Contract mapping

| Area             | Existing assumption                                                                     | Qortal contract / required adaptation                                                                                                                                                                                                        | Priority            |
| ---------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Transport        | `window.qdnRequest`; parent/top lookup                                                  | Core injects `qortalRequest` / `qortalRequestWithTimeout`. They are top-level `const` bindings: checking only `window.qortalRequest` is insufficient. Resolve the injected global and coordinate host/app timeouts.                          | P0                  |
| Authentication   | `GET_SELECTED_ACCOUNT` returns name and `isUnlocked`; `UNLOCK_SELECTED_ACCOUNT` unlocks | Hub uses permissioned `GET_USER_ACCOUNT`, returning address/publicKey. Resolve names through `GET_ACCOUNT_NAMES`. Replace the Home write gate; preserve anonymous listening and avoid startup authentication prompts.                        | P0                  |
| Publishing       | Stage/select native source, publish `sourceToken`                                       | Hub accepts `file`, `data64` or `base64` with `filename` and metadata. NodeFM currently rejects those fields. Replace source acquisition and publication contracts.                                                                          | P0                  |
| Results          | Home `{accepted, resource, transactionSignature}` and `{published, failures}`           | Hub single publish returns a transaction result; full batch success returns an array; failures use `error.unsuccessfulPublishes`. Normalize real outcomes, preserving partial/unknown states without duplicate writes.                       | P0                  |
| Bulk import      | Home 2 picker, host info, native source handles                                         | A separate Home-specific adapter exists outside the bridge. Add a Qortal adapter using browser-selected files; retain journals, content revisions and recovery.                                                                              | P0                  |
| Media            | `GET_QDN_RESOURCE_STREAM_URL` for audio/covers                                          | No matching audited Qortal command. Use `GET_QDN_RESOURCE_URL`; Core's arbitrary endpoint supports Range/206. Verify URL reachability, MIME, seek and buffering through the real Hub transport.                                              | P0                  |
| Removal          | `DELETE_QDN_RESOURCE` network tombstones                                                | No matching audited action. `DELETE_HOSTED_DATA` removes local hosted data only. Use durable application tombstones respected by every discovery/reconstruction path.                                                                        | P0                  |
| Identity         | Hardcoded `APP/NodeFM/Radio-AutoDJ`; config under `NodeFM`                              | Qortal has separate name ownership/resources. Establish one consistent Qortal publication identity, enforce owner checks including fresh bootstrap, and support normal default-identifier APP launch.                                        | P0                  |
| Reads            | Search/list/fetch/status/metadata                                                       | Much is shared. Core expects `filepath` for fetch while an upstream helper sends `path`. Verify encoding, pagination, exact-name scoping, parsing and missing-vs-unavailable classification.                                                 | P1                  |
| JSON records     | Station/track/version/schedule metadata                                                 | Core JSON service caps each resource at 25 KiB. Validate UTF-8 bytes before approval; long versions/schedules may require bounded records or an alternate service with matching references. Actual network resource sizes were not measured. | P1                  |
| Tips             | Recipient/amount; Home acceptance envelope                                              | Hub additionally requires `coin: 'QORT'`. Normalize its transaction result and never automatically retry a payment.                                                                                                                          | P1                  |
| Direct chat      | `recipientAddress`; Home result envelope                                                | Hub expects `destinationAddress` or `recipient`. Match payload/result and direct encrypted-chat behavior; replace the Home Chat-app shortcut.                                                                                                | P1                  |
| Links            | `qdn://`; `address`; Home current/new tab                                               | Qortal uses `qortal://`; Hub `OPEN_NEW_TAB` requires `qortalLink`. Verify app paths, default identifier, shared playlists and back/forward.                                                                                                  | P1                  |
| Background queue | Native queue/control/status actions                                                     | No equivalent found in audited request handlers. Foreground HTMLAudioElement remains viable; tab switching and screen lock need host-specific runtime evidence.                                                                              | P1 / host-dependent |
| Settings         | Home settings action/types/events                                                       | No active `GET_HOME_SETTINGS` caller found. Remove/adapt unused contracts and Home-specific wording after critical behavior works.                                                                                                           | P2                  |
| Packaging        | Qortium manifest/docs and local workspace paths                                         | Package static Vite dist as a Qortal APP archive; retain GPL attribution and update operator/release documentation. No continuous streaming backend is required by the radio model.                                                          | P2                  |

## Integration details that affect scope

1. Publishing changes reach ordinary uploads and listener submissions, not just
   `src/qortium/qdn.ts`. `features/bulk-import/home2BulkPublicationAdapter.ts`
   independently implements native token acquisition and strict Home result
   validation; it also needs replacement at its adapter boundary.
2. Removal reaches tracks, schedule events/recurrences, playlist versions and
   notices. A UI-only filter would fail after reload or on another device.
   Preserve existing version-reference checks and durable removal state.
3. `AuthProvider` currently resolves Home auth at mount. A blind action rename
   would introduce Qortal approval prompts during startup. Anonymous listening
   and explicit authentication must remain separate. Replace the Qortium
   account-change signal and preserve account/store isolation.
4. Missing `isUnlocked` currently means locked. Leaving this gate in place would
   block every signed action even after successful Qortal authentication.
5. Timeout budgets exist both inside Core's injected bridge and in NodeFM's
   wrapper. An outer timeout cannot extend the inner one. Preserve safe read
   retries and reconcile uncertain writes instead of automatically repeating.
6. Qortium and Qortal do not share QDN data. A Git copy does not migrate AUDIO,
   covers, station config, playlists or schedules. Bootstrap a Qortal station
   with a small sample; migration of an existing catalogue is a separate data
   operation requiring access to the original resource bytes.
7. Confirm the Qortal publishing name before building the first runtime ZIP;
   the upstream hardcoded name/identifier must not silently determine ownership.
   The GitHub repository name is not itself a Qortal registered name.

## Recommended phases and effort

Planning estimates for focused engineering work, not a completion promise.
Assumes existing product/UI and no new streaming backend.

| Phase | Reviewable result                                                                                           | Effort      |
| ----- | ----------------------------------------------------------------------------------------------------------- | ----------- |
| 1     | Qortal transport, account/identity, public reads and live/playlist playback; first foreground listening ZIP | 6–10 hours  |
| 2     | Ordinary uploads, bulk import, listener publication and transaction outcomes; persist a usable station      | 8–14 hours  |
| 3     | Durable removals, JSON limits, messages/tips/links and account isolation; feature-complete candidate        | 6–10 hours  |
| 4     | Integrated desktop/mobile runtime fixes, packaging and docs; owner-validated release candidate              | 4–8 hours   |
| Total | Full foreground application ready for owner acceptance                                                      | 24–42 hours |

Android screen-lock playback investigation is additional and open-ended if the
host suspends execution. Media Session can improve controls but cannot confer
native background execution. Any required host changes would be a separate
project/decision. Core/Hub changes are not part of this application's port.

Runtime acceptance should cover deterministic live offset/seek, default rotation
and schedule transitions, cold QDN loading, large mobile uploads, interrupted or
partially successful batches, reload after removal, ownership/account switching,
long JSON records, declined/uncertain signed actions, default APP launch and
shared playlist links. Deliver a ZIP per phase. Conversion commits/main push and
official release follow explicit owner approval after actual runtime testing.

## Pinned primary sources

- [Imported NodeFM](https://github.com/iffinland/nodefm-station/tree/654d17f30065ed7a5c3ce0579ae386180128a5a0).
- [Core bridge and reads](https://github.com/Qortal/qortal/blob/108bf191d42d710ec617f535af30cfd82fc03c87/src/main/resources/q-apps/q-apps.js).
- [HTML bootstrap](https://github.com/Qortal/qortal/blob/108bf191d42d710ec617f535af30cfd82fc03c87/src/main/java/org/qortal/api/HTMLParser.java).
- [Services / JSON limit](https://github.com/Qortal/qortal/blob/108bf191d42d710ec617f535af30cfd82fc03c87/src/main/java/org/qortal/arbitrary/misc/Service.java).
- [Range delivery](https://github.com/Qortal/qortal/blob/108bf191d42d710ec617f535af30cfd82fc03c87/src/main/java/org/qortal/api/resource/ArbitraryResource.java).
- [Stable Hub implementations](https://github.com/Qortal/Qortal-Hub/blob/f3b75daa717928c8a35491fd528a14dc3d4ee14d/src/qortal/get.ts).
- [Stable Hub dispatch](https://github.com/Qortal/Qortal-Hub/blob/f3b75daa717928c8a35491fd528a14dc3d4ee14d/src/qortal/qortal-requests.ts).
- [Stable Hub request list/frame listener](https://github.com/Qortal/Qortal-Hub/blob/f3b75daa717928c8a35491fd528a14dc3d4ee14d/src/hooks/useQortalMessageListener.tsx).
- [Current Hub dispatch](https://github.com/Qortal/Qortal-Hub/blob/42e2329aab337726d71faf34ebb68b091d7f9d61/src/qortal/qortal-requests.ts).
