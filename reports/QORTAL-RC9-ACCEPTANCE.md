# RC.9 acceptance and release checkpoint

Date: 2026-11-22. Version: `0.1.0-qortal-rc.9`.

The owner confirmed: RC.9 runtime test passed; all tests passed, and explicitly
instructed committing/pushing all work to GitHub main, updating documentation and
creating the official release of this state. This closes the accumulated native
acceptance gate for the Qortal port through RC.9. No new feature work is included
in release finalization.

## Accepted source and runtime

All application/configuration files match the delivered RC.9 source snapshot.
Only release documentation and publishing infrastructure are added afterwards.
The accepted runtime archive is retained byte-for-byte as the release input:

- Original: `NodeFM_0.1.0-qortal-rc.9_schedule-ui.zip`.
- Release filename: `NodeFM_0.1.0-qortal-rc.9.zip`.
- Size: 297,251 bytes.
- SHA-256: `986af493a63b170d009908efcaf7456c4fd3f7b90765b622895cd5b398259d22`.

The release job verifies this checksum and rebuilds the committed source,
comparing every built application file plus LICENSE to the accepted archive.
The source ZIP includes the exact release commit and per-file hashes in
SOURCE-SNAPSHOT.json; its docs supersede the older candidate source ZIP docs.

## Validation and scope

RC.9 automatic verification passed: 119 test files / 993 tests, production
TypeScript/Vite build, ESLint, Prettier and Git whitespace checks. Owner native
runtime acceptance supplements these controlled transport/DOM fixtures.

Accepted scope includes collaborator permissions, native Chat/tips, durable
removal, public/listener playlists and moderation, recurring programs/Request
Shows, one-approval publication, date/period UI and phone schedule title layout.
Foreground Hub operation remains the scope; Android background playback is excluded.
No real QDN transaction, Chat or payment is sent by release tooling.

## Publication mechanism

The owner-authorized main update includes one explicit release descriptor and
the accepted runtime handoff. GitHub Actions runs only when such a descriptor is
changed on main, verifies/tests the commit, creates the tag, uploads runtime,
release-source ZIP and SHA256SUMS to a draft, verifies all assets, then publishes.
Ordinary source/doc pushes do not create releases. Existing releases are not
automatically overwritten. The release source and tag identify the exact main
commit that contains the runtime-accepted application and finalized docs.

This report records the acceptance and release preparation. The GitHub release
and Actions run are the authoritative publication result; do not infer a successful
remote publication from a local test or prepared descriptor alone.
