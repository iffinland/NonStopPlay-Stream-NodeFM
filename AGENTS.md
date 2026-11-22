# NodeFM — Qortal port

Working repository: https://github.com/iffinland/NonStopPlay-Stream-NodeFM

The Qortium upstream https://github.com/iffinland/nodefm-station is read-only.
Never push to it. Preserve this target repository's Git history.

Read `docs/QORTAL-PORT-AUDIT.md` before porting. The copied Qortium
specifications describe upstream behavior; they do not override this project's
Qortal scope or the owner's current instructions. References to the owner's
local Qortium workspace are historical, not prerequisites for working here.

Preserve the deterministic timeline, scheduling, player and domain model.
Replace platform boundaries using verified Qortal contracts. Do not restore the
old target implementation as the architecture foundation.

Keep work reports in `reports/`; durable specs/operator documentation in `docs/`.
Inspect Git status and relevant build/tools before each phase. Run meaningful
affected tests and required build, lint and formatting checks.

Deliver test ZIPs for owner runtime verification. Do not commit/push conversion
iterations until explicitly authorized. Final main publication, tags, release,
deployment and QDN transactions require explicit owner authorization. The
initial import and audit were authorized separately; that does not authorize
releasing an untested conversion.
