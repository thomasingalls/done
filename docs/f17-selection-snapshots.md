# F-17: ownership of reusable selection snapshots

Contract and baseline-control phase, September 15, 2026, above signed `0c84e5cc` and the
uncommitted private Local handoff. The [candidate profile](./f17-local-profile.md) attributes
172.4/778.8 ms desktop/CPU-4x Android to undo-stack copying over 60 keys. This motivates avoiding
repeated selection-metadata cloning; it does not predict a passing application budget.

This phase specifies the private component and strengthens tests against the current copying
implementation. It neither implements snapshot tokens nor enables metadata reuse. Existing
Local and Account defaults, generic fork isolation, complete comparison and admission order remain.

## Existing observable behavior

`prepareWorkspace` forks the accepted history and copies its selected positions before running
the next command. It saves the first `before` selection map of a human group and replaces `after`
after each change. Undo/redo copies the popped item's metadata to the opposite stack and restores
detached selections from its appropriate map. `forkWorkspaceHistory` clones each item's complete
metadata graph independently with `structuredClone`: within-item aliases survive; mutable nodes
are not shared across source/fork or across separately copied items. Callers of the text port get
fresh absolute selection values, never the history's relative-position objects.

The history document, undo/redo arrays, insertion/deletion ranges and redone links stay detached.
The proposed reuse concerns only privately captured selection snapshots. It is not a cache of
verification, a change to persisted/wire data, a new public API or permission to truncate history.

## Proposed private component

Create one selection-snapshot owner per workspace lifetime. A component-issued token is an opaque
object whose payload lives in the owner's private weak map. The token carries no positions, IDs,
selection map or mutable payload fields. Neither TypeScript readonly nor `Object.freeze(Map)`
is sufficient: Map methods and nested objects remain mutable. Isolation comes from capture and
non-exposure, not from a shallow freeze or a shape/brand supplied by the caller.

| Operation | Contract |
| --- | --- |
| Capture selection map | Synchronously clone the complete supported selection graph once, validate that detached value, store it privately and return a fresh token. Input mutation afterward cannot change the snapshot. A throw publishes no token. |
| Fork owned metadata | Allocate a new outer metadata Map. Reuse only tokens recognized by this live owner. The full private metadata schema contains only optional `before` and `after` entries; empty metadata is valid. |
| Restore token | Require this live owner's token and return a fresh, fully detached mutable selection graph. Repeated restores share no mutable nodes; each preserves its own internal aliases. |
| Replace group `after` | Capture a new token and replace only the candidate item's entry. Keep the group's original `before`. Never change a token's payload. |
| Undo/redo | Transfer recognized tokens into a fresh destination metadata Map; restore through the owner. Pop, redo clearing and branch disposal cannot invalidate tokens still held by another live history. |
| Close owner | Invalidate every token operation and release the owner map. Retained tokens cannot revive an owner or work in a later workspace. Close is idempotent. |

Owner recognition must use object identity in the private registry. Reject reconstructed,
structured-cloned, foreign-owner and post-close tokens. Do not accept a matching string ID,
brand, owner field, prototype or payload shape as authority. Do not use a global token registry.
Garbage-collection timing is not part of the contract: weak keys allow otherwise unreachable
tokens/payloads to be collected, but tests must not claim reclamation from a nondeterministic GC
observation. The owner must not retain a strong enumeration of every issued token.

No per-fork release invalidates a shared token. Accepted, pending and sibling histories may retain
it independently. Clearing/discarding one history releases only that history's references; it must
not erase a payload another live history needs. On close, owner invalidation must follow the
workspace's existing lifecycle boundary so no permitted in-flight work still needs a restore.
Late work after terminal close must not publish or regain access. Exact write-byte leases remain
the admission owner's existing responsibility.

## Generic compatibility and integration boundary

Keep the current generic `forkWorkspaceHistory(source, origin)` contract and native cloning for
arbitrary structured-cloneable metadata, including cycles, Maps, typed arrays, accessors and
aliases. Frozen/lookalike objects still receive the generic detached clone. The private path must
be an explicit owner-bound capability; it cannot silently infer ownership from generic metadata.

Within that private path, refuse foreign/unrecognized tokens and unexpected metadata entries
before admission. Do not structured-clone an unknown token as a fallback: that would destroy its
identity and defer failure until a later undo. A separately selected generic history continues
to use the generic clone as a whole. Mixing modes in one live workspace requires an explicit
conversion contract and is outside the first implementation.

