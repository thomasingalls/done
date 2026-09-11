# Remaining admission evidence assessment — F-21.2

2026-09-12. Baseline: signed `3b0a1ba54ead617bf1c994fffbaa1844b4a59eec`.

**F-21.2 is addressed at the current private admission coverage and size boundaries.** Importance:
**medium assurance**, rather than a demonstrated admission vulnerability. The historical review
identified useful missing tests, but its blanket absence claim no longer describes the baseline.
The earlier admission-bounds campaign already covers the v2 replacement of the LP limit, actual long
Yjs histories, signed lying offered completions, the protocol's full combined byte bound and an owner
preflight test with a lowered limit. A/D7 and later parser tests add distinct evidence. None should be
presented as new work from this phase.

The [inventory and test contract](../../account-admission-evidence.md) map those existing cases to
the remaining gaps. New native tests exercise service-issued receipt lies at the owner's lost-reply,
final-answer and cold retained-receipt call sites. Their false descriptors carry valid local signatures;
the actual HTTP service issues the corresponding receipt after a real fixture authenticator assertion.
Independent Node/OpenSSL checks authenticate the receipt/completion and derive the real descriptors
from decrypted checkpoint replay. Cold client replay rejects the lie and preserves the storage census.

The tests deliberately install a root-MACed receipted carrier to reach that cold branch. They do not
claim the correct owner stored it. Removing only the retained verifier's local-parts argument returns
the lying receipt, with signature checks still enabled. Returning to current code refuses again. The
generated cases vary text edits, disk/journal placement and delivery order within this same boundary.

For size, real retained Yjs documents encode to 16 MiB minus one, exactly 16 MiB and one byte above.
The first two seal once, cold-retry without resealing and preserve the source; the third refuses before
encryption or storage writes. Removing the early guard permits encryption, but the later candidate
parser still refuses. The control establishes why the early guard matters without claiming it is the
only safeguard against an oversized persisted checkpoint.

Combined raw SV/DS limit checks use the actual limit with explicitly injected descriptors at the
verified-genesis callback. They show that removing the admission preflight permits a requested write
and `begin` call on oversized input. They do **not** construct a 16 MiB Yjs descriptor history. Removing
the injection lets the unchanged actual source complete admission. Existing real-history and full
protocol-bound cases supply the complementary evidence.

The [preserved campaign](../../account-conformance-runs/2026-09-12-account-admission-evidence.md)
records final execution, source pins, generated seed/shrinking, effective controls and preservation
checks. No production defect was found and no runtime source, format, limit, registry or vector changed.
One focused harness failure came from reusing a setup page after closing it; cases now have separate
fixture lifetimes. Sandbox loopback refusal occurred before application tests ran and was resolved by
running disposable native tests with the required process permissions.

This disposition does not measure the personal workspace's enrollment capacity, repair a genuinely
false committed service receipt, prove all possible histories, qualify other platforms or power loss,
or complete general successor checkpoints and recovery. No real Account was created or personal
server restarted. Neutral plaintext-residue evidence, diagnostics, performance and the remaining
Account/deployment roadmap retain separate obligations.

Next is F-21.4's neutral plaintext-residue preparation: define the carrier/representation inventory,
allowed plaintext and lifecycle observation points before implementing a scanner and planted-leak
controls. A logical browser-carrier scan and a filesystem profile scan must have separate claims.
