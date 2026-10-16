# Functional repair series — ready for review and later signing

Implemented in cumulative local source and exported as ordered unsigned patches against signed
`a6fa2298cf3233893e3cbb9809190da6a8dc72bc`. No commits, push, merge, deployment or preview update.
The distribution and signing instructions are in `patches/2026-10-15-functional-repairs/README.md`.

All known requested functional failure families have bounded repair evidence: complete source
closures; semantic mutation controls; current entry fixtures; realm/size/schema/stage expectations;
sticky quarantine modeling; lifecycle observation/runner ownership; and resource/metadata gates.
The [current functional ledger](24-final-handoff/receipts/functional-ledger.json.gz) supersedes only
current functional statuses. Original dated triage and all failed attempts remain.

Full unit runs pass all 151 files, with 1,779 passes and the same existing named skip on both pinned
Node 24.18.0 and local Node 26.11.1. Complete case identities/statuses agree. The final 175-case
adapter/registry population passes. Build, vectors, security contracts, traceability, inventory and
active lint pass. Pinned-Node final checks also pass seven source/MAC cases, seventeen native
compatibility cases, two compiler cases, twenty-three packaged onboarding cases and five
service/listener cases. Full nineteen-case development setup runs, genuine historical checkpoint
and upgrade producers, complete genesis controls and the eight active upgrade cases have their
own phase packets and limitations.

The only functional runtime repair in this series prevents first-Local discovery from writing hints
before a refused encrypted-document opening; protected Account bootstrap is preserved. Later
source-only lint cleanup removes an unused service import and adds one explanatory protocol comment;
the recovery algorithm is independently byte-compared. No cryptographic format, key custody rule,
authority predicate or release block is relaxed. Compound controls are explicitly distinguished
from single-guard omissions, and all old test files/case deadlines remain.

Qualification is **paused**, with 855 obligations / 314 unresolved. The operator-resumed quality job
is unchanged, and new regression files remain required without aggregate credit. The deferred
formatting-only proposal is retained and the global formatting gate is not claimed green. Local
dependency-layout warnings and original failures remain. No fresh hosted-Linux CI/dependency install,
new real-provider walkthrough or complete repeat of all 85 original command entries is claimed.

[Final evidence and boundaries](24-final-handoff/README.md) ·
[Detailed outcomes](../../completed.md) · [Append-only decisions](../../decisions.md).
