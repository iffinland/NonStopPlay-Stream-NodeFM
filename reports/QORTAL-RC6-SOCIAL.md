# RC.6 addendum — native Qortal messages and tips

Historical candidate report. The owner accepted the accumulated RC.9 runtime on 2026-11-22 and authorized release; see [RC.9 acceptance](QORTAL-RC9-ACCEPTANCE.md).

Date: 2026-11-22. Version remains `0.1.0-qortal-rc.6` alongside the collaborator
candidate. Base main remains `5167d1f59aada86d48c01b7c3f929b71b46b3acb`.
Native runtime acceptance pending. No commit/push, release, real chat or payment.

## Reported defects and correction

Both listener forms failed with `ACTION_UNSUPPORTED`. Their adapters still used
Qortium contracts and the Qortal bridge intentionally blocked unported actions.
Simply adding the actions to the allowlist would not have fixed their payloads
or response parsing.

- Chat now uses `SEND_CHAT_MESSAGE` with Qortal's `destinationAddress` and
  `message`. Hub supplies private-chat encryption and signing.
- Tips now use `SEND_COIN` with explicit `coin: "QORT"`, recipient and amount.
  Hub controls approval, fees and the sender wallet.
- Native signed CHAT/PAYMENT responses are verified against the requested
  recipient, amount or encryption, and available transaction/sender fields.
  A boolean or an `accepted` flag alone is insufficient proof.
- Signed calls are not retried. A synchronous modal reservation and service-level
  pending guard prevent double approvals, including rapid clicks while the
  account lookup is pending. Close/X are disabled during a send.
- Errors after dispatch remain uncertain and visible; the Send control stays
  blocked in that form until it is closed. Users must check Hub Chat/wallet
  history before initiating another send. No Retry action is added.
- Stale account callbacks cannot close or overwrite a different wallet's form.
- Chat size preflight accounts for Hub's JSON envelope, UTF-8/JSON escaping and
  NaCl authentication overhead against Core's 4,000-byte limit.
- Payment preflight rejects amounts that Hub's numeric conversion cannot retain.
- Admin Messages directs the owner to native Hub Chat instead of the historical
  Qortium APP link. Co-admin access does not share private owner chat/wallet keys.

Platform evidence: checked Core and stable Hub source revisions from the
[port audit](../docs/QORTAL-PORT-AUDIT.md). Exact handlers, requirements and runtime
checks are in [Qortal social actions](../docs/QORTAL-SOCIAL.md).

## Automated evidence

- Complete suite: **118 files / 958 tests passed**.
- TypeScript + production build, ESLint, Prettier and Git whitespace checks passed.
- Updated legacy Qortium social fixtures to assert native Qortal request/results.
- New production-bridge tests cover actual action dispatch, native signed replies,
  mismatched recipients/amounts, primitive/unconfirmed results, no automatic retry,
  pending deduplication, chat byte accounting and payment precision preflight.
- New modal tests cover both spinners, disabled pending close/send controls, no
  duplicate approval, uncertain payment behavior and stale-account completion.
- Existing collaborator and remaining regression tests remain green.

These are transport fixtures, not live Hub transaction evidence. The owner is
testing collaborators independently; outgoing chat and payment runtime tests are
additional acceptance checks. Qortal durable removal and remaining integration
remain future work. Foreground operation remains the agreed playback scope.

## Delivery

The runtime/source RC.6 archives are replaced together, retaining their existing
file identities. Runtime contains the application at ZIP root plus LICENSE;
source includes `SOURCE-SNAPSHOT.json` with the exact source hashes and runtime
checksum. The source snapshot supersedes the earlier collaborator-only archive.
Publish the updated runtime ZIP, not the source ZIP, and reopen the APP.
