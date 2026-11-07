# Phase254 — input delay precedes browser event creation in this diagnostic

2026-10-30. Single frozen253 same248source/WARM1/withheld native journey, no source/asset changes.
Original functional/archive/same-profile offline-cold/no-reinjection guards pass. End-to-end local
input25.166ms p95 FAILS16ms; max71.156. Peer1477.623ms p95, all markers1017.714/1210.532/1586.576ms
pass2.5s. Backlog136.372s. Diagnostic instrumentation earns no acceptance credit, no old fail erased.

Actual Window metadata:244input events (120keydowns plus finalEscape and123beforeinputs),148event-
timing entries,14rAFgaps>20ms, zero LongTask entries, zero overflow. Both event/longtask APIs supported.
Same-Window raw event creation→keydown p950.6ms/max1ms; keydown→beforeinputp950.3/max0.5ms;
beforeinput→DOMp950.7/max1.8ms.17unambiguously matched slow-keydown EventTiming entries have queue
p950.6ms, processingp950.3ms; unmatched/censored entries stay missing, not zero. Event durations16ms
include presentation/rounding and are not CPU durations. Supported LongTask observation finds no
>=50ms task, not proof that all shorter UI work or physical-device problems are absent.

Offered-command→browser event creation upper p9524.066ms/max69.957ms accounts for most of the
end-to-end tail. Eight keys exceed16ms; four overlap driver heartbeat gaps. Driver loop max169.214ms.
No synchronous save interval overlaps a slow key; observed request-metadata handler max0.135ms.
This rules against those two specific synchronous handlers as the dominant per-key tail here,
not all driver work. Remaining delay can be in Playwright/client/server IPC, CDP/Browser process
routing or host scheduling before input creation. Do not rewrite application coordination based
on this measurement alone. Original user-reported mobile/refocus stalls are not disproved.

Independent pairing checks every trusted/focused/visible event against its actual command/clock
brackets; same-Window stamps avoid cross-clock assumptions. Diagnostic observers/extra allocations
can affect timing, one journey cannot identify a population cause. All original25/38ms failures
remain failed. Exact own container/browsers absent, no raw targets/keys/writing/factors/proofs stored.

Clear next experiment: balanced within-journey keyboard delivery crossover (Playwright keyboard
versus native CDP keyDown/keyUp), identical true characters/actual trusted events and original
Node-offer→DOM gate. Hold app/server/fixture/cadence/observers fixed, deterministic paired assignment
and all archives/security/deadlines. This diagnoses measurement delivery, not a product repair,
not replacing input time with post-event processing or an easier profile. No release preparation.
