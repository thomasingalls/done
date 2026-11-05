# Final-dispatch fault reaches the current read boundary — phase 348

Both newly reached native dispatch cases reproduce on signed base89b11fe2: the test bundle cannot find the retired `page = canReceive()` fragment. Rebind the test-only hook to the current individual-read callback immediately before its `canReceive()` decision. Keep the one-match requirement and mutate only that decision for the dispatch arm. [Before/base/after evidence](./evidence.json).

The original native test file is byte-identical to signed base: both 45-second case deadlines, offline/pressure setup, request counts, state and close assertions remain. Ordinary code sends zero requests after the injected condition; the mutant sends one in both cases. No app/source hook or production guard change.

The complete driver campaign now passes all six stages, including both native controls and all 10 generated histories. The actual report reconciler passes with phase347's approved initial-system rule. Independently rehash all 1,547 execution source pins against the current tree and check every Stage1 application input remains unchanged. Ten inventory controls, formatting and configured lint pass, with counts/dispositions unchanged.

The Stage1 checkpoint still awaits the existing 120-second full-unit wrapper deadlines, whole-tree receipt refresh and complete reruns of previously failed nested campaigns. Diagnose unit timing with the wrapper's report environment disabled before attributing it. No deadline, budget, format, trust or runtime change; no Stage2 or release preparation.
