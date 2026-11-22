# RC.8 — bounded programs and one publication approval

**Release acceptance, 2026-11-22:** the owner confirmed RC.9 runtime and all tests passed, and authorized main/tag/release publication. Earlier candidate/pending statements below describe their historical checkpoints and are superseded by the [accepted release](../reports/QORTAL-RC9-ACCEPTANCE.md).

Current RC.9 exposes these offers in a real dialog reachable from the main Schedule Program form. See [schedule UI](QORTAL-SCHEDULE-UI.md). The RC.8 transport/data changes below remain in force.

Date: 2026-11-22. Candidate: `0.1.0-qortal-rc.8`.
RC.6 is the last owner-accepted native checkpoint. RC.8 includes RC.7 integration
and the scheduler/publication changes below; native acceptance is pending.

## Program periods

New recurring programs default to **1 month**. The editor offers **1 month,
2 months, 3 months, 6 months, Custom end date**, shows the inclusive end date and
program count before publication, and supports custom periods up to 12 months.
An empty custom date cannot be submitted. Months are calendar months in the
station's timezone; recurrence wall-time conversion retains DST validation.

The chosen end is saved in the recurrence. The whole selected period is compiled,
without the old silent eight-week truncation. Legacy open-ended definitions are
bounded to one calendar month when compiled; the new save path persists that end.
There is no background extension, automatic renewal or future payment approval.
To extend a series, edit it explicitly and select the next desired end date.

The old implementation was bounded to eight weeks per save, but published the
parent, concrete events and Request Show lineups separately and split batches
into groups of ten. This produced repeated approvals; it was not an infinite
background generation loop.

The current editor prepares the recurrence, concrete programs, Request Show
lineups and any obsolete future-event removals before dispatch. They are saved
as one station update. Invalid dates, conflicts, missing Request Show data and
oversized plans stop before signing. Failed results show counts and the returned
reason instead of a screenful of event IDs. Narrow-screen date/time fields stack.

## One approval per publication action

- Upload Audio prepares duration, audio, optional cover and Track metadata first,
  then submits one complete batch.
- Submit Music prepares listener media and its proposal in one batch.
- Publish selected / Submit selected prepare all selected media and metadata,
  journal every intended step as pending, then request one batch approval.
- Program creation/editing includes its Request Show lineup in that same action.
  Series removal writes its future-event and parent markers together.
- Existing playlist/version, cover-edit, QDN-add and moderation batches remain
  combined; the shared adapter no longer splits larger actions at ten resources.
- Membership changes use one owner-signed access document containing both the
  grants and frozen station metadata, preventing a partially published two-file
  access change from pointing to a missing checkpoint.

Station logical metadata is coalesced into its writer's DOCUMENT manifest. For
example, audio + cover + station metadata normally means AUDIO, IMAGE, DOCUMENT
in one Hub request. Many schedule/lineup records can share one DOCUMENT. Hub
shows the actual physical resources and calculates their current total fee;
NodeFM does not hardcode or bypass that fee/approval.

The complete action is limited to 1,000 logical resources; station documents
retain the 16 MiB/10,000-record bounds. Exceeding a bound fails before publication
rather than silently opening another approval. Bulk staging limits are unchanged.

## Access-document compatibility

Current owner access changes are stored as DOCUMENT `nodefm-station-access-v2`,
containing `{schemaVersion: 2, registry, records}`. The nested registry retains
its version-1 grant/epoch schema; records are the owner-frozen merged view, with
sequences reset at the new epoch. The owner name remains the authority.

Readers prefer this document when present. Until the first new membership
change, existing JSON `nodefm-station-admins-v1` and hash-checked DOCUMENT
checkpoints continue to load. Publishing a new membership change carries that
accepted content into the single document. Per-writer team manifests, physical
media, station identity and existing content coordinates remain unchanged.
Update/reopen all working clients to RC.8; old clients cannot interpret the new
access authority. Revocation, name-ownership checks and epoch isolation remain.

## Partial/unknown outcomes

A native multi-resource request is one approval, not an atomic network transaction.
Some media may have been published even when another resource failed. Hub's
partial response can omit successful signatures. Such results remain uncertain;
NodeFM does not invent success or automatically resend. The actual physical
failure reason is retained where supplied, without treating a partially failed
station batch as a safe rejection of every resource.

Bulk journals retain independent confirmed/unknown steps. Track metadata alone
does not add a Track to the local library unless its required media is confirmed.
An unknown prior step prevents resubmission until read-only verification resolves
it. A refused preflight is separate from an uncertain broadcast. Keep source files
and use Check pending publications where available.

Programs from the earlier partially completed action are not automatically
removed or republished. Refresh the saved schedule first. Reuse/edit the existing
series when present; inspect any uncertain prior transaction before starting
another publication. No live transaction or automatic cleanup is performed by
the test suite.

## Native acceptance

1. Reopen RC.8 on desktop and Android. Create a daily Request Show, first inspect
   the default one-month count/end, then select two months. One native approval
   must cover the full action; after reopening, every program and lineup remains.
2. Upload a small song with cover. One Hub dialog must list audio, image and
   station data with its combined fee. Confirm the track, cover and playback.
3. Publish/submit several selected songs: one approval; refresh/reopen and verify
   the library/moderation entries. Declining must not show success or trigger a
   second request. Resolve any uncertain previous work before repeating.
4. Edit/remove a test recurring series and change a test collaborator grant.
   Each action has one approval and survives reopening. Verify old RC.6 access
   data remains readable before migration, and removed editors lose access.

Finish the outstanding RC.7 removal/reference checks as well. Commit/push/tag
and official release follow owner runtime acceptance and the release instruction.
