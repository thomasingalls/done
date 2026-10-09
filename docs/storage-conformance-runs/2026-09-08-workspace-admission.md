# Workspace command admission execution — 2026-09-08

**Scope:** bounded phase-seven workspace command/history integration over the real ordered owner and
factor-unlocked encrypted carriers. Phases five and six were committed as `0b5337a` before this work.
This phase remains a component checkpoint; see [workspace-admission.md](../workspace-admission.md).

| Run | Cases | Assertions | Mutants detected | Exit |
| --- | ---: | ---: | ---: | ---: |
| [Workspace integration](./2026-09-08-workspace-admission.json) | 10 | 62 | 4/4 | 0 |
| [Goals editor regression](./2026-09-08-workspace-editor-regression.json) | 12 | 61 | 3/3 | 0 |
| [Ordered admission regression](./2026-09-08-workspace-admission-regression.json) | 15 | 64 | 6/6 | 0 |

Canonical local outputs are `test-results/workspace-admission/final/report.json`,
`test-results/editor-admission/workspace-regression/report.json` and
`test-results/admission/workspace-regression/report.json`. Saved JSON preserves their parsed contents.
The workspace runner freezes 77 production source files and records source, contract, fixture and guide
hashes. All runs use Chromium 151.0.7922.34 / Playwright 1.62.0 on macOS arm64, Node 26.8.1 and Vite 8.1.5.
Browser requests outside the fixture origin are refused. Identities and receive-authority callbacks are
synthetic; these runs do not implement Account verification or certify copied-profile platform behavior.

## Executed boundaries

Real Goals/card CodeMirror surfaces share one accepted workspace history. Native card typing followed
by a move can be undone from Goals, and a Goals edit can be undone from the card surface. Export uses
accepted state. Undoing initial card creation preserves the system-created day. Close clears/disables
both mounted surfaces and refuses export. Known damaged journalling likewise disables ordinary surfaces
and export while retaining the unreadable carrier.

A refused journal append and gated native encryption keep a move, its history and queued native Goals
input private. An actual IndexedDB content abort preserves that accepted prefix; retry completes the
move and following input. Renderer death then recovers both offline with fresh runtime history. A
separate crash before a forced undo commits recovers the previously accepted move, not the private undo.

The actual BroadcastChannel handshake supplies the second tab's actor initialization to the already
open tab. A subsequent move remains private at the receiving tab until its own content transaction
completes; a dependent move waits behind it. Both tabs converge, and after both renderers die a fresh
factor unlock recovers the accepted result offline. This is participating same-origin coordination,
not reliable delivery, Account authentication or a large-snapshot protocol.

Bulk movement, membership repair and metadata changes do not create human content undo entries.
Corrupt membership input is received through the durable path, then the adapter admits a system repair.
Local undo after a committed remote insertion preserves that insertion. Private history forks support
undoing an edit inside a removed-and-restored nested card, followed by repeated redo/undo. Existing
capacity, freeze, split and merge behavior runs through the adapter; a business `null` receipt is preserved.

Actor/schema initialization completes its content barrier before the factory returns a facade or mounts
an editor. An aborted initialization exposes failure without mounting. Fresh open after renderer death
recovers the initialization and opens with no human undo entries. This tests application-content
initialization under existing custody, not complete Local/Account genesis, store classification or indexing.

Four source mutations independently expose pending history, include system bulk work in human undo,
include received text in human undo, or omit local-only Yjs Item.redone links. Each fails its named
assertion on the passing baseline. A timeout or infrastructure error does not count as mutation detection.

## Corrections and verification

The initial run passed eight of nine scenarios and detected four mutants; its remaining scenario had a
fixture typo (`name` instead of the export entry's `path`) and is not credited as a passing run. A complete
ten-case run then passed. Final code review found that nullish fallback changed legitimate `null` command
results to `false`; a unit test and browser assertion now discriminate that receipt and the final workspace
run covers the correction. The recorded editor/owner regressions preceded only that workspace receipt
correction. Their executed shared/editor/owner source files still match; the workspace receipt module
is outside those regressions' import paths.

Full Vitest passes **607 tests / 51 files**, including **19** workspace tests using the real admission
owner and controlled carriers. Type checking, focused lint/format, build/budget/origin, sixteen vector
generators/AAD, WASM verification and relevant contract/governance/traceability checks pass. Initial JS
remains **306.3 kB / 350.0 kB** gzipped. The literal full check chain, geometry and separate unchanged
journal/content/custody/lifecycle browser suites were not rerun. `storage:workspace` is in the check chain.
The regression editor profile ran alongside other checks; its timings are not new performance evidence.

## Limits and next boundary

The workspace history uses version-sensitive Yjs internals, retains deleted runtime content with gc:false,
and adds a second full-document preparation clone. No zeroization, memory bound, whole-history proof or
low-end interaction budget pass follows from these tests. History is runtime-only and fresh after reopen.
Large structural/bulk/undo output remains subject to the 16 KiB encoded-delta guard; general slicing is
still needed. Native IME/platform and complete input-to-paint acceptance remain open.

The default application's React workflow controls, startup, plaintext persistence and legacy provider have
not switched to this facade. Full owned startup/classification/clear, scoped identity/index onboarding,
legacy migration/cutover, exact trim, Account receive authority, factor/transition/reference composition
and independent/platform review remain owed. Evidence cells and matrix pins can advance without paying
these obligations or changing debt statuses. L-2's independent progress record is unchanged.
