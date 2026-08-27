# `S0-1` — the closure authority, and the policies the green checks were hiding

**Started:** 2026-08-27 · **Inputs:** [`P-5`](../decisions/P-5-closure-authority.md) decided (`RC-8C`)

The last action whose findings are closure defects rather than design ones — and the one where **every artifact
already passes**. Nothing here is broken in the sense of a failing check. Three oracles report green while
enforcing less than they claim, and the work is making the claim and the enforcement the same size.

## Findings this action must close

| Finding                                        | Severity | What passes today that should not                                                        |
| ---------------------------------------------- | -------- | ---------------------------------------------------------------------------------------- |
| `f-3bea0e6-suite-separation-ignores-both-path` | medium   | A primitive labelled `both` enters neither bucket, so the separation check cannot see it |
| `f-b9ff071-webauthn-cross-origin-policy`       | low      | A framed ceremony with an unapproved top-level origin verifies                           |
| `f-5bd9552-origin-scan-static-forms`           | medium   | `fetch("https://x")` in built output is reported as a "mention" and passes               |

`f-tip-prd-stale-selection-status` was repaired by document edit before any decision was taken; what it still
owes is the **oracle**, which is item 4 below. `f-bd87655-x25519-support-floor-omitted` is partially closed and
owes a dated evidence table; `P-5` decides the discipline for it and item 5 writes the discipline down.

## The shape all three share

**A check that classifies by matching a list silently passes whatever the list does not name.**

- `checkSeparation()` buckets with `filter(r => r.path === want)`. `both` matches neither, so it is in neither
  set, so it cannot be in the intersection.
- The origin scanner fails on seven literal fetch syntaxes and logs everything else as a mention.
- Both WebAuthn verifiers read `type`, `origin` and `challenge`, and the fields the specification adds for the
  relying party to judge are not in the list.

**In all three the missing case is not exotic** — a typo'd path value, a `fetch()` call, a delegated iframe —
and in all three the check prints a conclusion broader than the thing it tested. That is why `P-5` states the
rule as _checked in both directions by something that is neither of them_: a list-matcher checks one direction
and only over what it was told.

## Stages

|       | Stage                  | Output                                                                                                      | Status                                                     |
| ----- | ---------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| **A** | The policy objects     | the `path` enum and what it means, the embedding predicate, the origin claim's scope, the dated observation | **done** — [`A-policies.md`](./A-policies.md)              |
| **B** | Normative construction | TRD §§10.9/10.11/13.2/13.9–13.10                                                                            | **done** — §13.10 gains the enum, §10.9 the narrowed claim |
| **C** | Selection rows         | rows 1, 12, 14, 17                                                                                          | **done** — rows 1, 12, 14, 17                              |
| **D** | Executable evidence    | four checks, each mutation-tested                                                                           | **done** — 4 checks, 20 mutations                          |
| **E** | Product surface        | PRD §7.12, and the status reconciliation's oracle                                                           | **done** — §7.12 gains the rule the three findings share   |

### What Stage D built, and what the checks found while being written

**Four checks, twenty mutations, all caught but one that is the stated limit.**

| Check                        | What it now refuses                                                                                                                                            |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `checkSeparation`            | `both`, an unknown label, a `none` role naming a real primitive, a genuinely shared primitive, an emptied sync path                                            |
| `checkSuiteDocuments`        | row 1 §3's sets disagreeing with `SUITE_1` either way; a §13.10 path outside the enum; the sync row not naming its primitive                                   |
| `checkEmbedding`             | `crossOrigin: true`; a present `topOrigin`; and it accepts an omitted member, which is a separate test                                                         |
| `check-selection-status.mjs` | a stated count disagreeing with the table, a PRD sentence contradicting the register either way, a row in both halves, a citation to a row that does not exist |

**Three things were found by writing the checks rather than by the review.**

**Row 1 §3's set claim had been stale for some time.** It listed four asynchronous primitives; the suite has
six. ES256 arrived with row 12 and HPKE with row 10's wraps, and neither edit came back to the sentence that
publishes the separation argument. It is a table now, because the HPKE ciphersuite carries its own commas and a
comma-separated sentence cannot hold what the rows grew the suite into.

**The register's own arithmetic was wrong, three times, from one mistake.** §15 said _eighteen rows are
selected_ while §15.1 has always listed seventeen — the prose counted row 20's closed half and the table did
not — and row 20's cell inherited it as _sixteen carry a generated vector file_ where fifteen do, since rows 16
and 17 are the two the same sentence excludes. **Wrong once, propagated twice, green throughout.** A count
stated in words beside the table it describes is the smallest possible version of this action's subject, so the
check reads the table.

**A mutation found the scanner still could not see a WebSocket.** Inverting the default was not enough:
`ANY_URL` matched `https?` only, so `new WebSocket("wss://…")` passed the inverted check as cleanly as it passed
the old one. The scheme list is now one place rather than seven. The same mutation run then produced a false
positive — the app's own error string _"must be ws:// or wss://"_ parses as a URL whose hostname is a comma — so
a host now has to look like a host, and that heuristic is written down as one.

**One mutation deliberately survives.** `fetch("https://" + "third.example" + "/x")` passes, and no static scan
can catch it. That is the residual CSP covers, and it is why A1's claim shrank rather than the check being
tuned until the sentence came true.

### What Stage E changed

**§7.12's invariant gained its second half.** _A threat table does not make a claim true_ was already there;
what was missing is that **a passing check does not either, if the claim is larger than the check** — which is
harder to see, because the evidence is real and simply covers something narrower than the sentence beside it.
All three findings in this action are that, and §7.12 now names them as one failure with one rule: a check's
conclusion states what it tested, and where it cannot test the whole claim it names what covers the rest.

**Test 14 gained its division of labour.** The build fails on any remote origin appearing literally in shipped
output; CSP covers what is assembled at runtime; and _origin checks_ now explicitly include the embedding
policy, with the verifier and `frame-ancestors` stated as independent on purpose.

## Not in scope

- **The CSP profile's exact bytes and its as-built readback** — row 17 and `L-4`. `P-5` selects the control and
  names what it covers; serving it is a deployment.
- **The X25519 evidence table's contents**, which need a dated external source this action may not have. The
  discipline is written either way, and an empty table under a stated rule is the correct state until then.
- **`S0-8`'s traceability matrix.** `P-5` gives it a criterion; building it is that action.
- **`docs/decisions.md`'s dated entry carries the same wrong count** — _eighteen rows are selected_ — and is
  left alone deliberately. It is a record of what was concluded on a date, not a normative claim, and rewriting
  it would erase the fact that the count was wrong when it was written. That belongs to `H-1`'s append-only
  historical ledger.
