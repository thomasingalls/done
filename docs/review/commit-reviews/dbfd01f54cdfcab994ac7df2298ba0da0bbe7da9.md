---
schema: 1
kind: commit-review
commit: dbfd01f54cdfcab994ac7df2298ba0da0bbe7da9
parent: f5def83ac6f21873ab7fb589247dd116fc2febd9
batch: B-04
classification: propagation
status: complete
owner: /root
started: 2026-08-21
updated: 2026-08-21
verdict: reopen
blocked_on: none
superseded_by: none
---

# Commit `dbfd01f` — `Fold the five storage selections into the requirements`

## Scope and exact sources

- Exact object and parent diff: `dbfd01f54cdfcab994ac7df2298ba0da0bbe7da9` against
  `f5def83ac6f21873ab7fb589247dd116fc2febd9`.
- `dbfd01f:docs/{PRD,TRD,development,progress,sequencing}.md` and all five modified
  `docs/selections/row-{1,2,3,13,14}-*.md` records.
- The five decision-time generators and checked-in vector files, plus the pinned-tip versions used only to trace
  whether omissions persisted or later work supplied evidence.
- Primary checks: NIST SP 800-38D §8 and RFC 9180 Appendix A.

## Change seen while moving backward

Moving to the parent reopens rows 1–3, 13, and the storage half of row 14 in the normative register and removes their
selected constructions from PRD/TRD. The underlying selection records and vectors remain in the parent, so this is a
propagation commit: it promotes five already-argued decisions into current truth and updates stage/review navigation.

## Original-contract trace

The fold answers `OC-063`–`OC-065`, `OC-075`, and the storage half of `OC-076`, and attempts to discharge the
selection/vector portion of `OC-050`, `OC-051`, and `OC-082`. It preserves the no-plaintext-at-rest and synchronous
journal constraints (`OC-023`–`OC-025`), device-lock boundary (`OC-026`), and recovery architecture (`OC-034`).

## Construction and state-machine effect

No executable state machine is added. Normatively, Suite 1 selects AES-GCM for async carriers, XChaCha20-Poly1305 for
the journal, HKDF/Ed25519/HPKE/SHA-256 roles, and carrier-level suite versioning. Records and local key envelopes bind
all clear fields in AAD; journal entries use random 192-bit nonces without durable counters; device-lock enrollment
replaces `L_local` with factor-sealed `L_lock` and rotates forward; generated 125-bit Crockford codes need no
stretching. Storage review 3a is then called concretely selected.

## Assumptions and guarantee boundaries

- The fold correctly keeps the generated/full-entropy/no-stretch invariant and does not turn a user-chosen secret
  into an unstretched factor.
- It correctly keeps device lock local: no account authentication, signing, or recovery bypass.
- It relies on linked selection records for the exact record nonce ceiling and lock enrollment's recoverable pending
  state, even though TRD says the normative document states current truth and wins on disagreement.
- It treats every selected row as self-vectorized although row 1 deliberately deferred HPKE execution to review 3b.

## Evidence and oracle independence

At this SHA the suite, record, journal, recovery, and device-lock generators are present and their checked-in outputs
are reproducible in principle. Exact archived checks for the dependency-free suite, record, recovery, and device-lock
generators pass. The journal generator needs the commit's uninstalled `@noble/ciphers` dependency in the isolated
archive. Evidence is not complete for the fold's row-20 claim: the suite generator KATs AES-GCM, HKDF, Ed25519, and
SHA-256 but cannot execute the selected HPKE role.

## Downstream propagation

Every later requirements edit starts from this five-row selected register. The pinned tip later adds an executable
RFC 9180 HPKE vector, isolated AAD mutation coverage, and other selections, but retains the device-lock pending-
rotation divergence, the record ceiling only in its selection, and the original suite-separation bucket bug.

## Consequences and residual failures

The fold usefully makes the storage architecture implementable and prevents open-register drift. Three caveats are
not faithfully promoted: lock copy can overpromise immediate forward protection while `rotation_owed` remains true;
the AES-GCM writer's rotate-before-`2^32` branch is absent from the normative algorithm; and row 20 is declared closed
despite deliberately absent HPKE execution. The first has a reachable confidentiality/copy consequence, the second is
a remote implementation hazard, and the third is an evidence-status overstatement.

## Falsification attempt and counterevidence

I compared each folded sentence with its full selection rather than treating a summary as exhaustive. Most important
nuance survives: `seq` never resets, no-stretch depends on generated entropy, PRF is additive, history is not rekeyed,
custody is written at genesis, and review 3b retains step-up. I then tried to read the three divergences narrowly.
The linked records make the missing rules discoverable, Stage 1 is single-device, and HPKE belongs to 3b; those facts
lower severity but do not make the unconditional normative claims true at this SHA.

## Nuance preservation

Broadly strong, but incomplete at three high-leverage edges. The first known divergences are this commit itself:
row-13's “takes full effect when next rotates” contingency becomes unconditional “from now on,” row-3's numeric
write ceiling becomes only an unnamed budget, and row-1's explicit no-HPKE-vector statement coexists with a blanket
row-20 closure.

## Verdict

`reopen`: the five selections are substantively defensible and mostly propagated faithfully, but the normative fold
must reconcile the device-lock copy/state transition and record writer ceiling. Its historical row-20 closure should
also be narrowed to evidence that actually existed at the decision point.

## Findings and unresolved checks

- [`f-dbfd01f-device-lock-rotation-caveat-lost`](../findings/f-dbfd01f-device-lock-rotation-caveat-lost.md)
- [`f-dbfd01f-record-nonce-ceiling-omitted`](../findings/f-dbfd01f-record-nonce-ceiling-omitted.md)
- [`f-dbfd01f-row20-closes-unvectorized-hpke`](../findings/f-dbfd01f-row20-closes-unvectorized-hpke.md)

The later cross-cutting requirements pass should determine whether current normative documents intentionally delegate
algorithm preconditions to selection records or must restate every enforcement branch.
