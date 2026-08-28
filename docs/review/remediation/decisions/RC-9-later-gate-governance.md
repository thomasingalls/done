# `RC-9` — cross-cutting later-gate governance

**Drafted:** 2026-08-28, fresh — nothing reopens, because nothing was ever decided · **Ratified:**
2026-08-28, option A at both joints — every deferred property is an entry in one debt manifest, and the
source↔blob binding splits at the toolchain line · **Branch:** `RC-9A`, as defined in
[`remediation-options.md`](../remediation-options.md) · **Status:** ratified, not yet consolidated — the
`S0-8` regeneration owes falsifiers 1–12

This is the last record of the decision sprint, and the only one that is not a repair of a prior ruling:
[`DISPOSITION.md`](../S0-9/DISPOSITION.md) states it as *"`RC-9` has no decision at all"*, and
[`action-tree.md`](../action-tree.md) makes choosing between its branches a prerequisite of `L-4`. The node it
decides is [`causal-decision-trees.md`](../causal-decision-trees.md)'s governance composition — *a
non-accounting governance node over five domain-specific later gates, not their causal ancestor* — and that
record already names the failure this decision exists to close: **"allowing 'later' to remain a prose promise
rather than a release-blocking state with evidence readback."** Consolidation is `S0-8`'s regeneration for
the mechanism and the `L-1`–`L-4` gates for its consumption.

## The node, and why it is a decision at all

Stage 0 defers five properties on purpose, and both `S0-9` rounds held the deferrals themselves to be sound —
*"Stage 0 correctly does not require the integrated runtime"* (the causal record), *"later debts mostly
honest"* and *blocking at their named later stages* (round 2's
[`challenge-evidence.md`](../S0-9/followup-evidence/challenge-evidence.md)). The deferred properties and their
real gates:

| Deferred property | Finding | Gate |
| --- | --- | --- |
| Legacy plaintext cutover as one resumable transaction, kill matrix included | [`f-9860a0b-legacy-plaintext-repair-undefined`](../../findings/f-9860a0b-legacy-plaintext-repair-undefined.md) | `L-1` |
| A declared hardware population under the journal p95 budget — Baseline stays a compatibility policy, never a floor | [`f-bd87655-baseline-not-performance-floor`](../../findings/f-bd87655-baseline-not-performance-floor.md) | `L-4` |
| The audit's exact scope: the 2019 snapshot diffed to the locked `0.10.1` graph, review 3a naming what it evaluated | [`f-9b49b74-rustcrypto-audit-version-gap`](../../findings/f-9b49b74-rustcrypto-audit-version-gap.md) | `L-4` |
| Reviewed Rust source bound to the shipped blob, with attested toolchain provenance | [`f-9b49b74-wasm-source-artifact-drift-unchecked`](../../findings/f-9b49b74-wasm-source-artifact-drift-unchecked.md) | `L-4` — and the divisible case below |
| The immutable append burst on that declared population | [`f-66a7c6a-journal-benchmark-overwrites-one-slot`](../../findings/f-66a7c6a-journal-benchmark-overwrites-one-slot.md) — causally `RC-3`, referenced here, never double-counted | `L-4` |

`L-4`'s exact-artifact list — the browser/OS/device matrix, raw journal samples, the source-delta review,
pinned/attested toolchain and blob hashes, ASVS and runtime-egress evidence, reviewer 3a/3b identity, scope and
readback — rides the same mechanism; the five rows above are the census it must hold from birth, because they
are the debts that exist today.

**What is missing is not the deferral; it is that nothing can refuse a deferral's failure.** The whole current
enforcement is `check-traceability.mjs`'s `OWED` list, and its own docblock is honest about what that is: *a
declaration of debt, not a coverage claim*. Verified at this tip: the list holds two entries (the X25519 dated
readback at `S0-10`, the append-burst population at `L-4`), and it fails only when a debt names a non-finding,
names a gate `action-tree.md` does not define, or was **paid and not struck** — the vacuity guard. It cannot
fail when a gate arrives with its debt unmet, because no entry carries an owner, a required artifact, an
expiry, or a hash of anything. Worse, the matrix's required population is `design` + `closure` classes only, so
the four findings above that sit in [`end-state-materiality.md`](../end-state-materiality.md)'s *Explicit
later* class are required to have **neither a falsifier nor a debt entry**: a green matrix says nothing about
them at all. Their entire current home is a prose table row — the convicted state, verbatim.

