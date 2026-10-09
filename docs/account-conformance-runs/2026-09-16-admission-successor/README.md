# Admission-only successor — chunk A, 2026-09-16

Implemented after signed definition `be541c3e`. Pure protocol evidence only: no service consumption,
delivery transition, client installation, personal-device action or release campaign.

The focused run passes **32 tests**: 10 new successor cases, four enrollment protocol cases, six
first-authority format cases and 12 construction-registry checks. The new cases include every successor
leaf, independently signed policy violations, parser bounds, discovery authentication/expiry/nonce,
fork/ancestor rejection and capture before crypto. One hundred shrinking generated cases (seed
16091601) vary stream anchors and recursive object ordering. Two copied-production controls positively
accept a signed forbidden recipient change or fork when its policy check is omitted.

Exact command:

```
node --test --test-timeout=30000 test/account-successor/*.test.mjs test/account-enrollment/protocol.test.mjs test/account-first-authority/formats.test.mjs test/account-first-authority/registry.test.mjs
```

Typecheck (`tsc -b --noEmit`), scoped oxlint/oxfmt and crypto census match pass. The shared
first-certification parser only gains an export; first-authority vectors remain byte-identical.
The inventory has 173 sources, 96 labels/templates, 24 groups and 12 manual entrypoints. Two
construction groups remain open: preparation and successor/discovery. New fixed vectors do not
claim complete authority-map or integration qualification.

`initial-tests.log.gz` preserves one failed harness control: formatting introduced whitespace into
the source guard, so its unique omission anchor was not found. The guard itself passed production
negatives. Adjust the anchor to accept whitespace, retain its exact-one-match check, and rerun the
complete focused set (`focused-tests.log.gz`). `typecheck.log.gz` is empty on success. `inputs.json`
pins the tested production, fixtures and unchanged first-authority vector bytes.

The pure verifier deliberately leaves actual accepted-prefix comparison, live preparation consumption,
transaction/kill races and v9 authority installation to chunks B/C. No test here establishes those.
