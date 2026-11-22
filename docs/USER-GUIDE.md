# NodeFM for Qortal — quick user and station guide

## Listen

Open `qortal://APP/NodeFM/` in Qortal Hub. Press Play to join the station's
current broadcast position. The station follows its published UTC schedule;
opening another device does not restart the broadcast. Keep Hub/the app open
for supported foreground playback.

Open **Playlists** to choose a public station or listener playlist. Playlist
controls operate on your personal listening queue. **Return to Live** joins the
station's current track and offset. Sharing copies a `qortal://` APP/playlist
link; listener links include the playlist publisher.

**My playlists** uses your connected account and registered Qortal name. Your
public playlists can appear in public browsing; private playlists stay out of
that list. Submit music through **Submit Music**; the station team reviews it
before adding it to the station library. Audio Preview plays inside the app.

If enabled by the station, **Message the Station Owner** sends encrypted native
Hub Chat. The owner reads/replies in Hub's Chat panel. **Tip the Station Owner**
opens Hub's QORT approval. Review the recipient, amount and fee there. These
features always target the station owner, including when a collaborator is on
duty. Hub applies its normal balance/public-key requirements.

## Manage a station

The registered owner of the deployed APP name receives owner access. Open
**Admin** to manage the library, playlists/versions, station settings, notices,
submissions, schedules and Request Show definitions.

A typical station setup is:

1. Add audio from local files or an existing QDN resource; verify track duration.
2. Create a playlist, add tracks and publish a version.
3. Select the default rotation/version in station settings, choose the station
   timezone/epoch and save.
4. Schedule playlist programs or recurring daily/weekly shows. Request Shows
   generate a published lineup from likes with deterministic library fallback.

Local files stay in the browser until your Publish/Submit action. Bulk work lets
you edit metadata before **Publish selected** or **Submit selected**. Hub approves
the complete action in one batch, including media and metadata. The displayed station owner and the
account paying/publishing are separate when collaborators work on the station.

## Recurring programs

In **Schedule Program**, choose **Repeat → Daily / Weekly**, enter Start date
and optionally End date, then save. The **Choose program period** dialog offers
1 month by default, 2/3/6 months or a custom end up to 12 months. Review the count
and dates, then **Continue to Hub approval** for the one complete batch.
Back returns without publishing. **Once** uses both dates for one program.

The separate recurring-program editor has the same date controls and review.
There is no automatic renewal/payment; extend a series explicitly. See the
[schedule UI guide](QORTAL-SCHEDULE-UI.md) and
[batch publishing](QORTAL-BATCH-PUBLISHING.md).

## Collaborators / DJs

Only the APP owner can open **Admin → Manage admins** to add or remove named
accounts. Enter a Qortal name (or a wallet that owns a registered name), review
the resolved name/address, then save. A collaborator manages the full station
except adding/removing administrators. Each writer publishes under their own
registered name and pays from their own wallet.

Removing an administrator retains their accepted station content and prevents
future station updates from that grant. It does not transfer their wallet or
private messages. Reopen the current app on every working device after updates.
See [collaborator details](QORTAL-COLLABORATORS.md).

## Remove content

Library tracks, notices, schedule entries/recurrences and unused historical
playlist versions have removal actions. Hub approves a durable station update.
After propagation, removal applies on other current clients and survives
reopening. Audio and cover files remain on QDN. A version still used by the
station or a schedule is protected; change those references first. Removing a
recurrence removes its future concrete events before removing the series intent.

If the operation partially completes, reopen/refresh to inspect the surviving
records before taking another action. Never assume a timeout means no
transaction was broadcast. An unavailable reference check blocks version deletion
until a read-only refresh succeeds.

## Common questions

**Does NodeFM need an Icecast/Liquidsoap server?** No. The browser derives the
current program from published metadata and plays QDN audio.

**Why does the phone stop after Hub is suspended?** This port supports
foreground playback; screen-lock/background execution is outside its scope.

**Why is a larger station playlist published as DOCUMENT?** Station metadata is
stored in bounded documents so longer records do not exceed the 25 KiB physical
JSON limit. Playlist references continue to work through NodeFM.

**Why did a new item not appear on another device immediately?** QDN indexing,
download and building take time. Refresh after propagation; an already signed
transaction should not be sent again just because indexing is slow.

**What should I do with an unknown publication result?** Keep the source/journal,
use **Check pending publications** where available and check exact saved resources.
Continue only missing work after resolving the previous outcome.

For deployment and release packaging, see the [release runbook](RELEASE.md).
For the combined RC.7 test, see [phases 3–4](QORTAL-PHASE3-4.md#combined-native-acceptance).