The sprint's three ratified patterns meet the future here, and this record is where they compose: `P-4`/`P-1`'s
class 1 — elapsed time executes a factor-authenticated instruction or it does nothing — becomes, at a gate, *an
arrived deadline executes a recorded blocking rule, or it blocks nothing*; `P-5`'s class 3 — an input a gate
consumes is checked by something that executed, or it is not an input — becomes *a debt is paid by an execution
receipt, or it is not paid*; and `P-5`'s corollary — status is computed from the homes, never maintained beside
them — is what a release gate *is*, if it is anything.

## What the rounds demonstrated

**Round 1's demonstration, the one the queue names** ([`challenge-platform.md`](../S0-9/challenge-platform.md)
§3.7). Append `#[no_mangle] pub extern "C" fn s09_probe() -> u32 { 7 }` to `wasm/journal-seal/src/lib.rs` and
rebuild nothing:

```
pnpm wasm:verify   (in `pnpm check`)   exit=0
  → journal seal: 15 checks pass — the published KAT, 4 composition vectors, …
pnpm wasm:stale    (in NO gate)        exit=1
  → wasm/journal-seal/seal.generated.ts is stale — re-run: …
```

The check that would catch the drift exists, works, and is reachable from no gate. That is
`f-9b49b74-wasm-source-artifact-drift-unchecked`'s named failure executing at the tip, and `RC-9`'s own stated
falsifier — *stale blob fails normal CI* — failing in the present tense.

**The simpler repair round 1 tried, and the one that survives.** *"Add `wasm:stale` to `check`"* fails on its
own mechanics: `build-wasm-seal.mjs` shells to `cargo build` even under `--check`, and `check-wasm-seal.mjs`'s
docblock gives the reason it may sit inside `pnpm check` — *"this runs anywhere Node does."* What survives is
smaller: `seal.generated.ts`'s header records the byte counts and **no hash of `src/lib.rs`, no `Cargo.lock`
hash, no toolchain version**. Recording those at generation and comparing the source-side hashes in the
already-wired, toolchain-free `wasm:verify` fails the mutation above — *"binding reviewed source to shipped
bytes for the case where either is edited alone, which is the finding's named failure, without adding Rust to
CI"* — and the challenger's verdict is on record: *materially simpler than a governance branch and was not
considered*. The duty is divisible: drift detection is achievable now; reproducible source-to-binary
attestation — the same bytes from the same source under a pinned toolchain — genuinely needs Rust and stays at
`L-4` on any option.

**Round 1's structural point.** `action-tree.md` makes choosing `RC-9A`/`RC-9B` a prerequisite of `L-4` itself:
*"the gate that must block is the gate that decides whether it blocks."* A governance ratified only when its
gate arrives is self-certification at the largest scale this program has; the decision is taken now, in this
sprint, precisely so that no gate installs its own authority.

**Round 2's verdict** (`E`'s reconciled row): **"FAIL current gate governance; later debts mostly honest."**
Normal `check` never reached most evidence at the challenged tip; freshness is a manual command; and one debt
was assigned two different gates — `FU-15`, the X25519 readback owed to `S0-10` by TRD §10.11 and to `L-4` by
the `OWED` list, resolved by the hygiene commit in the TRD's favour. Its simpler-repair column is a constraint
on every option here: *keep debts at their real later gate and wire independent receipts; do not promote
component KATs/history into release proof*.

**And the gate's own history is the same class.** At the challenged tip `pnpm check` exited at lint while
traceability said every artifact *runs through the gate* (`FU-14`); the gate was descoped to typecheck plus the
evidence suite on 2026-08-28 and now passes end to end. `P-5` ratified the crediting rule — "checked" credits
an execution, never reachability — and `S0-8` owes the receipt mechanism. A release gate that consumes anything
less inherits the defect this branch just paid to find.

## The question

