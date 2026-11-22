# NodeFM Qortal RC.2 — auto authentication and publisher administration

Date: 2026-11-22. Version: `0.1.0-qortal-rc.2`.

## Reported RC.1 failures

The owner connected successfully and was displayed as NodeFM, but had no Admin
link. Every reopen required a manual Connect click, even with Hub's automatic
account permission saved. Runtime acceptance of RC.1 stopped at these failures.

## Root cause and correction

RC.1 initialized anonymously and only requested the Hub account after a click.
It also tied Admin to successful station-config loading and a name-list match.
That is unsuitable for a fresh station and makes content-read errors hide Admin.

RC.2 automatically calls GET_USER_ACCOUNT at startup, allowing Hub to honor its
saved automatic-auth permission. StrictMode shares a single in-flight request.
Returning to an established app revalidates the actual Hub account; a permission
dialog does not cancel authentication. Declined guests and explicit Sign out do
not enter automatic prompt loops. No local address/token is treated as proof.

Admin now depends only on the authenticated wallet matching the registered owner
of the APP publishing name through GET_NAME_DATA. This check is independent of
station data and optional account-name discovery. Other accounts, even with a
matching display name, remain guests for station administration. Owner lookup
failure remains ungranted with a retry control. Stale account/name resolutions
cannot restore old permissions. The direct admin-route guard waits for ownership.

A new station's NOT_PUBLISHED resource status is recognized without attempting a
download that may fail with generic data-unavailable errors. The publisher can
open Admin -> Station before any config exists.

## Scope boundary

This is an account/Admin bugfix within phase 1. It does not enable phase 2
publication: station configuration/media publishing, bulk imports and other
signed actions are still pending that phase. Android background playback remains
excluded. No Core/Hub edits, repository commits, pushes, tags or releases.

## Verification

- Full suite: 105 test files / 922 tests passed.
- Final actual-app component recheck: 7 publisher/guest/admin-route tests passed.
- Production TypeScript/Vite build: passed.
- ESLint and Prettier: passed.
- Git whitespace and runtime ZIP integrity: passed.
- Actual native Hub/mobile/live-QDN runtime: owner test required.

The app-shell component tests use actual App/AuthProvider/StationProvider/router
code with Qortal host response fixtures. They cover owner bootstrap, direct
/admin/station reload, guest denial, account switch, station-data failure,
optional name-list failure and ownership retry. Provider tests also cover auto
reopen, StrictMode, dialog visibility, declined access and late-response guards.

## Runtime deliverable

Filename: `NodeFM_0.1.0-qortal-rc.2_auth-admin.zip`

SHA-256: `a74aef8a5c86ab58d6dc031092b05fd06b337ed673def748d11e76e7879f722b`

Publish this ZIP as the existing Qortal APP/NodeFM using the default identifier.
The source ZIP is for development/recovery, not Qortal publication.

## Owner checks

1. Reopen APP/NodeFM with Hub automatic authentication already approved: no
   manual Connect click should be needed.
2. Owner account: Admin appears automatically; Admin -> Station opens before
   configuration exists.
3. Switch to another Hub account: no Admin menu or direct admin-route access.
4. Station config/media publication remains phase 2; no need to retry those
   unsupported signed actions as part of this RC.2 authentication check.

Working base remains main `51b145eee892bd99bd43a6640f6cbe2e2f4e36b4`.
All phase 1 and RC.2 implementation changes remain uncommitted for runtime review.
