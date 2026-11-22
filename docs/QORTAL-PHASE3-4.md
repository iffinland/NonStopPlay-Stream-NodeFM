# Qortal port phases 3–4 — integration candidate RC.7

**Release acceptance, 2026-11-22:** the owner confirmed RC.9 runtime and all tests passed, and authorized main/tag/release publication. Earlier candidate/pending statements below describe their historical checkpoints and are superseded by the [accepted release](../reports/QORTAL-RC9-ACCEPTANCE.md).

Current candidate: RC.8 adds [bounded periods and one-approval publication](QORTAL-BATCH-PUBLISHING.md), including single-document access changes. Native acceptance is pending.

Date: 2026-11-22. Candidate: `0.1.0-qortal-rc.7`.
The owner confirmed RC.6 native runtime acceptance, including station
collaborators, encrypted Chat messages and QORT tips. RC.7 completes the remaining
application changes and prepares the combined desktop/mobile acceptance gate.
No real transaction, deployment, commit/push, tag or release is performed by tests.

## Durable station removal

Qortal has no network `DELETE_QDN_RESOURCE` operation. NodeFM translates its
internal removal request into an ordinary signed DOCUMENT publication under the
current manager's registered name. It does not call `DELETE_HOSTED_DATA` or
pretend to delete bytes from other nodes.

The station's resource manifest keeps a removal marker with the same logical
service/identifier and a new sequence. All station discovery, exact data reads,
status reads and media URL resolution use this view. A marker hides a legacy
owner resource as well as collaborator-published metadata. Direct reads of a
removed record return confirmed `NOT_FOUND`; status reads return `NOT_PUBLISHED`.
Search/list results exclude the removed resource, rather than presenting a
malformed record to the domain stores.

This works before any collaborators are configured (epoch zero), with an active
team and after membership changes. Owner checkpoints retain removal markers.
Revoked members cannot alter the new epoch. A removal wins a concurrent edit at
the same sequence; an explicit later publication can replace the marker with a
higher sequence. There is no automatic restore or cleanup transaction.

Existing track, notice, one-off schedule event, recurrence and historical
playlist-version actions use this boundary. Recurrence deletion retains its
child-first recovery rules: a failed child cleanup keeps the parent discoverable.
Removing track metadata keeps AUDIO/IMAGE bytes intact. Playlist versions still
in use by a playlist, station rotation or schedule cannot be removed.
Unavailable or malformed reference reads prevent version deletion; only
confirmed absence can be skipped.

Success requires a matching signed manifest transaction. An unknown/partial
result does not remove the local record and is never automatically retried.
A successful transaction still needs ordinary QDN propagation before another
node can reconstruct it. Use current RC.7 clients on every device; older app
copies do not implement these removal rules. Existing station content is retained.

## Large records and complete station discovery

Station metadata uses the same DOCUMENT manifest before and after team setup.
Large logical JSON records therefore do not create oversized physical JSON
transactions. They retain their domain coordinates, references and validation.
Personal/listener resources still use their declared physical service and retain
the Qortal JSON limit of 25 KiB. The access registry also remains bounded JSON.

A station manifest/checkpoint is limited to 16 MiB and each manifest to 10,000
records. A complete write is prepared before any media or metadata transaction;
these limits fail before dispatch. These are explicit application bounds, not
Core DOCUMENT limits. Old metadata does not need a bulk migration.

Station searches use exact publisher matching and fetch legacy QDN resources in
200-item pages before merging team records and removals. A repeated full page,
invalid response or more than 10,000 legacy matches fails explicitly; it cannot
silently authorize deletion using a truncated result. Personal/global discovery
retains its existing per-query limits. Search is a live index, not a snapshot;
concurrent node indexing may require refresh after propagation.

## Remaining feature integration

Production-boundary tests cover owner/editor publication and listener
reconstruction, removal/revocation, recurring show cleanup, referenced-version
protection, Request Show lineup reuse after reopening, public/private listener
playlists under their own names, Qortal playlist links, long station records and
pre-approval size rejection. Existing tests cover deterministic UTC/DST timelines,
likes/ranking, account/store isolation, partial publication and social actions.

User-facing identity/validation text now names Qortal. Historical `qortium/`
module names and imported specifications remain source provenance, not a promise
of Qortium native background support. Foreground Hub operation is the scope.

## Combined native acceptance

Publish the runtime ZIP as the existing default-identifier APP, reopen it on
all devices, then run these checks on desktop and Android with Hub open:

1. As owner, remove an expendable track and notice; reopen and confirm they stay
   absent. Check the same station as a listener in another device/session.
2. As a named collaborator, repeat a removal. Confirm Hub shows that writer's
   name/account. Remove that administrator as owner; confirm the removed content
   stays absent and the revoked account loses station write access.
3. Create a short daily/weekly recurrence, inspect its concrete occurrences,
   then remove the series. Reopen and confirm future events remain removed.
4. Publish two versions of a test playlist. Verify the current/default/scheduled
   version is protected. Remove an unused old version; the latest playlist and
   playback must survive reopening.
5. Schedule a Request Show, inspect/play its generated lineup, then reopen on
   another device and confirm the same lineup. Test Return to Live and a normal
   scheduled-program transition.
6. Publish a listener playlist, open its shared link, and verify the public list
   and personal account ownership. Check a private playlist is excluded from
   public browsing. Switch between owner, editor and listener accounts.
7. For a longer playlist, confirm Hub publishes station metadata as DOCUMENT.
   Exercise a rejected approval: no success, repeated send or disappearing local
   data. Existing messages/tips must keep their RC.6 behavior.

Do not send a payment/chat solely to satisfy automated verification. Owner-run
native tests determine delivery and real fee ownership. Android screen-lock or
background playback is outside this acceptance gate.

After RC.7 acceptance, complete the final main update, version tag and official
GitHub Release with matching runtime/source ZIPs under the owner's release
instruction. The runtime candidate itself is not an official release.
