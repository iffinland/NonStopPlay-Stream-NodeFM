# Qortal station collaborators

**Release acceptance, 2026-11-22:** the owner confirmed RC.9 runtime and all tests passed, and authorized main/tag/release publication. Earlier candidate/pending statements below describe their historical checkpoints and are superseded by the [accepted release](../reports/QORTAL-RC9-ACCEPTANCE.md).

RC.6 native Hub owner/collaborator runtime acceptance was confirmed by the owner
on 2026-11-22. RC.7 extends the same station manifests with durable removals,
complete legacy discovery and long-record support; see
[phases 3–4](QORTAL-PHASE3-4.md).

## Using the feature

The registered owner of the deployed APP name opens **Admin → Manage admins**.
Enter a registered Qortal name or wallet address, choose **Look up account**,
check the resolved name/address, then **Add administrator**. An address must
own a registered name; the first verified name is used when looking up an address.
Up to 25 additional administrators are supported. Choose **Remove [name]** to
revoke access. The owner is implicit and cannot be removed from this list.

RC.8 asks for one owner approval covering membership and frozen station data.
After QDN propagation, the collaborator reopens the current APP and connects
their own account. Their Admin navigation includes all existing station sections
except Manage admins. The page itself and publication boundary also enforce the
owner-only membership rule. Names are verified against wallet addresses; a
matching display name does not grant access.

Collaborators manage the same library, listener submissions, playlists, playlist
submissions, schedule, notices and station settings as the owner. RC.7 adds durable removal to the shared station view.
Every collaborator signs using their own account, publishes under their verified
registered name, and pays their own fees. No owner key or wallet is shared.

Do not repeat an unknown publication. Read/reopen the network result before
starting another access change. The access form disables further changes after
an uncertain result and contains no signed Retry button.

## Publication and reconstruction

Qortal Core permits a transaction creator to publish only under a name they own.
A menu permission alone cannot let a collaborator overwrite the station owner's
JSON resources. The adapter therefore keeps logical station coordinates stable
while publishing real resources under the connected writer's name.

| Resource                                       | Physical publisher     | Purpose                                                                      |
| ---------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------- |
| DOCUMENT `nodefm-station-access-v2`            | APP owner              | Grants, membership epoch and frozen accepted metadata in one signed resource |
| DOCUMENT `nodefm-team-<SHA256(station)[0:32]>` | Each authorized writer | Station metadata/removals and media references for the current epoch         |
| AUDIO / IMAGE                                  | Actual writer          | Audio and cover bytes with their original identifiers                        |

RC.8 reads the existing JSON v1 registry and hash-checked checkpoints until the
first new membership change. That action moves the accepted view and grants
into a single owner-controlled access document. See the
[access format and migration](QORTAL-BATCH-PUBLISHING.md#access-document-compatibility).
The bridge merges this frozen view with current authorized writer manifests.
Domain owner identity and physical signing identity remain distinct.

Records use per-resource logical sequence numbers. New writes advance the
observed sequence; removal wins an equal-sequence edit; other equal sequences use a deterministic wallet-address tie break.
Client clock values are display metadata and do not order conflicting writes.
The next edit after observing both concurrent versions can replace the winner.
Different writers have separate manifests. Use one active editing tab per wallet
to avoid racing two copies of that wallet's mutable manifest.

Each write verifies the live account, current membership and registered name
owner. Signed success is returned only when every real resource, including the
manifest, has a matching signed transaction result. Partial/unknown batches do
not trigger automatic write retries. Confirmed local manifests are retained in
memory until the epoch changes, so an immediate metadata step does not lose a
media reference while Core indexes the preceding transaction.

On membership change, the owner freezes currently verifiable merged metadata
into the same signed access document that advances the registry epoch. Old manifests, including
late writes in a Hub approval dialog, cannot change the new epoch. Removed
accounts cannot publish new station changes. Existing legacy owner resources
remain readable and are overridden by accepted manifest/checkpoint records.

Malformed collaborator manifests are ignored, allowing the owner to remove that
member. Unavailable network reads fail explicitly instead of silently creating
an incomplete checkpoint. A name transferred to another wallet does not transfer
the grant; its manifest is no longer included.

## Operational limits

QDN propagation is eventual. Reopen the APP after grants/revocations and update
all working tabs to RC.8; older clients do not understand the current access document.
Permission checks refresh on window focus and before every signed station write.
A temporary read error preserves an already-open editor; the write check still
fails closed. A confirmed revocation removes Admin access.

A checkpoint preserves metadata and media references, not copies of AUDIO/IMAGE
bytes. Media still belongs to the publishing name, as with listener submissions.
The original publisher can affect its availability. Revocation prevents further
station metadata changes but does not give the owner control of another name's
media. Retain source files if later republishing is necessary.

Legacy external checkpoints retain their hash checks. Current frozen records
and grants share one owner-controlled DOCUMENT resource. Registry rollback protection is in-memory for the current app session;
clients still depend on their node to supply the current QDN registry.

Manifests/checkpoints use DOCUMENT, avoiding JSON's 25 KiB per-resource limit.
Personal/listener JSON and legacy registry resources retain that limit; the
current access document uses DOCUMENT with the same 16 MiB bound.
RC.7 allows larger logical station records through DOCUMENT, bounded to 16 MiB
per manifest/checkpoint and 10,000 records per writer manifest. This version does not introduce a separate
binary archival service or automatic recovery publication.

## Runtime acceptance

1. Publish the runtime ZIP as the existing default-identifier APP and reopen it.
2. As owner, add a named second account. Check that Hub signs the complete access change
   once from the owner wallet and that the resolved address is correct.
3. As the second account, reopen/connect. Confirm Admin appears, Manage admins is
   absent, and a direct `/admin/admins` route returns to the dashboard.
4. Publish a local track and a small bulk batch; accept/reject listener tracks
   and a playlist submission; publish a playlist version, schedule, notice and
   station change. Confirm Hub uses the second name/wallet for every publication.
5. Reopen as owner and as a guest. Confirm shared content, playlist and foreground
   playback use the same station. Check in-app preview and account/file-picker
   return behavior still work.
6. As owner, remove the second account and wait for propagation. Reopen both
   accounts. Previously accepted metadata remains; the removed account cannot
   manage membership or publish another station change. An unrelated guest never
   receives Admin access.

## Verified platform references

The checked source revisions are recorded in the [port audit](QORTAL-PORT-AUDIT.md).
Core `src/main/java/org/qortal/transaction/ArbitraryTransaction.java` validates
that the creator owns the publication name. `Service.java` defines DOCUMENT and
JSON limits. Stable Hub v3.0.3's `src/qortal/get.ts` publication handlers sign
from the connected account. Hub renders apps through node `/render/...` URLs,
which may be HTTP; SHA-256 uses the pinned `@noble/hashes` implementation rather
than requiring secure-context SubtleCrypto. No Core or Hub modifications are
needed for this feature.
