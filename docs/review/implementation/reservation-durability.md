# F-15 current disposition

2026-09-11, base `ec889d9`, bounded repair pending commit. **Fixed under the explicit strict-persistence
contract** for the current private first-epoch protocol. Importance: medium correctness, not merely prose.
This supersedes F-15's status in the historical packet; that packet remains unchanged.

Default/relaxed grant completion allowed a lost reservation to undercount actual AES invocations. Random
nonces did not establish the advertised per-key lifetime bound. Custody writes and content allocation plus
final ledger commits now require requested/reported strict durability. Promotion's existing strict writes
now enforce that report. Unsupported capability refuses before the body and drains native settlement.
Network AES requires the retained attempt event, not merely its local sequence reservation.

[Contract, inventory and failure model](../../account-reservation-durability.md).
[Before/after execution, generated controls, review and limits](../../account-conformance-runs/2026-09-11-account-reservation-durability.md).
The 50-stage campaign passes. The original undercount does not reproduce when strict completion is honored;
normal owner workflows pass their regressions. This does not measure physical power-cut survival, repair
past counts, or permit raw restored/branched writable profiles. SC-01 remains page/navigation-loss scope.
F-05/F-06 closure is unchanged. Independent review, platform qualification and other accepted findings
remain separate.
