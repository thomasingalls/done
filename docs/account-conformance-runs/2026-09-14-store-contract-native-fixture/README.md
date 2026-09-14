# Account store-contract native fixture — 2026-09-14

Counter-contract is signed and verified as `9a5bf1d`. The store-contract selection adds one complete
native file / three cases, passing in 33.535 seconds including fingerprinting.
Node execution takes 5.683 of the existing 300-second file bound;
stage time is 8.298. Cases retain forty seconds. Worker and browser
groups drain, and the recorded browser PID is absent afterward.

Independent Node HKDF/AES and noble XChaCha checks verify all seeded record/journal bytes, KDF info,
identity encoding and key properties. Page navigation followed by explicit synthetic custody
reconfiguration recovers the data; a fresh writer adds a third journal entry, and flush preserves
all seven fixed frames while emptying the journal. Five record alterations and three journal-key
alterations refuse. The latter case reopens sessions within the same page; it is not a browser restart.
One checked source control removes storeId from the real custody KDF. Its local roundtrip succeeds,
but the independent byte oracle detects incompatible ciphertext.

Fixture setup now borrows owned CDP and creates an isolated context, with early nested cleanup and
listen-error rejection. This lifecycle block is byte-identical to the signed counter fixture; its nine
modeled cleanup and eight real browser-owner controls retain pinned prior evidence, without rerunning.
The previous store fixture already registered server cleanup before launch; no prior setup leak is
claimed here. All three test bodies, product, runtime/crypto helpers, owner, interpreter and wrapper
remain unchanged. Synthetic custody is directly initialized; no Account admission service, generated
histories, crash cuts, physical power-loss checks or historical readers run. Optional wrapper reports
are not emitted. Full vector/format/wrapper and immutable aggregate qualification remain separate.

All 93 pure runner checks, TypeScript, scoped style, inventory, manifest, authority and signatures pass.
All 200 prior general contracts / 1,670 identities and exclusions are unchanged. General selections
now contain 201 files / 1,673 cases (96 Vitest, 105 Node); Account has 95 files / 579 cases.
The 682,490-byte manifest has 612 obligations / 216 unresolved: 57 test files
(41 Node, sixteen Playwright), 96 commands and 63 campaigns. All eleven catalogues remain resolved
(163 cases / 54 mutations). These are integration obligations, not defect counts.

The [packet](./summary.json) retains receipts, exact patch, frozen source/browser identities, control/helper
pins, prior owner evidence, base signature and preservation checks. All 52 personal/vector pins and
L-2 remain unchanged. Existing ledger orphan classification, receive/delivery-oracle headroom, capture
oracle follow-ups and earlier deadline evidence remain open. Next: local custody/provenance fixtures,
then the remaining Account suites in bounded signed groups under the current authorization. Stop if
signing blocks; do not commit unsigned. R-04, P-06 and the immutable aggregate precede private Account
preparation; this selection does not qualify that aggregate.

[summary.json](./summary.json) gives exact scope, timing and counts. The compressed artifact index pins
receipts, source patch, frozen sources/browser, prior owner controls and the signed base. Native raw
inputs remain at `test-results/release-validation/2026-09-14T11-01-16.401Z`; archive hashes are retained. Evidence describes the working
source snapshot at capture; the signed containing commit is available through repository history.