**When Stage 0 defers a property to a later gate, what turns "later" from a prose promise into a state that
blocks — by what representation does each deferred property carry its owner, its one gate, its required
artifact, its falsifier and its expiry (`RC-9A`'s central manifest, `RC-9B`'s stage-local receipts, or the
priced status quo) — and which gate owns `wasm:stale`'s duty, now that round 1 has demonstrated the duty
divides into a toolchain-free binding the current gate can carry and a provenance attestation only `L-4` can?**

## The floors that are not choices

**The deferral floor: nothing moves earlier, and nothing gets renegotiated.** Every deferred property keeps its
named gate; no option pulls `L-1`–`L-4` work into Stage 0, and none weakens a debt to make its gate cheaper.
The five findings stay `validated` and stay in their *Explicit later* class — finding dispositions are
`S0-10`'s separately authorized subject, and this record's mechanism acquires no authority over
`docs/review/findings/`. `P-7`'s standing rule is the same shape at product rows and keeps binding on its own.

**The debt floor: a deferred property is a record, or it is not deferred.** Whatever representation is
ratified, each debt carries its owner, exactly one blocking gate, the required artifact, the falsifier that
artifact must survive, and an expiry; its inputs are hashed; a gate that arrives with its debt absent, expired,
or input-changed **blocks**. A waiver is an explicit, scoped, expiring, recorded decision naming its authority
— and a waived debt reports as waived, never as paid. The vacuity guard generalizes rather than retires: a
debt leaves the registry only by a receipt or a recorded waiver, and paid-and-not-struck stays a failure. Both
branches' own packets already require all of this, which is what makes it a floor rather than a joint.

**The one-gate floor: `FU-15` becomes a rule.** One debt, one blocking gate, and every authority record agrees
in both directions — the two-homes-per-debt shape that assigned X25519 to `S0-10` and `L-4` at once is refused
mechanically, not editorially. This is `P-5`'s class-3 pattern applied to the registry: the debt's record is
the home; the queue, the tree and the matrix project it.

**The receipt floor: payment credits an execution.** A debt is paid when its named falsifier ran and passed at
its gate, receipted — never when a command is reachable, never when a component KAT or an audit's history is
promoted into release proof. The receipt mechanism itself is `S0-8`'s design (`FU-14`), exactly as `P-5`
reserved it; this record binds what a payment may credit, not how receipts are produced.

**The timing floor: the mechanism exists before the first gate that consumes it.** That gate is not `L-4` — it
is `S0-10`, which already consumes the X25519 dated readback under `P-5`'s discipline that an observation
without a date or an expiry fails at the gate that reads it. So the ratified representation lands with `S0-8`'s
regeneration, ahead of round 3 and `S0-10`, and `L-1`–`L-4` consume what already exists. The choice cannot wait
for the gate it governs.

## The options considered

Two joints: how a deferred property binds, and which gate owns the one duty demonstrated to be divisible.

**Joint 1 — the representation that makes "later" block.**

**A — `RC-9A`: one central gate manifest. (Ratified.)** The `OWED` list grown into the registry its docblock already
gestures at: one machine-readable home in which every deferred property is an entry with the debt floor's
fields, entries are content-addressed, results reference commit and build hashes, and the projection of
what-blocks-what is computed from it on demand. The seed exists and already behaves correctly at this tip —
*the only place the fact lives*, shrink-only, vacuity-guarded — so A is an extension of a working mechanism,
not an invention; the census closes at five entries the day it lands. The buy is the argument this program has
now bought six times: totality — a deferred property not in the manifest fails the walker rather than entering
no bucket, so the *Explicit later* blind spot (a class the matrix requires nothing of) is structurally gone,
and the one-gate floor comes free because one home cannot disagree with itself. The costs, recorded: schema
and governance work at `S0-8`; checkbox compliance if falsifiers are weak — the manifest is only as strong as
the falsifier column, which is why the debt floor makes it mandatory; honest schedule-blocking when external
review availability is the missing artifact; and one `RC-8C` tension to hold — the manifest must reference and
hash stage artifacts, never restate them, or it becomes the second copy `P-5` just retired.

