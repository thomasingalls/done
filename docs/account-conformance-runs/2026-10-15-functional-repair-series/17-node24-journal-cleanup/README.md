# Phase 17 — Journal teardown on pinned Node 24

Parent overlay: `414694f3f26de03d380912ef94c7d87c576c1983`. No runtime or worker policy changes.

A fresh default full unit run on pinned Node 24 reaches 151 files: 1,777 cases pass, one existing case skips, and two cases fail only in the shared teardown's bare `localStorage.clear()`. Both case bodies intentionally refuse before installing a storage double. Node 24 lacks that global, while the existing Node 26 setup supplies its placeholder replacement.

Use optional access on `globalThis.localStorage` in teardown only. Do not inject storage into the early-refusal cases, remove either case or change any retained-key, retry-budget, cancellation, crypto, disposal or no-write assertion. All nine journal cases then pass, followed by the **unchanged default-worker** full pinned-Node run: all 151 files, 1,779 passes and the same one skip. Lint/format/inventory pass; source and full JSON reports retained. This proves the fixture correction independently of the later worker policy.

Planning stays 855/314 blocked; qualification remains paused. No application/service/protocol changes, signing, commits, publication or preview update.
