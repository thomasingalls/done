# Goals editor admission execution — 2026-09-08

**Scope:** phase-six Goals text integration over the unchanged phase-five admission owner and real
factor-unlocked encrypted carriers. This is a development checkpoint, not application cutover or L-1
closure. See the [component contract and limits](../editor-admission.md).

## Recorded runs

| Run | Cases | Assertions | Mutants detected | Exit |
| --- | ---: | ---: | ---: | ---: |
| [Editor integration](./2026-09-08-editor-admission.json) | 12 | 61 | 3/3 | 0 |
| [Admission regression](./2026-09-08-editor-admission-regression.json) | 15 | 64 | 6/6 | 0 |

Canonical local outputs are `test-results/editor-admission/final-03/report.json` and
`test-results/admission/editor-regression/report.json`. The checked-in JSON preserves their parsed
contents. The editor runner records 91 input hashes, freezes the production source it serves, and rejects
external browser requests. Both runs use Chromium 151.0.7922.34 / Playwright 1.62.0 on macOS arm64,
with Node 26.8.1 and Vite 8.1.5. No supported-device population or OS/power-loss claim follows.

## What executed

The actual CodeMirror view and application Markdown styles render accepted Goals text. Real keyboard
input, formatting, undo/redo, cut, task-widget clicks and multiple-caret editing traverse the new semantic
command adapter. Clipboard-event paste exercises the production paste handler. The existing Markdown
export functions read the accepted projection. Storage refusal with a native crypto gate keeps later
typing/paste private, withholds accepted history/export/outgoing bytes, and exposes retry. Actual content
abort and retry complete the ordered `ABC` input. An actual renderer crash before forced completion
recovers only the previously accepted `base` prefix; successful retry and paste recover offline after
crash. Unicode paste slices share one runtime undo step.

Remote content commits before editor publication. Undo rebases over a received insertion and preserves
the remote writer. The actual BroadcastChannel adapter delivers accepted bytes between two initially
empty open tabs; the receiving tab withholds both receive and dependent input until its local commit,
then both editors converge and the result reopens offline. Channel scope and its required caller-supplied
validator do not implement Account-envelope authority or reliable network retransmission.

Known journal damage clears/disables the ordinary editor and refuses ordinary export while retaining
the damaged carrier. Explicit close likewise clears the editor and disables contenteditable. The prior
admission regression re-exercises pending structs/delete sets, exact forced retry, byte bounds, barriers,
timer, actual crash, close/drain, malformed persisted Yjs and repair refusal.

CDP `Input.imeSetComposition` supplies Blink preedit; `Input.insertText` supplies a final composition
commit. Neither preedit nor a refused final commit enters accepted text/history. The final commit appears
once after content completion and subsequent typing works. This exercises Blink's event path, not a real
Japanese input method, native candidate-window UX, mobile keyboard or dead-key population.

The three editor source mutations publish history before the receipt, publish ordinary view text before
the receipt, or include remote changes in local undo. Each fails its named assertion on a passing
baseline. The six earlier owner mutations are all detected in the separate regression.

## Preparation profile

Each sample times `prepareIntent`, including a new writer-id allocation, full canonical clone and one
end insertion, then discards the candidate. It excludes the command/history adapter, journal encryption,
storage, DOM projection and paint. Five warmups precede each series. Quantiles below use nearest rank;
raw samples and generated-state byte counts are in the editor JSON. There was no concurrent tool-run
build or test workload during this recorded profile, but host/background activity was not controlled.

| Synthetic Yjs shape | Visible UTF-16 units | Samples | p50 ms | p95 ms | Max ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| One compact text item | 1,024 | 50 | 0.1 | 0.2 | 0.7 |
| One compact text item | 102,400 | 50 | 0.2 | 0.3 | 0.9 |
| One compact text item | 1,048,576 | 50 | 1.8 | 2.7 | 6.0 |
| One writer, 2,000 middle inserts | 10,000 | 50 | 2.4 | 2.8 | 4.8 |
| 2,000 distinct writers, middle inserts | 10,000 | 30 | 5.6 | 6.1 | 6.5 |

The last shape is intentionally extreme. These are scaling diagnostics, not population estimates or
evidence that the complete <16 ms p95 keystroke-to-paint budget holds. Full cloning remains a preparation
cost to resolve before low-end/editor acceptance. The budget and release debt remain unchanged.

## Development corrections and checks

The first development run exposed a missing final-composition route: reconciling provisional DOM text
could make Blink end preedit without `compositionend`, then emit non-composing `insertText`. The adapter
now admits that final event too. This fixes the tested lost commit; native preedit presentation remains a
platform-validation obligation. The cross-tab oracle initially expected `RL`; CodeMirror's existing
caret mapping leaves the cursor before the remote insertion, so the actual valid result is `LR`. That
oracle was corrected without forcing a caret policy into production. The task-widget fixture also needed
the real application styles and an inactive line before a visible checkbox could be clicked. An
intermediate final-02 run was intentionally interrupted to resolve the channel's ArrayBuffer typing and
ownership check; none of those nonpassing/incomplete runs is credited here.

Full Vitest passes **588 tests / 50 files**, including 14 command-adapter tests using the real admission
owner with controlled carriers. Type checking, focused lint/format, production build, bundle/origin,
vectors/AAD, WASM verification and relevant contract/governance/traceability checks pass. Initial JS
remains **306.3 kB / 350.0 kB** gzipped because the default application path has not changed. The literal
full `pnpm check` chain, geometry and separate unchanged journal/content/custody/lifecycle browser suites
were not rerun in this phase; the full admission browser regression was run. `pnpm storage:editor` is wired
into the check chain.

## Remaining boundary

This facade owns one Goals history stream. Card/workspace mutation and actor-scoped cross-surface undo,
actor initialization and repair, full startup/classification/clear/migration, Local/Account onboarding,
exact trim and Account receive authority remain subsequent work. Large undo/redo or fragmented deletion
output can still exceed the interim 16 KiB guard and require a bounded operation adapter. Native IME
acceptance, preparation optimization and complete input-to-paint measurements remain open. The current
application still uses its previous persistence; no real-data cutover, release obligation or debt is paid.
