# `S0-9` — command and result log

**Run:** 2026-08-27 · **Against:** `5923f51` · Assembled from the actual runs rather than transcribed.

`S0-9`'s acceptance asks for an exact command/result log. This is it; [`README.md`](./README.md) is the report
that interprets it.

## 1. Hermetic rerun — a fresh clone of the committed branch

```bash
git clone --no-local --branch claude/stage0-remediation <repo> hermetic
cd hermetic && pnpm install --frozen-lockfile
```

Every gate then ran in a tree sharing nothing with the author's working copy:

```
$ pnpm typecheck
$ pnpm vectors:check
190 AAD fields, each isolated by a published negative.
$ pnpm retention:check
retention: 12 months stated consistently across 6 anchors; every §16 unselected cell is bounded and open; §14.7's 5 states and 6 deletion classes match the executable model and stay disjoint from §13.7's 3 kinds and from §13.5's lineage words.
$ pnpm status:check
selection status: 17 selected and 4 unselected rows, disjoint; 5 PRD sentences cite a row and none contradicts the register.
$ pnpm limit:check
update limit: 0.0476 µs/byte from 3 measurements; the budget is exhausted at 19.6 kB and §12's 4 extrapolated rows agree; the interim 16 kB is under it and under the module's guard.
$ pnpm trace:check
traceability: 85 claims, 27 of 28 current defects falsified, 2 declared owed. docs/review/remediation/traceability.md is current.
$ pnpm wasm:verify
journal seal: 15 checks pass — the published KAT, 4 composition vectors, the length guard in both directions, and the key/nonce width guard.
$ pnpm test
 Test Files  36 passed (36)
      Tests  371 passed (371)
$ pnpm review:check
findings: 37 validated
$ pnpm wasm:stale
journal seal: generated module matches the crate (6465 B wasm).
```

The last line is the one no fixture can fake: it rebuilds the WebAssembly from the Rust crate and compares it to
the shipped module.

## 2. Preservation — nothing published at the reviewed tip was removed

Names are qualified by file, because `wrong-workspace` and `flipped-tag-bit` recur across carriers and
collapsing them would understate both sides and let a removal in one file hide behind a survivor in another.

```
negatives (file-qualified)   tip 213   now 292   removed 0
test titles (file-qualified) tip 297   now 363   removed 0
```

## 3. Isolation — the defect each finding describes, put back

```bash
node docs/review/remediation/S0-9/isolation-battery.mjs .
```

```
caught    f-4259822-generation-switch-local-durability-undefined
           defect:    the signed winner is not composed with successor opener install
           falsifier: GenerationApply — a kill at every step
           × has the successor openable before it advances the marker 3ms
caught    f-4259822-recovery-replacement-no-forward-rotation
           defect:    exposed old recovery material still opens the active generation after replacement
           falsifier: the replacement-payload variants
           Error: A replacement differing in the-successor-generation produced the selected payload digest. The bytes are not bound, and "exactly the old or exac
caught    f-9860a0b-journal-rotated-vector-reuses-key
           defect:    the generation-2 fixture derives from the generation-1 root
           falsifier: wrong-generation-key
           Error: Negative vector "wrong-generation-key" succeeded when it must not.
caught    f-992bc91-network-carrier-registry-stale
           defect:    the registry calls a selected carrier unselected
           falsifier: checkCarriers
           Error: Carrier content-record is still marked unselected, but row 3 is selected. Fill in its version, suite, label and AAD binding from that row.
caught    f-9b49b74-wasm-glue-key-nonce-lengths
           defect:    the glue accepts wrong widths and can reuse stale static-buffer bytes
           falsifier: check-wasm-seal.mjs
           journal seal: 3 of 15 checks FAILED
caught    f-b997cdb-checkpoint-key-retention-inverted
           defect:    old-generation deletion lacks an opener-for-every-retained-fallback predicate
           falsifier: the opener predicate
           Error: The last opener of a retained generation was retirable.
caught    f-dbfd01f-device-lock-rotation-caveat-lost
           defect:    the interface claims copy protection during the window where there is none
           falsifier: the rotation_owed derivation
           Error: rotation_owed is not derived.
caught    f-dbfd01f-record-nonce-ceiling-omitted
           defect:    the writer omits the exact 2^32 equality boundary
           falsifier: §6.1 — the allocator, and the count the budget reads
           × reads `reserved[gen]` and not `nextSeq`, which is what makes rotation survivable 4ms
caught    f-tip-prd-stale-selection-status
           defect:    the PRD says a selected row "is **open**"
           falsifier: check-selection-status.mjs
caught    f-tip-prd-stale-selection-status
           defect:    the PRD says a selected row "still **open**"
           falsifier: check-selection-status.mjs
caught    f-tip-prd-stale-selection-status
           defect:    the PRD says a selected row "remains **open**"
           falsifier: check-selection-status.mjs
caught    f-tip-prd-stale-selection-status
           defect:    the PRD says a selected row "is _open_"
           falsifier: check-selection-status.mjs
caught    f-tip-prd-stale-selection-status
           defect:    the PRD says a selected row "is **unselected**"
           falsifier: check-selection-status.mjs
caught    f-tip-prd-stale-selection-status
           defect:    the PRD says a selected row "is open"
           falsifier: check-selection-status.mjs
caught    f-5bd9552-origin-scan-static-forms
           defect:    a remote origin reaches built output as new WebSocket("wss://third.example…
           falsifier: check-origin-isolation.mjs
           origin isolation: 1 remote origin reference in built output.
caught    f-5bd9552-origin-scan-static-forms
           defect:    a remote origin reaches built output as fetch("https://third.example/code"…
           falsifier: check-origin-isolation.mjs
           origin isolation: 1 remote origin reference in built output.
caught    f-5bd9552-origin-scan-static-forms
           defect:    a remote origin reaches built output as new EventSource("https://third.exa…
           falsifier: check-origin-isolation.mjs
           origin isolation: 1 remote origin reference in built output.
caught    f-5bd9552-origin-scan-static-forms
           defect:    a remote origin reaches built output as el.setAttribute("src","https://thi…
           falsifier: check-origin-isolation.mjs
           origin isolation: 1 remote origin reference in built output.
caught    f-5bd9552-origin-scan-static-forms
           defect:    a remote origin reaches built output as importScripts("https://third.examp…
           falsifier: check-origin-isolation.mjs
           origin isolation: 1 remote origin reference in built output.
caught    f-5bd9552-origin-scan-static-forms
           defect:    a remote origin reaches built output as new Worker("https://third.example/…
           falsifier: check-origin-isolation.mjs
           origin isolation: 1 remote origin reference in built output.
20 of 20 reintroduced defects refused by the named falsifier.
```

Every line is a defect **put back** and refused by the one artifact `traceability.md` credits with refusing it.
The first run had a survivor — `check-selection-status.mjs` against `is **open**` — which is the failure the
report records.
