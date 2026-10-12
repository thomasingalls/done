# Owned reservation reuse: prospective protocol

Base: signed `008b2fa9`, 2026-10-12. This is a bounded repair, not release validation.
Keep the existing receipt format, verification, caller isolation and remote admission fence.
An owned, completed sequence reservation may advance the retained counter without adding rows.
Unknown counter transitions still require a full read; every warm load still authenticates the
counter, checks count/first/last keys, runs a rolling audit and invokes semantic validation.

Hypothesis: pre-commit sync checks unnecessarily reread history after their own reservation.
Removing those reads should reduce full-load bytes and copy/comparison work. It will not remove
all old-byte comparisons, custody authentication, remote FIFO waiting or main-thread blocking.
No numerical latency gain is assumed. Mechanism success requires zero full reads caused solely
by an owned reservation in the focused test, with no integrity or isolation regression.

## Measurements and decision

Fresh restored sessions on the same desktop, CPU-4x on B, 75 ms per account request, 120 keys at
requested 150 ms spacing. Type in an unchanged roughly 400-character card, with 120 cards and
12 KB Goals present. Compare reference and candidate twice per condition, reversing arm order
in the second repetition. Builds use identical numeric instrumentation. No concurrent campaigns.

- Silent peer: both devices online, no peer edits during typing, caught up before timing.
- Active peer: same restored pair; A edits a different card ten times, every two seconds.
- Backlog: original contemporaneous pair with B 600 positions behind; open B offline, then
  reconnect just before typing. Incoming writing affects a third card, not the typing target.
  Report actual received progress and whether catch-up remained active throughout typing.
  This is a realistic condition, not a controlled same-history comparison with the settled pair.

The sessions, not their keys, are independent analysis units. Report each session's keydown-to-
visible-frame median/p95/max, logical admission wait and job overlap, long-task count/max/total,
loads, bytes copied, authority checks, received/sent progress and request refusals. Record input
event timestamp to handler-entry delay separately: it is a browser dispatch proxy, not physical
key latency. External automation pacing can itself slip; report observed key gaps. Diagnostic
CPU profiles are separate from timing repetitions and identify residual synchronous work.

Every observation must preserve all typed text, last-key undo/redo, peer writing, export equality
after convergence and cold offline replay. Refusal/stopped lanes or missed keys invalidate the
observation rather than count as an apparent speedup. Retain failed attempts separately. Stop
on a correctness failure; fix a demonstrated harness defect before a separately named rerun.

After this slice AND the planned unchanged-authority reuse slice, move to prepared remote handoff
if either online condition has p95 above 50 ms at CPU-4x, or backlog typing has p95 above 50 ms
or more than 5% of keys above 100 ms. Do not substitute a third general shrinking pass. Main-thread
work remains a separate constraint: profile long tasks and require budgeted yielding for residual
splittable receive work (aim for 8 ms slices; a native call or indivisible row can exceed that).
These are engineering escalation rules, not a claim to meet the TRD's 16 ms input target.

Two repetitions establish local magnitudes, not confidence intervals or phone performance.
Synthetic content, emulation, machine drift and instrumentation remain limitations. Alternate arm
order and retain bundle/fixture hashes. No real writing, credentials or fixture databases enter
the packet. The handoff design is recorded separately; it is not implemented by this repair.
