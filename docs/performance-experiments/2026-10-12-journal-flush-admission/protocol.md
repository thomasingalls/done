# Journal flush admission: prospective protocol

Base: signed `7b088f80`. Storage selection removes full-history copies but the previous
three CPU-4x sessions still spent 812 ms of summed local admission waiting behind other
jobs; worst visible frame was 116 ms. This is elapsed waiting, not CPU. First capture one
profile on the current build and align numeric job spans with individual delayed keys.
Proceed only if asynchronous flushes explain meaningful remaining waits.

Candidate: allow synchronous journal admission during a timed Account flush. The flush
only copies an observed journal snapshot to IndexedDB and removes exactly those entries;
it never changes the canonical editing document. Every edit must still journal before
promotion. All foreground inputs remain FIFO; remote updates, explicit durability barriers,
and forced writes after journal refusal wait for the background copy to settle. Track new
journal growth separately, preserve the next batch deadline, and drain both flights on close.
Generic Local admission remains unchanged. No format change or change to corruption detection.

Prediction: eliminate most (target >=80%) local queue waiting in this offline typing fixture;
expect smaller frame tails, not less cryptographic/storage work. Preserve roughly the same
flush cadence, audits and copies; overlapping typing may change batch sizes and exact counts.
The experiment does not establish online scheduling, phone performance or arbitrary histories.

After diagnosis and focused safety checks, build the same source with the candidate switch
off/on. Run three fresh restored pairs AB/BA/AB, serially, without profiling or concurrent
builds/tests: 120 cards, 600+ received positions, CPU-4x, offline, 120 keys at requested 150 ms
spacing. Keep one undo stack, undo/redo all keys and cold-reopen every session. Reuse the
existing synthetic fixture; never retain its keys or browser/service state in evidence.

Assignment/analysis unit is the restored session, observations are dependent key timings.
Use session sum/max local queue wait as the primary mechanism measure, plus frame median/p95/max,
handler median/p95/max, long tasks, flush/load/audit counts and copied bytes. Quantiles use
floor(n*p). Report all attempts and individual pairs; these small repeated local measurements
estimate mechanism and magnitude, not significance or real-device generality. Keydown-to-frame
omits browser dispatch delay; trace spans overlap and must not be summed as independent CPU.

Activate locally only if safety checks pass, aggregate local queue wait falls >=80%, and
median-of-session handler median and frame p95 do not regress >10%. Otherwise investigate the
specific discrepancy and retain the switch off. Stop measurements on correctness failure.

Safety checks: exact snapshot cleanup retains concurrent suffix; explicit barriers and remote
handoffs cannot be overtaken; journal refusal still waits for durable commit; failed flush
retains all acknowledged work; close/crash before commit and after commit/before cleanup recover;
no overlapping flushes or discarded new batch timer. Test actual Account custody/storage in a
focused native fixture, plus packaged two-device delivery, undo and offline recovery. Keep
release validation paused; no publication or broad campaign.