**B — `RC-9B`: stage-local signed completion receipts.** Each stage owns a small completion packet approved by
its responsible engineering, product and review actors; release requires the chain of receipts; changed inputs
invalidate dependents through hashes; supersession is append-only. The buy: domain ownership where the
judgment lives, richer per-stage content, no central schema — and round 2's *wire independent receipts* is
receipts-shaped, though that sentence names the payment mechanism both options share, not B's census. The
costs: the census **is** the chain, so B's own packet lists *omit one gate* as a closure falsifier — the
filter defect at governance scale, `P-5` joint 1-B's argument returned at a higher altitude: an undeclared
gate escapes silently, and `FU-07` arose precisely at a consumer nobody had declared a checker for. The
receipt formats multiply and must pairwise agree, which is `FU-15`'s two-homes shape made load-bearing; and
completeness — *every deferred property has a receipt slot somewhere* — is exactly the property no single
receipt can check, so B must either add a central index of receipts (A by another name) or price the next
escape at one challenge round.

**C — the priced status quo: prose rows plus review.** Keep the *Explicit later* table and the two-entry
`OWED` list as the census; let round 3, the external reviewers and each gate's own arrival discover what is
unmet. The buy is zero machinery. The costs are already invoiced rather than predicted: this **is** the
convicted state — *"later" as a prose promise* — with detection priced at one full challenge round per
instance, both rounds having billed it; the four gate-class findings stay mechanically invisible to a green
matrix; and it hands this class the concession `P-4`, `P-3` and `P-5` each refused theirs — the smallest diff,
ratifying the pattern instead of closing it.

**Joint 2 — which gate owns `wasm:stale`'s duty.**

One sub-question separates the options: whether the duty's demonstrated divisibility is used now or filed as
one debt.

