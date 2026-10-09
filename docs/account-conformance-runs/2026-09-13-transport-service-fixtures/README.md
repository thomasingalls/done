# Shared transport service fixture evidence

Base: signed and verified `a20e678558d4de16fbef2bfbd6af0b9b83084d1d`.
This phase is uncommitted. Prospective packet ceiling: **150 kB**.

The disposable `transport-service-fixtures` selection passes **three files / ten cases** in
**89.377 seconds**, including source/dependency fingerprint work. Every selected worker group drained.
The existing Node adapter supplies ownership without changes to its finite reader or process runner.

| File | Cases | Scope |
| --- | ---: | --- |
| `account-transport/controls.test.mjs` | 2 | Exact signature-verification and final-snapshot mutations return independently verified signed ciphertext pages to unauthorized readers |
| `account-transport/generated.test.mjs` | 1 | Sixty seeded append/read/restart/replay/tamper histories preserve exact bounded prefixes and the checked table inventory |
| `account-transport/service.test.mjs` | 7 | Current admission boundaries, historical large-envelope pages/retries, signed pagination, current membership, scope/time/framing refusal and missing-witness rows |

These tests call the actual authority/core/SQLite service directly. Registration, recovery, admission,
keys and signatures are synthetic. The fixture uses real cryptographic providers and independently
constructs read requests, envelope/wrapper bytes, page signatures and acceptance proofs. No HTTP
listener or browser runs. The retained v1 service readback contract remains required; its two retired
v8 browser tests and old transport wrapper command remain excluded exactly as before. This selection
does not restore support for that retired lifecycle or qualify the separate v2/browser receive path.

## Findings and focused repair

The first new pure adapter check misclassified the already-excluded wrapper as pending. The check
was corrected to require its existing exclusion. `pure-initial.log.gz` retains that failure; the
final 92-test pure suite passes.

The first owned selection passed both mutation controls and the generated campaign, then failed the
large-page case: the page's accepted-through value was **0**, while the fixture expected **2**. The
old fixture attempted fresh submissions with 4 MiB+16 ciphertext payloads after R-01 had correctly
limited fresh admission to a **512 KiB complete envelope**. It never checked that those submissions
were accepted. This was a stale test expectation, not an observed admission failure.

The repaired historical case now:

1. Requires current fresh admission to refuse those oversized envelopes with `envelope-size`,
   without changing the checked decision/witness inventory.
2. Seeds their actual accepted decisions using the signed pre-R-01 delivery implementation at
   `4bb09042f37f68ec31f0d82587af608f599eb096`, with current dependencies and the synthetic authority's
   issuer through a test-only facade. The helper follows the existing inbound fixture construction.
3. Reopens current core/authority connections and requires exact retries to return the original
   responses. Current readback must fit one historical maximum envelope per bounded page, with exact
   original ciphertext/proof bytes and independently verified page and acceptance signatures.

The historical `account-service/delivery.ts` source enters this stage's contract as an exact
reference/revision/path/hash tuple. Existing prelaunch/reuse/postexecution checks enforce it; no new
historical path allowance or production relaxation was added.

A separate case checks three successive positions at exactly **524,288 envelope bytes**, after each
one-byte-larger attempt is refused without consuming its position. It then reopens the service and
checks pages of two, one and zero entries. Sizes come from the independent fixture's envelope framing;
the test fixes the contractual boundary rather than importing the production limit as its oracle.

The expanded historical case hit its old **40-second** test timeout. The final **90-second** allowance
matches the pre-existing equivalent historical inbound fixture, which also seeds old decisions and
checks current cold readback/retries. `repair-timeout.log.gz` preserves that failed attempt. The stage
owner's 180-second file bound and five-second drain grace are unchanged. No generated-history count
or assertion was reduced. Production sources and existing shared helpers are unchanged; this phase
changes the service test and adds `test/account-transport/historical.mjs`.

## Evidence limits

The generated campaign remains **60 histories**, seed **9112026**, 4–16 commands per history,
`endOnFailure: true`, with its existing **45-second** test timeout. Each history finishes by paging
through the retained stream. Reads/replays compare the `promotions` and `delivery_decisions` tables;
this is not an assertion about every SQLite table or filesystem byte. Replay within the valid expiry
window is intentional and still requires current membership. Connection reopen is not process death
or power-loss evidence.

The two source mutations replace uniquely matched guards in copied service modules. The tests require
a signed page with exact ciphertext/proof bytes under the mutant and refusal under current service
controls. The signature mutation uses a foreign signing key; the snapshot mutation changes the account
to pending after verification. These controls discriminate authorization checks, not just status text.

Large payloads are synthetic signed ciphertext, not decryptable Yjs/browser content. Byte-boundary
readback does not establish decryption, memory/CPU complexity, device capacity or loaded-host latency.
HTTP authentication, stream bounds, redirects, browser ownership and the v2 receive protocol require
their separate fixtures. Optional `ACCOUNT_REPORT_DIR` JSON exports are disabled; their saved-output
postconditions and other whole-wrapper obligations receive no credit here.

## Validation and preservation

All **92 pure adapter tests**, direct TypeScript, scoped lint/format, inventory/manifest, authority,
signature and whitespace checks pass. Complete release planning correctly refuses with unresolved
obligations. The unchanged **23 Node owner, five Vitest process and twelve native ownership controls**
retain previous evidence; their implementation/tests and earlier logs are pinned in
`prior-owner-evidence.json.gz` rather than rerun.

The [ledger packet](../2026-09-13-ledger-fixture-adapters/README.md) retains an initial expected-positive
historical service-path owner control classified `orphaned-child`. Its cause remains unresolved
despite later passing controls. This phase neither investigates it nor establishes a fix; preserve
it for owner/loaded-host aggregate reliability work.

All **164 prior general contracts / 1,403 identities** remain unchanged. General selections now cover
**167 files / 1,413 cases: 96 Vitest and 71 Node**. Account has 61 files / 319 cases. The 627,361-byte
manifest retains 612 obligations / **250 unresolved rows**: 91 test-file (75 Node, sixteen Playwright),
96 command and 63 campaign. All eleven catalogues remain resolved. These are integration obligations,
not 250 product defects.

`summary.json` records the final run/input identities, the initial failed run identity and artifact
hashes. The packet preserves complete initial/final stage receipts, failure/timeout/passing logs,
the exact patch including its new helper, the pre-repair adapter patch, 194 source/helper/policy pins,
the historical source pin, prior contracts and unchanged exclusions. Full raw inputs remain at the
recorded ignored output paths; both input-archive hashes are retained. Binary auxiliary outputs use
hashed base64. Subsequent docs/evidence edits do not make this an immutable aggregate.

All 21 personal/package files, 31 prior vectors and L-2 remain unchanged. Personal browser/profile,
servers, the packaged root build, historical archives, formal debts and signing backups are untouched.
Next review browser receive-transport controls, generated histories and native cases, including their
shared service/browser setup and owned lifetime.