Before registering the capability, associate histories with the correct live workspace owner.
The same owner may serve its accepted/pending/sibling histories, but an unrelated workspace may
not reuse them. A component handle grants only metadata operations; it never exposes a Y.Doc,
canonical state, acceptance authority or carrier buffers. Preserve the current revision/job/slice/
writer handoff checks and complete post-promotion comparison.

The first component implementation is unmounted. Subsequent integration opts into the private
Local handoff only and converts all metadata producers/consumers together: group capture, fork,
undo/redo transfer and restore. Account capture and default activation remain separate gates.

## Baseline evidence in this phase

Before implementation, strengthen the current real runtime with:

- 96 generated branch histories retaining source, sibling and descendant forks. Check native
  graph equivalence, nested mutation isolation and continued restoration
  after another branch clears or destroys its history. Keep both undo and redo metadata live.
- A directed generic frozen/lookalike-metadata case: superficial immutability or owner fields
  must never authorize sharing.
- 80 generated master/card command histories under each current preparation strategy. An
  independent string/selection/undo ledger checks edits, remote prefix insertion, failed writes,
  exact retry and discard, undo/redo, public selection mutation and cold replay. A fixed prefix
  exercises each boundary before the generated suffix, so generation cannot omit it.
- Deliberate shallow metadata sharing and stale `before`/`after` capture must fail the relevant
  new assertions. Retain exact mutations, logs and any fixture counterexamples.

Run the affected files and existing workspace-command/selection regressions through the owned
Vitest adapter, retain exact registration additions, and check types, scoped source style,
inventory/manifest coverage and runner denominator controls. No native or timing rerun is needed
for this contract/test-only phase. Preserve earlier evidence, all runtime bytes, the 52 personal/
vector pins, append-only record prefixes and the other seat's progress.

## Gates for the following component phase

The baseline tests cannot prove properties of an unimplemented owner. The component needs direct
capture/restore and graph-isolation tests; owner/forgery/clone/closed-token rejection; failures
mid-capture; repeated restore; group before/after replacement; cross-item and cross-branch lifetime;
and no-strong-registry review. Fault controls must expose nested sharing, foreign-token admission
and invalidation while a live branch still retains a token. Compare restored values against native
cloning; an independent ledger must judge lifecycle outcomes rather than the component itself.

Then integrate only after component checks pass, preserving the baseline/reference and generic
tests. Run generated and native pending/delivery/workspace admission gates, including retry,
discard, slicing, close and reentrancy. Before measuring, pin a balanced reference/candidate
whole-command comparison and useful-improvement rule; run the unchanged application gate only
after those pass. Keep the existing failed gate and rough 1.5× Pixel planning estimate. F-17,
the 96 command / 63 campaign obligations and immutable qualification remain open.

## Baseline phase outcome

The six owned suites pass all **118 cases**, with no skips/retries and every process group drained.
The two modified files contribute 73 passing cases: 17 pending/history cases and 56 workspace
cases. New properties run 96 branch histories (seed 150901) and 80 command histories under each
strategy (seed 150902). The ledger checks text, both selections, undo/redo depth, revision and
independent database+journal replay after each step. It mutates both supplied selections and public
read results to check that neither can alter stored selection state.

Three deliberate faults are detected: nested metadata sharing, empty `before` capture and stale
`after` capture. The first sharing-control attempt stopped at a prototype-normalization mismatch,
before its intended alias assertion. Capturing the fixture's initial selections with native cloning,
as production does, makes the control reach the intended mutable-source-node assertion. The original
attempt and corrected evidence remain. No production defect was identified in this phase.

All 17 selected runner/registration self-tests, TypeScript, scoped source style, inventory/manifest
and authority checks pass. Registration adds exactly four cases and changes only the denominator
self-test's numeric title beyond those additions. Every other execution contract, deadline and
exclusion is preserved. The general set is now 261 files / 2,077 dispositions (11 not applicable),
with 96 command / 63 campaign obligations still unresolved. The complete unit/native/performance
aggregates were not rerun; this is bounded baseline evidence, not a full release pass.

[Evidence](./account-conformance-runs/2026-09-15-f17-selection-contract/README.md). Next implement
the unmounted private snapshot owner and its direct capability, isolation and lifetime controls.
These passing baseline tests do not establish correctness of that future component or a speedup.


## Subsequent component checkpoint

The later [unmounted owner phase](./f17-selection-owner.md) implements these component operations
and passes its direct isolation, token and lifetime controls. The statements above about an
unimplemented component describe this earlier baseline phase. Explicit private Local integration
is now next; the editor still uses its existing metadata representation.