**A — split the duty at the line the toolchain draws. (Ratified.)** `build-wasm-seal.mjs` records, in the generated
header, the SHA-256 of `src/lib.rs`, of `Cargo.toml`/`Cargo.lock`, and the toolchain version string;
`check-wasm-seal.mjs` — in `pnpm check` today — recomputes the source-side hashes with Node alone and fails on
mismatch. Round 1's mutation then fails the normal gate, and the `L-4` debt shrinks to what genuinely needs
Rust: reproducible rebuild, pinned/attested toolchain, blob attestation. The buy: the demonstrated drift class
closes in the gate that already runs, before round 3 challenges a corpus whose gate cannot see a stale blob;
toolchain-freedom — the docblock's own admission rule for `pnpm check` — is preserved; the split is the
finding's own two sentences given two homes (*make freshness mandatory in the normal check* — the binding;
*add reproducible or attested toolchain provenance* — the remaining debt). The costs, stated: the header
becomes a generated fact under the same `--check` discipline as every vector file, and regenerating it needs
cargo — but only when the crate actually changes, which is the case that needs cargo anyway; and a hash
binding detects **drift, never forgery** — a builder that lies about hashes, or a compromised toolchain, is
exactly the residual the `L-4` provenance debt exists for, and the printed claim must say so (a binding
overclaiming attestation would be `E4`'s defect reborn).

**B — the whole duty is one `L-4` debt.** No header change; `wasm:stale` stays a manual command, and under
joint 1's mechanism the drift risk is registered, owned and expiring rather than silent. The buy: the smallest
diff, and no second generated fact to keep true. The costs: every Stage 0 return between now and `L-4` re-runs
`wasm:verify` against bytes the gate cannot know are current — the demonstrated mutation stays green through
round 3, `S0-10`, and every regeneration in between; and the option's honesty depends entirely on joint 1
landing, since under joint 1-C it is the convicted state continued verbatim.

**C — `cargo` joins the gate.** Put `wasm:stale` in `pnpm check`. Round 1 tried this first and its rejection
is on record: the builder shells to cargo even under `--check`, so every contributor and every CI runner
acquires a Rust toolchain as a precondition of typecheck-level hygiene — and because the toolchain is unpinned,
the comparison is environment-dependent, which either flaps the gate or drags the `L-4` pinning work into
Stage 0 against the deferral floor. Priced for completeness; the evidence already refused it once.

## Ratified 2026-08-28 — A at both joints

**The ruling.** Two selections, and the regime that joins them:

- **One debt manifest, total over the deferred.** Every deferred property is exactly one entry in one
  machine-readable manifest carrying the debt floor's fields — owner, one blocking gate, required artifact,
  the falsifier that artifact must survive, expiry, hashed inputs. The manifest opens with six entries: the
  five deferred properties above, and the X25519 dated readback already owed to `S0-10`, migrated unchanged.
  A gate consults the manifest and blocks while its debt is unpaid, expired or input-changed; an entry leaves
  only by an execution receipt or a recorded waiver; and what-blocks-what is computed from the manifest on
  demand, never transcribed beside it.
- **The binding lands in the gate that already runs.** `build-wasm-seal.mjs` records the SHA-256 of
  `src/lib.rs` and of `Cargo.toml`/`Cargo.lock`, and the toolchain version string, in `seal.generated.ts`'s
  header; `check-wasm-seal.mjs` recomputes the source-side hashes with Node alone and fails `pnpm check` on
  mismatch, printing drift detection and nothing wider. The `L-4` provenance debt shrinks to what genuinely
  needs Rust — reproducible rebuild, pinned/attested toolchain, blob attestation — and is registered in the
  manifest like every other debt.

**The mechanism is the lineage review's regime, adopted a third time — deliberately.** The pattern has now
been selected at three altitudes. The review workspace itself runs on structured homes hash-pinned in
`config.json` and a computed status view — `pnpm review:status`, whose manifests are untouched, still verify,
and ran green at every challenge baseline. `P-5` adopted the same shape earlier in this sprint for the
corpus: the standing census and the `remediation:status` projection, *status computed from the homes, never
maintained beside them*. This ruling adopts it for deferred evidence. What is new is not the shape but one
verb and one direction of time the prior two instances never needed: `review:status` and the standing walker
verify what **is** — a finished review's integrity, a current document's standing — while the debt manifest
binds what **is not yet**, so its entries carry an expiry that can lapse, and the gates that consult it must
**block**, not merely report. The same regime, given the refusal the causal record says was missing: *a
release-blocking state with evidence readback*.

**Why A at the manifest.** It is the only option whose failure mode is a build error rather than a discovery,
and it is the third instance of a regime this repository has proven twice rather than the first instance of a
new one. B's census is its chain, so the forgotten gate escapes until a challenge round finds it — the
position `corrected-end-state.md` held at `P-5`, one altitude down — and its receipt formats multiply into
`FU-15`'s two-homes shape; C's detection price is one challenge round per instance, and both rounds have
already invoiced it. A's costs stay exactly as recorded: schema work at `S0-8`, falsifier-column discipline so
the manifest cannot decay into checkboxes, and the `RC-8C` line — reference and hash stage artifacts, never
restate them.

**Why A at the binding.** It is the one repair a challenger demonstrated rather than proposed — *materially
simpler than a governance branch* — and it honors both halves of the finding's own disposition by giving them
two homes: freshness mandatory in the normal check (the binding, toolchain-free), provenance attested at
`L-4` (the registered residue). B leaves the demonstrated mutation green through round 3 and `S0-10` for no
recorded buy beyond diff size; C was tried by round 1 and refused by its own mechanics. The binding's printed
claim stays exactly its scope — drift, never forgery — and the residual is not a gap but an entry.

## Falsifiers

Each is a test, not a claim, under the ratified rules; all twelve bind.

1. **The demonstrated mutation fails a gate that ran.** Append a no-op export to `wasm/journal-seal/src/lib.rs`
   without rebuilding: `pnpm check` fails at `wasm:verify` with the mismatched source hash named — and the
   failure is receipted, never inferred from command text.
2. **The census is total over the debts that exist.** Each of the five deferred properties resolves to exactly
   one registered debt with owner, gate, artifact, falsifier and expiry; deleting one entry, or adding a sixth
   deferred property with no entry, fails the mechanism rather than entering no bucket — a gate-class finding
   can no longer be required to have nothing.
3. **Arrival-unmet blocks.** Running a gate whose debt's artifact is absent, expired, or whose hashed inputs
   changed, blocks with the debt named; the same run with the artifact present, current and receipted passes.
4. **One debt, one gate, all homes agreeing.** Introducing a second authority record that assigns a debt a
   different gate fails a both-directions readback — the `FU-15` reproduction, refused mechanically.
5. **The vacuity guard survives.** Landing a debt's falsifier without striking its entry still fails, exactly
   as `check-traceability.mjs` fails it today; striking without a receipt or recorded waiver also fails.
6. **Expiry is read at the consuming gate.** An external observation without source, date and expiry fails the
   gate that reads it, and an expired one fails the same way — first exercised by `S0-10`'s X25519 table, the
   discipline `P-5` falsifier 14 states, given its missing second half.
7. **A waiver is a decision, not an ambiguity.** A debt waived without scope, expiry and named authority fails;
   a validly waived debt reports as waived, and no projection renders it as paid.
8. **History and components cannot pay a debt.** The 2019 audit citation cannot mark the audit-scope debt paid
   without the exact commit-to-`0.10.1` delta and review 3a's named scope; a green KAT cannot mark the
   freshness or provenance debt paid; a Baseline citation, or the single Pixel, cannot mark the population debt
   paid — each refusal is a check, not a convention.
9. **Blocking is computed, never transcribed.** What currently blocks release is a projection computed from the
   debt records on demand, agreeing with [`HANDOFF.md`](../HANDOFF.md) and `action-tree.md` in both directions
   — `P-5`'s corollary extended past Stage 0.
10. **The header binds, and claims only drift.** The generated header carries the source, lockfile and
    toolchain records; editing `lib.rs` or `seal.generated.ts` alone fails `pnpm check` with the mismatched
    hash named; and the printed claim states drift detection only — a mutation widening it to attestation
    fails a check, under `P-5`'s ratified rule that a checker's printed claim is exactly its scope.
11. **The provenance residue is an entry, not a gap.** The manifest registers the `L-4` provenance debt —
    reproducible rebuild, pinned/attested toolchain, blob attestation — with owner, artifact, falsifier and
    expiry, and `L-4` arriving without its executed, receipted pass blocks release.
12. **The reproduction class is closed at the class.** Whatever is ratified, a new deferred property introduced
    by a future stage return cannot exist outside the mechanism: the return that defers it must register it,
    and the mechanism's own check fails a deferral it cannot see — the census argument, pointed forward.

## Consolidation owed at `S0-8`, consumed at `S0-10` and `L-1`–`L-4`

- The manifest joining the gate: the `OWED` list grown to the ratified fields, the six entries registered —
  the five deferred properties and the migrated X25519 `S0-10` entry — and the what-blocks-what projection
  checked both directions against [`HANDOFF.md`](../HANDOFF.md) and `action-tree.md` (falsifiers 2–5, 7, 9,
  11, 12).
- The header binding: `build-wasm-seal.mjs` writes the three records and `check-wasm-seal.mjs` compares the
  source-side hashes inside `pnpm check`, its printed claim stated as drift detection (falsifiers 1, 10). One
  cargo regeneration stamps the current header; the `WASM_BASE64` bytes must not change — `wasm:stale`
  passing at this tip is the proof they reproduce.
- Receipt crediting composes with `FU-14`'s design exactly where `S0-8` already owes it; this record adds the
  refusal rule, never the mechanism (falsifiers 1, 3).
- `action-tree.md`'s `L-4` prerequisite line carries this ratification's answer, and the queue's bullet and
  this record agree in both directions from the same commit.

## What this does not decide

- **The receipt mechanism** — `S0-8`'s design (`FU-14`), exactly as `P-5` reserved it. This record binds what
  a payment credits, never how receipts are produced or stored.
- **The debts' contents** — the device population itself, the cutover state machine, the audit delta review,
  reviewer identity and booking, the X25519 table's rows. Those are `L-1`/`L-4`/`S0-10` work; this record
  decides how they bind, not what they contain.
- **Finding dispositions** — the five findings stay `validated` in their class; `S0-10`'s separately
  authorized workflow remains the only place a `status:` changes.
- **`P-7`'s standing rule** — rows 18, 19 and 21 stay at their own gates; nothing here reopens or absorbs it.
- **Round 3's perspective** — queue item 6's independence bar is challenge design, not gate governance.
- **The exact encodings** — the manifest schema or receipt format, the header's hash syntax, the projection's
  printed form: the consolidating action selects them under the ratified rules, as `P-1`, `P-3` and `P-5` each
  reserved for theirs.
