# Content-approval chunk B: authenticated exchange and ordering

2026-09-16, after signed Account UI merge `605cb087`.
[Byte contract and model limits](../../account-crypto/enrollment-ceremony.md#5-exchange-context-and-trust-inputs).
Product checks only; release validation remains paused.

## Result

**56 tests pass:** 15 exchange/model/control cases, 29 prior primitive cases and 12 registry checks.
Typecheck, scoped lint/format, current runtime inventory, unchanged published enrollment vectors
and diff checks pass. No runtime counterexample was found in these runs.

The new cases check independent ordered framing/Node signatures, old preparation expiry after
admission, every context/message leaf, held authority and locally owned keys, root/device separation,
exact retries versus changed attempt/pair/role/nonce, scalar/byte/time bounds, brand forgery and
input mutation across awaits. Both roles derive the same unchanged row-11 SAS. A reveal proposal's
zero signature placeholder is rejected until replaced by the device signature.

Sixty generated attempt/nonces cases (seed 16091608) agree with the independent Node oracle.
Eighty generated ordering histories (seed 16091609) insert disorder/crashes into meaningful progress
and optionally terminate at a competing head: **19 complete, 61 stop, 30 reach disclosure**. Both
roles also complete across a modeled crash at each exchange/save boundary; every prefix is tested
with competing head, expiry and abandonment. Unsigned stale status cannot erase the attempt; a
changed signed peer commitment cannot replace the saved one.

Three actual runtime omission controls demonstrate forged-peer acceptance, cross-attempt commitment
transplantation and stale-pair reveal acceptance. One separate model omission control discloses the
nonce before retaining the verified pair when that storage predicate is removed. It is not native
evidence: atomic saves and authenticated retained state are model assumptions still owed by C.

`initial.log.gz` preserves the first passing 15-case run. The generated model was then strengthened
to insert faults into real progress rather than rely on mostly early-terminal random schedules;
`model.log.gz` records its pass and boundary counts. The final run also checks retained-peer
equivocation and placeholder-signature refusal. `focused.log.gz` records all 56 final passes.
The typecheck log is empty on success. Input hashes bind the final runtime/tests/current inventories.

## Reproduce

```sh
node --test --test-timeout=90000 test/account-ceremony/*.test.mjs test/account-first-authority/registry.test.mjs
node node_modules/typescript/bin/tsc -b --noEmit
node node_modules/oxlint/bin/oxlint --react-plugin account-protocol/ceremonyExchange.ts test/account-ceremony
node scripts/account-crypto-prep/run.mjs
node scripts/generate-enrollment-vectors.mjs --check
```

Current census: 187 sources, 103 labels/templates, 25 groups, 15 manual entrypoints. The ceremony
group remains open for qualification. There is no native durable attempt, typed approval, content
key release, certified second reader or relay endpoint in this chunk. The integrated first-device
preview is unchanged, including its no-sync boundary. Frozen release inventories and earlier
evidence are untouched.
