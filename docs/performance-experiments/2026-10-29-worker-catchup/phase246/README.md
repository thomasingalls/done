# Phase246 — publication and quiet-stream work consume the marker budget

2026-10-30. Required order complete:80 signed commits161–240 (tip0ab9cbc8), then matched
comparison241/242, then separate marker attribution243–246. No product/test edits or release prep.

## What the unmodified measurements establish

In four rebuilt ABBA journeys, Page backlog230.271/226.524s versus Worker239.551/233.477s gives
matched ratios1.040300/1.030694, not the historical apparent doubling. Only two pairs on one host:
no equivalence or population claim. All local/peerp95 budgets pass, but late markers2796.092,
3719.996 and3162.018ms fail the original every-marker2500ms gate; fourth is2442.625ms.
Aggregate acceptance remains BLOCKED. Dated100s/current200s needs separate common-apparatus/
server/host isolation; no one-function attribution to Workers from aggregate times.

Original Worker02 late marker: driver observes submit at2286.668ms, submit headers2307.997,
next writer-stream read3448.958, read headers3475.707, DOM upper3719.996. Worker03:2102.505,
2116.775,2960.956,2991.721,3162.018 respectively. These are observation timestamps, not precise
physical wire arrival. Both demonstrate long publication and receiver selection intervals.

## What the isolated diagnostic adds

The corrected civil-date diagnostic passes original delivery/archive/no-extra-writing and same-
profile offline-cold/no-reinjection guards. All123 inputs trusted/focused/visible, UTCcivilOct29
cards unfrozen at explicit marker guards.14257/13268 Worker trace rows, zero dropped; actual
Worker/driver brackets roughly[-1,+1.7]ms. No source authority/check replacement. Source/asset
identity and reverse checks frozen243; harness-only collector/calendar correction frozen245.

Final marker2070.055ms; localp957.647ms,peerp951793.540ms, backlog204.904s. These instrumented
values receive NO acceptance credit and do not replace any unmodified miss. Phase244 midnight
failure remains invalid/failed: its real three-day freeze blocked the attempted late input, and
post-assertion collector placement lost detailed events. No assertion/deadline was weakened.

The final-marker trace directly shows:

- Local wake while receive is active; quiet due300.600ms later. Sending begins265ms after that
  deadline because the existing receive pass is still finishing work. The configured quiet window
  is300ms, not2s;2s is the maximum during sustained typing.
- Send delivery-status41.100ms and spool-status38.400ms, then envelope preparation382.600ms
  and submission preparation200.400ms. These operation spans remain intact; their internal
  crypto/storage subcosts are not separated here. Upload request is observed1285.012ms after input.
- Receiver gets content hint during an active receive pass. It checks quiet indexes1 and3 before
  selecting actual writer index4,560ms later. Index→hashed-stream mapping is independently
  matched against real ordered network requests. Hint clears quiet proofs; it does not identify a
  publisher or authorize reordered data. The750ms budget is often shorter than a full sweep.
- Three quiet step examples spend35.9–51.6ms before receiveNext and33.5–41.0ms after completedRead,
  inside180.7–205.6ms total steps. Actual driveReceiveStep calls receiveStatus before and after;
  the next prepareRead also performs a fresh authenticated read. Repeated native validation is a
  concrete subsequent reuse target, not permission to omit current conflict/prefix/authority checks.

Static boundary matches the trace: accountSyncDriver runs one shared send/receive pass at a time;
accountReceive's receive callback can sweep multiple empty publishers before returning. A remote
hint dirties that active lane, without preempting its stream selection. Authority/history prelude
is unchanged/near-zero at this marker, so it is not the dominant final-marker cost in this diagnostic.
This run does not reproduce the worst3.720s marker and does not prove a unique cause for every tail.

## Next bounded repair and limits

First make a receive sweep cooperatively return between verified publisher checks when a publication
is due, retaining its continuation and bounded publisher fairness. Do not abort mid-commit, reset
backoff, misreport progress, change local flushing/batching, or treat a workspace hint as publisher
proof. Add deterministic due-send/sweep/retry/authority regressions and rerun the original unmodified
two-receiver gate. Then investigate same-owner proof reuse for repeated receiveStatus validation,
retaining fresh ledger/witness/authority/commit checks. This is a proposal; no product repair here.

Driver response callbacks sometimes lag Worker fetch completion. Retain observer-lag counters and
both failed analysis assumptions in attribution-analysis-notes; internal spans use actual Worker
clock brackets, never assumed realm equality. Single synthetic-host diagnostics, calendar/control
changes, tracing overhead and host variation limit generalization. No Android/hidden-lifecycle or
release qualification claim. Exact own containers/browsers absent. No push/deploy,preview8443,
service-history automation, phone/computer use, account/profile clearing or factor/proof archiving.
