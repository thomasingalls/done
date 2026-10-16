# Phase 21 — Active lint scope and three existing diagnostics

Parent overlay: `f2ad5cf518997c5046d08db64bb25fb96586097b`. The full lint scan reports 157 pre-existing diagnostics: 154 in immutable evidence/performance archives and three active-source diagnostics. Every reported path is unchanged by earlier phases.

Exclude only the two immutable archive directories from lint; no test runner or test population changes. Remove two unused imports and annotate the intentional exact-length preallocation's style-only diagnostic at that one line. The recovery algorithm is byte-for-byte identical after removing the new comment; discovery differs only by its unused import. The runtime census changes exactly their two source hashes plus independently checked +1/-1 source-site line shifts; labels, kinds, site populations and every other field remain. No registry/contract/blocker change or qualification credit.

Root lint now passes. A disposable active-code unused-variable sentinel still fails lint, and removing it restores the positive result. No archived source or test was rewritten. Thirteen discovery cases (including thirty histories) pass on pinned Node 24; the separate old discovery mutation control has an absent anchor both before and after this cleanup. Preserve that red case for phase 22 rather than count it as sensitivity or blame the import cleanup.

An initial overly strict census proof rejected legitimate line offsets; the final independent offset/identity proof is retained. Formatting-only deferred work remains untouched. Inventory/plan retain 855/314 blocked. No signing, commits, publication or preview changes.
