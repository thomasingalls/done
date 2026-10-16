# Phase 14 — Observe nonvisual genesis state independently of rendering

Parent overlay: `76780cb1265c02166c9526de313a8b877ede5b07`. No production or mutation changes.

The full old observation schedule passes its seventeen baseline cases but later controls time out. Selected four-case runs pass, so those passes alone cannot close H4. Timeout-only diagnostics captured a timed-out creation already resolved, all nine commits recorded and no held/pending locks. This distinguishes an observer scheduling failure from an established owner deadlock.

Nonvisual terminal-state, gate, harness readiness and lock-queue observations now use a 25 ms timer poll rather than the default animation-frame poll. The original fifteen-second waits, all seventeen cases, four faults, named assertions and required forbidden outcomes stay unchanged. Timeout diagnostics retain pending state/lock evidence if this fails again.

Both a functional-only owned-browser run and the stock complete Local-genesis runner pass seventeen baseline cases and detect all four intended controls. The stock runner independently reconciles 21 cases and reports its group drained. Five existing adapter/corruption cases pass; lint/diff/inventory pass. Original full failures, selected passes, timeout observations and final full results remain.

The working checkout's borrowed dependency symlinks are correctly rejected by the stock input-custody guard. The stock pass uses a disposable cumulative checkout with an existing self-contained dependency tree whose lockfile is identical; internal links remain internal and only generated launcher paths are relocated. No guard is bypassed or broadened. The manual functional owner grants no custody credit; the stock pass is bounded fixture evidence, not aggregate qualification. Planning remains 854/313 blocked. No commits, signing, publication or preview changes.
