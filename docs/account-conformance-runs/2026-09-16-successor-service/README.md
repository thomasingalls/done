# Atomic successor admission and service delivery — chunk B

2026-09-16, after signed pure protocol `08d5a6e5`. Disposable service databases, synthetic encrypted
envelopes and private HTTP enrollment regression only. No browser authority installation, Yjs
convergence, personal device or successor HTTP route is claimed. Release validation remains paused.

| Check | Result |
| --- | --- |
| Complete focused Node run below | 198 passed, about 48 seconds |
| `node node_modules/vitest/vitest.mjs run test/diagnostics.test.ts` | 2 passed |
| `tsc -b --noEmit` | passed |
| Scoped oxlint/oxfmt and crypto inventory | passed; 174 sources, 96 labels/templates, 24 groups, 13 manual entrypoints |

```
node --test --test-timeout=90000 test/account-successor/*.test.mjs test/account-enrollment/*.test.mjs test/account-core/core.test.mjs test/account-recovery/core.test.mjs test/account-admission/core.test.mjs test/account-activation/core.test.mjs test/account-activation/controls.test.mjs test/account-activation/restart.test.mjs test/account-service-delivery/core.test.mjs test/account-service-delivery/generated.test.mjs test/account-service-delivery/controls.test.mjs test/account-service-delivery/restart.test.mjs test/account-service-inbound/core.test.mjs test/account-service-inbound/generated.test.mjs test/account-service-inbound/controls.test.mjs test/account-service-inbound/restart.test.mjs test/account-first-authority/registry.test.mjs
```

The 198 consist of 39 successor cases (10 protocol plus 29 service), 39 enrollment, 108 affected
core/recovery/admission/activation/delivery/inbound regressions and 12 construction-registry checks.
The full run includes the historical large-envelope compatibility tests with their existing 90-second
test bound. These are focused regressions, not renewed execution of the release wrapper campaign.

New service evidence includes exact historical and pending envelope preservation, old refusal
successors, post-transition stale-client writes, current-head reads and candidate denial; changed
targets and immutable retries; cancellation/expiry/custody loss before commit, including their late
boundaries; sibling serialization; malformed/missing authority or ledger refusal; and explicit schema-6
upgrade retaining prepared eligibility. Older upgrade fixtures now remove the new schema-7 objects
when constructing their actual old schema. Prior row-preservation assertions remain.

Four real SIGKILL cases cover before/after commit with empty and nonempty ledgers. Three paused-process
races commit a delivery, cancellation or competing admission from another process before the paused
owner resumes. Sixty shrinking histories (seed 16091602) compare exact pending bytes, accepted prefixes,
restart and eligibility against an independent ledger. Process death is not whole-machine power loss.

Two copied-production controls remove the final delivery-snapshot or preparation-row comparison.
Each baseline handles the concurrent change correctly. Each mutant returns an independently verified
root-signed forbidden admission: either a head vector omitting the newly accepted position, breaking
subsequent census, or an admission consuming a cancelled preparation. Timeouts and unrelated failures
do not count as detection. The current and boundary witnesses also cover refused history, which a
position-only vector would omit.

All preserved run logs pass. The final run includes late pre-commit custody/expiry checks added after
the initial directed cases. `inputs.json` pins the exercised implementation/fixtures. The unchanged
pure successor vectors remain under chunk A's evidence. Preparation and successor qualification groups
remain open; native client adoption and private successor HTTP integration are the next two chunks.
