# Local input-latency diagnosis

Prospective pilot, 2026-09-14, application base `dbc64150`. This diagnostic informs which
part of the card path to repair. It cannot qualify performance or revise the existing budgets.

## Measurement and comparison

Use the owned disposable packaged application and the existing verified corpus: 20 days ×
15 cards and 400 Goals lines. Keep desktop and Android-emulated CPU 4x as separate observations
on this host; both use the seeded editor's 1280×900 viewport. Build plain textarea and bare
CodeMirror controls separately, using the same installed CodeMirror versions without application
admission or decorations. Controls use their own disposable context with service workers blocked;
the application context retains its normal service worker. Assert the control title and both input
surfaces before sampling, so an app-shell navigation fallback cannot become a control. This separate entry must not change the application's chunk graph.

Collect two blocks of 120 trusted keydowns per surface at the existing 50 ms gaps. Block 1 is
textarea, bare CodeMirror, admitted card; block 2 reverses that order. Retain every raw latency
and report nearest-rank p95 per block. The recorder stays unchanged: browser event timestamp to
requestAnimationFrame followed by a task. This is a paint proxy; it does not establish that the
specific character was presented. Assert exact sample counts and resulting text independently.

The unit of observation is a keystroke; the analysis unit is a surface/block within a browser
session. Keystrokes share state, scheduler, CPU and GC, so they are not independent replicates.
This is a descriptive measurement pilot, without confidence intervals or a claim of power.
Two reversed blocks expose gross order effects but cannot identify causal effects or host variance.
Do not subtract the control p95 from card p95 or interpret it as a per-key causal overhead.

After unprofiled timing, take a separate 60-key card CPU profile and a profile over ten card
focus/close cycles. Sampling interval is 1,000 microseconds; retain raw samples and source-mapped
call locations. Hidden source maps are generated only inside this disposable diagnostic build.
Profiles include automation waits and profiler overhead: examine active call stacks, not percentages
of the entire elapsed window. Missing samples/maps, functional failures, retries or skips refuse
the run. Verify all added writing after lock and cold reopen.

## Decision and limitations

If controls approach the 16 ms budget, the recorder/scheduler floor needs a separate contract
disposition before claiming sub-frame latency. If the admitted card remains clearly slower in
both blocks, use profiles to select a hotspot; a repair must preserve synchronous encrypted
admission, refused-input staging, undo and delivery-order semantics. A hotspot is a candidate,
not proof that removing it causes an improvement. Compare any repair using the same diagnostic
and then the original unchanged application gate. Retain negative and mixed observations.

The ideal comparison uses independent fresh sessions and multiple physical low-end devices;
this pilot intentionally answers the narrower question of where to investigate on this host.
Background load, JIT/GC, profile perturbation, accumulated card text, tab activation and differences
between the minimal controls and full app remain threats. No handset, Account-path, large-history
capacity or release claim follows from a passing diagnostic. Stop at the fixed sample counts;
do not repeat until a desirable timing appears.

Run `node scripts/release-validation/execute.mjs --selection browser-latency-diagnosis`.
The ordinary `browser-application-latency` selection remains the independent budget gate.
