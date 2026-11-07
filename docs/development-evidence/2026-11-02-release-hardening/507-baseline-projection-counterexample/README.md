# Phase 507 — interrupted baseline projection counterexample

Five deterministic cases use the canonical content owner, real protocol crypto, IndexedDB and a reduced v5 baseline. An interruption is injected after private continuation advances but before the fresh-context check installs its detached projection. Independent forced full replay is the oracle.

Before repair, three cases fail: a newly durable unallocated source disappears from the retry's logical catalogue; the logical delivery frontier remains 1 instead of 2; and a second interrupted recovery still returns the stale source view. Both controls pass: a completed continuation agrees with full replay without a disk reload, and an interrupted unchanged identity retains its valid warm view. The five-case run took 1.51 seconds (509 ms tests). The earlier four-case run is retained too.

The counterexample supports phase 506's source-selection diagnosis. It does not claim a repaired browser journey or acceptance credit. No existing test or app source changes in this patch. The next bounded repair discards the carrier's private view when a returned logical continuation cannot finish its fresh check; every authority, counter, byte, crypto and commit check remains.
