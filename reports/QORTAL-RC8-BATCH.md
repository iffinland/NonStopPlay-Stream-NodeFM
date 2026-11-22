# RC.8 — bounded schedules and one publication approval

Historical candidate report. The owner accepted the accumulated RC.9 runtime on 2026-11-22 and authorized release; see [RC.9 acceptance](QORTAL-RC9-ACCEPTANCE.md).

Date: 2026-11-22. Candidate: `0.1.0-qortal-rc.8`.
Base main: `5167d1f59aada86d48c01b7c3f929b71b46b3acb`.
Includes the uncommitted RC.6/RC.7 source. Owner-native RC.6 acceptance remains
valid; RC.7/RC.8 combined native acceptance is pending. No commit/push/release,
APP deployment or live signed transaction is performed in this iteration.

## User-visible result

- Recurring programs have an explicit finite period: 1 month by default,
  2/3/6 months or a custom end up to 12 months. The editor previews the full
  program count and end date. A missing custom date cannot be submitted.
- The whole selected period is compiled and published together. There is no
  silent eight-week truncation, automatic extension or future payment loop.
- A program action prepares its recurrence, events, Request Show lineups and
  obsolete future-event removals before the only Hub approval. A single dynamic
  event also includes its lineup in that same request. Series removal is one
  manifest update in the production station adapter.
- Local song upload batches audio, selected cover and canonical metadata.
  Listener single submissions and entire bulk selections also use one request.
  The common publisher no longer splits a larger action at ten resources.
- Existing cover edits, QDN add, playlist/version and moderation batches retain
  their combined approval. Membership changes publish one access document with
  both grants and frozen content, instead of two dependent approvals.
- Scheduler errors retain counts and actual returned reasons rather than listing
  dozens of failed event IDs. Mobile schedule fields stack below 600px.

## Why approvals repeated

The previous recurrence compiler was bounded to eight weeks per save. The app
published recurrence intent, event chunks and lineup chunks independently, with
an application batch size of ten. It was a sequence of approval requests, not an
infinite background generation task.

The supplied screenshot did not expose the underlying failed publication reason.
The new path avoids repeated manifest updates for those chunks and retains the
native physical-resource reason on partial failure. Transport fixtures verify
that this reason remains an unknown outcome, not a claim that every resource
was safely rejected. Real-node acceptance is still required.

## Data and recovery

One approval is not network atomicity. Hub may broadcast some resources and omit
their successful signatures in a partial response. Unknown results remain
unknown and are not automatically retried. All bulk intents are journaled before
dispatch; a storage failure prevents publication. A metadata signature alone does
not insert a Track into the local library when its media is unconfirmed.

The shared publisher rejects more than 1,000 logical resources before approval;
station documents keep their 16 MiB and per-writer 10,000-record bounds. Bulk
staging limits are unchanged. Hub calculates the actual combined fee from the
physical resource list, including the station manifest; NodeFM hardcodes no fee.

RC.8 reads existing JSON v1 administrator registries and hash-checked checkpoints.
The next explicit membership change freezes that accepted view with its grants
in owner DOCUMENT `nodefm-station-access-v2`. Its nested registry retains the
schema/epoch/grant model. No automatic migration transaction is sent. Update all
working clients to RC.8; older clients do not read the new access document.

Earlier partially published programs are retained. Refresh/read the existing
series before editing or starting another publication. Nothing is automatically
deleted or republished to compensate for a failed prior attempt.

## Verification

| Check                              | Result                       |
| ---------------------------------- | ---------------------------- |
| Complete Vitest suite              | 119 files / 989 tests passed |
| TypeScript + production Vite build | Passed                       |
| ESLint                             | Passed                       |
| Prettier                           | Passed                       |
| Git whitespace check               | Passed                       |
| Production JS                      | 961.16 kB; gzip 273.66 kB    |
| Production CSS                     | 65.54 kB; gzip 10.94 kB      |

Added production-boundary tests cover:

- two months/61 daily Request Shows and lineups reconstructed after reopening
  from one physical DOCUMENT batch;
- saved finite end dates for missing-end input and one-approval series removal;
- audio/cover/Track round-trip from one native batch of three physical resources;
- single Request Show event + lineup publication;
- one-resource membership changes and RC.6 registry/checkpoint migration without
  losing accepted metadata;
- physical publication reasons preserved without duplicate requests;
- one-month UI default, two-month count/end preview, required custom end,
  pending duplicate-click prevention;
- > 10 resources dispatched together, >1,000 rejected before permission/signing,
  > and account changes blocked before the only dispatch;
- explicit multi-month compilation, bounded open-ended input and >12-month
  rejection;
- metadata-only partial bulk success never adding an unconfirmed-media Track.

Existing fixture expectations were updated to require one complete batch rather
than separate media/metadata/chunk approvals. The full suite retains native
contract simulations, role/revocation, durable removal, UTC/DST, timeline,
listener publication/moderation and social-action coverage.

These are controlled transport/DOM tests and local production builds, not real
Hub/mobile playback, payment or network-transaction evidence. Native acceptance
uses the [focused checklist](../docs/QORTAL-BATCH-PUBLISHING.md#native-acceptance)
and the remaining RC.7 removal checks. Foreground playback remains the scope.

## Delivery

Runtime: `NodeFM_0.1.0-qortal-rc.8_batch-publishing.zip`.
Source: `NodeFM_0.1.0-qortal-rc.8_source.zip`.
The runtime has index.html and LICENSE at root. Source includes current docs,
this report and SOURCE-SNAPSHOT.json with base revision, per-file hashes and the
exact runtime checksum. Publish only the runtime archive for owner testing.
Qortium upstream and remote main are unchanged.
