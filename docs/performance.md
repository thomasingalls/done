# done — Performance budget history

**Append-only.** One entry per measurement, oldest first. Numbers are never edited after the fact — a
re-measurement is a new entry. The budgets themselves live in **TRD §12** and are normative there; this
file records what was actually measured against them.

**Why this is checked in.** `scripts/check-budget.mjs` enforces the initial-JS budget on every build and
exits non-zero when it is exceeded, which is the right enforcement and the wrong memory: it prints a number
and forgets it. A threshold that is only ever compared against itself tells you that something broke, never
when or by how much. [sequencing.md](./sequencing.md) §3.1 makes the sharper version of the argument for
latency: Stage 1's encrypted store adds a key-store read, an unseal and per-record decryption to cold
start, so **without a recorded plaintext baseline a regression from encryption is both invisible and
unattributable**, and the budget conversation afterwards has nothing to argue from.

**The window closes at Stage 1.** Every plaintext number that is not recorded before the encrypted store
lands is a number that can never be taken again.

## How to record a measurement

```bash
pnpm build
```

The build prints the initial-JS figure and fails if it exceeds the budget. To get an append-ready row for
this file instead of reading it off the build log:

```bash
pnpm budget --record
```

Paste the row into the table below, with the commit it was measured at. **Recording is deliberately
manual.** Appending on every build would write a row for each local rebuild and turn the history into
noise; what is worth recording is a measurement someone chose to take.

**A measurement without a commit is not a measurement.** The hash is what makes a number attributable,
which is the entire purpose of the file.

---

## Initial JS bundle — budget < 350 kB gzipped

The one row with a harness. Enforced build-failing by `scripts/check-budget.mjs`; the budget covers the
entry module plus everything the HTML preloads, and excludes lazily-loaded chunks by design.

| Date       | Commit    | Measured | Budget   | Headroom           | Store     | Note                                                                                                   |
| ---------- | --------- | -------- | -------- | ------------------ | --------- | ------------------------------------------------------------------------------------------------------ |
| 2026-08-18 | `e4969a0` | 306.2 kB | 350.0 kB | 43.8 kB (87% used) | plaintext | **Baseline.** First recorded measurement. `pnpm build` on Node 26, one chunk, css 4.7 kB informational |

**Context for the baseline.** The Phase 2 decision record put `temporal-polyfill` at about 21 kB gzipped
of this total — an estimate carried forward rather than re-measured here, and it deletes itself when the
platform ships Temporal (`src/lib/temporal.ts` is the only file permitted to import it). The remaining
headroom is what Stage 1's cryptography and Stage 4's envelope layer have to fit inside.

---

## Latency budgets — no harness yet

**None of these has ever been measured.** They are listed in full rather than omitted, so that the gap is a
visible absence rather than a silent one, and so that building the harness has a checklist. Building it is
[progress.md](./progress.md)'s Stage 0 item 3.

The **Store** column is what makes these rows worth taking early: a plaintext number and an encrypted
number for the same metric is the only way the cost of encryption is ever attributable.

| Metric (TRD §12)                         | Budget                           | Harness | Plaintext baseline | Encrypted |
| ---------------------------------------- | -------------------------------- | ------- | ------------------ | --------- |
| Keystroke → paint                        | < 16 ms p95                      | none    | —                  | —         |
| Card focus → editable                    | < 50 ms                          | none    | —                  | —         |
| **Cold start → Today editable**          | **< 2.5 s**                      | none    | —                  | —         |
| Warm start → Today editable              | < 1.0 s                          | none    | —                  | —         |
| Day-to-day navigation                    | < 100 ms                         | none    | —                  | —         |
| Search results (10k items)               | < 150 ms                         | none    | — (no search yet)  | —         |
| Content-root load (encoded state)        | < 500 ms                         | none    | —                  | —         |
| Key store open → `K_g` unsealed          | < 100 ms                         | none    | n/a — no key store | —         |
| Journal AEAD write, low-end device       | < 1 ms p95                       | none    | n/a — no AEAD yet  | —         |
| Envelope sign (async, off the edit path) | < 5 ms p95                       | none    | n/a — Stage 4      | —         |
| Envelope verify on receipt               | < 2 ms p95                       | none    | n/a — Stage 4      | —         |
| First-sync checkpoint verify             | < 1.5 s                          | none    | n/a — Stage 4      | —         |
| In-memory index first build              | < 1.5 s, off the cold-start path | none    | n/a — Stage 3      | —         |

**Cold start is the row at risk**, and TRD §12 already says so: it will absorb a key-store read, an unseal
and per-record decryption, none of which existed when 2.5 s was set. It is the row whose plaintext baseline
is worth the most and whose window closes first.

**The journal budget is a correctness budget in disguise** (TRD §12). The synchronous AEAD runs inside a
handler that must not return until the write has happened, so exceeding 1 ms does not make the app slow —
it makes typing stutter.

**Five rows are marked `n/a` for the plaintext baseline** because the thing they measure does not exist
yet. They are not waiting on the harness; they arrive with the feature, and their first measurement _is_
their baseline.

---

## When a budget is revised rather than met

TRD §12 calls these "build-failing thresholds, not aspirations", and §3.2 of
[sequencing.md](./sequencing.md) allows one alternative to meeting a budget: **a number the budget has been
consciously revised to.** A revision is a decision, so it goes in [decisions.md](./decisions.md) with the
measurement that forced it, and the TRD is updated — the revised figure is normative there, not here. This
file records that the measurement happened and what it said.

For cold start specifically, TRD §12 names the honest responses in advance: fewer stored records through
more aggressive trimming (§6.1), or a revised budget — **not moving verification onto a lazy path where it
silently stops happening.**
