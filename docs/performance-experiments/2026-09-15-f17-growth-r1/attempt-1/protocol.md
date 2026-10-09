# F-17 application growth diagnostic — prospective protocol

2026-09-15; signed base ac0b84ce. Decision: prioritize workspace-wide publication/repair versus retained-history copying using the selected R3 experimental combination. This is the first bounded phase of the accepted architectural plan; no optimization, default activation or release gate is included.

## Design and estimands

A fixed 2×2 descriptive browser benchmark:300 versus600 seeded cards (20 versus40 days,15 cards/day,400 Goals lines), crossed with retain versus clear runtime undo history after1,000 trusted editor keys. Two fresh sessions per cell, in opposite orders:300-retain,300-clear,600-clear,600-retain;600-retain,600-clear,300-clear,300-retain. Each session has its own encrypted Local store, factor and browser. Use the identical selected R3 patch above the signed base, with an identical build-only diagnostic hook and Local snapshot activation.

Primary estimates: within-size paired deep-block session-median ratios for retained versus cleared history, and within-history-condition paired deep-block ratios for600 versus300 cards. Report individual pairs and median ratios. Early/deep within-session ratios are secondary descriptive growth observations:document and history grow together there, so these cannot isolate undo cost. No percentages are added across experiments.

Assignment/exposure and analysis unit:fresh browser session; observation:key. Keys within sessions are dependent; both repeat blocks share one host/browser configuration. This is an engineering diagnostic, not a powered population-effect or handset study. Two repeats per cell constrain drift checks, not statistical confidence. Positive timings are potentially heavy-tailed; use medians and80-sample p95 descriptively, without normality assumptions, p-values or pooled-key confidence intervals.

## Workload and measurement

Use pinned installed Chromium151, Pixel7 settings,1280×900 viewport. Preserve the existing trusted-keydown-to-rAF-plus-task recorder byte-for-byte; report it as a paint proxy, not actual display presentation or isolated CPU work. Do not subtract control quantiles. No phone run or new physical-device conversion is included.

UI-seed and cold-verify the full corpus with the existing helper. Add and focus one explicitly identified scheduled card containing an emoji. Initial UI/setup runs unthrottled. At CPU4, type8 warmup and80 early measured keys, with50ms requested gaps. Unthrottled, type912 additional keys through the actual editor with no requested pause; these prepare the1,000-key state and are not timed samples. Log progress every100 and verify exact text periodically. This accelerated setup does not reproduce prolonged CPU4 load, thermal behavior, natural typing cadence or lifetime GC pressure.

Drain admission before the intervention. In clear sessions, call only UndoManager.clear() on the accepted gc:false history; preserve selections/group/document/canonical state. In retain sessions, inspect/drain without clearing. Both use the same out-of-band census/hash/full-match checks. Then at CPU4 type8 warmup and80 deep measured keys with50ms gaps. Recheck actual undo/redo depths, selection-target count, integrated struct/client/deletion counts, encoded bytes, document digest and visible content. Avoid census/hash/full-verification inside measured key loops. No CPU/allocation profiler or forced GC runs in timing sessions.

Each session has160 measured keys and1,088 total diagnostic keys (928 untimed). Eight sessions total1,280 measured and7,424 untimed keys. Record all80-key samples and achieved depths; initial setup commands may add a small constant to undo depth. Verify that each diagnostic key adds one undo group before using the results as a history contrast. Warmups and measured keys after clearing must recreate only their88 new groups.

## Intervention validation and safety

The hook exists only in the disposable build, requires loopback, exposes copied scalar facts/hashes and a history-clear operation, and never returns documents, keys or mutable history references. It calls existing owner liveness/durability gates. Before/after clear, require identical canonical bytes, history-document bytes, visible snapshot excluding undo/redo, selections, group, writer and revision; zero undo/redo; complete canonical/projection match. Any mismatch stops the session. Captured buffers are erased after hashing. Counters observe actual pinned Yjs fields, not assumptions about key counts.

Before the campaign, run focused real-Yjs hook checks for retained inspection, history-only clear, closed use, no-op clearing and document mutation during clear. Both faulty clear implementations must refuse. Run one small disposable browser smoke (2days×15cards,40 growth keys,4+8 keys per measurement block) through both branches. Smoke is excluded from performance analysis. Any hook/setup repair retains the original failed evidence and a protocol amendment before main measurements. No test/build/profile overlaps main timing.

## Correctness, bounds and stopping

Require exact editor text after each measured block and after growth, successful one-key undo/redo after the deep block, exact text after lock/unlock and no page errors. Initial corpus verification covers all days and Goals; compare full visible content before/after clearing as well. Context/browser/server must close. Per-session hard bound240seconds with watchdog and parent cleanup; batch stops at the first nonzero result. Preserve partial samples, errors and all valid slow sessions. No automatic retry or extra favorable sampling. New attempts after a diagnosed harness failure get new identities.

## Interpretation and decision

A consistent workspace-size effect directs the next bounded phase toward membership repair and incremental publication. A consistent retained-history effect raises persistent history buffers in priority; full verification stays during that prototype. Both effects can coexist. Mixed/inconclusive results preserve the accepted architecture plan and justify narrowly targeted profiling; they do not establish absence of scaling. There is no fixed speedup threshold or shipment decision in this diagnostic.

The clear intervention measures the total effect of removing runtime history, including retention/GC and copying, not an isolated fork function. Separate sessions have different random actor/item IDs. Size conditions change days/cards together and therefore estimate corpus-size cost, not an independent card/day coefficient. Reversed order reduces but cannot eliminate drift. Accelerated history setup, append-only typing, fixed edited-card growth and missing remote/delete/redo workloads restrict generalization. No strict O(edit) proof, broad long-session capacity, malicious-member behavior, memory bound or release budget pass follows.

Main runtime/tests/defaults, previous evidence, the root perspective and unrelated files, personal browser/app/server, relay, phone and deployment remain unchanged. Keep618 obligations,263 files/2,121 dispositions(11N/A),0test-file/96command/63campaign unresolved. After this diagnostic, separately address membership eligibility and incremental publication, then persistent text-history buffers with full verification, then incremental verification's proof and policy. Each remains bounded and reversible.
