# Phase98 — Empty publisher sweeps and retry gaps

Diagnostic only after97; no client/service runtime source change. Reuse the same frozen110-file C
artifact, exact stopped encrypted fixture and unchanged source/image in the same1CPU/1GiB/no-swap/
pids128 readonly service. One isolated H1 forward1024-position catch-up, then a genuine accepted
reverse edit with the writer closed before the receiver opens and offline same-profile cold reopen.
The5000-character large Goals fixture limitation remains. This is not another latency acceptance
comparison;97's uninstrumented original16ms/2.5s/30s/600s/120s gates remain the acceptance evidence.

## Direct observations

The forward journey lasts145.089s under observation/main-thread profiling. All1542 successful read
HTTP replies are decoded, matched by batch index and associated with a certified publisher. Five
unchanged publishers each return257 empty pages:1285 empty replies. The backlogged publisher returns
all1024 missing positions exactly once across257 successful HTTP calls. No other publisher contributes
an entry. The native HTTP trace independently labels49 additional replies authorization-refused /
capacity; the old uninstrumented non-overlap runs record51,57,57,52 read429s. These are advisory error
bodies, never signed progress evidence or authorization.

| Interval associated with the preceding read reply | Calls | Handler wall sum | Start-to-next-read span |
|---|---:|---:|---:|
| Empty |1285|12.936s|60.131s|
| Productive |257|10.855s|33.978s|
| Capacity refusal |49|0.022s|49.460s|

Initial work before the first read is1.520s. Adjacent read intervals do not overlap. The span includes
client verification/application, scheduling, transport and intervening other work; it is **not causal
time saved by removing that request**. About49.437s lies between refusal replies and subsequent reads.
This selects retry pacing plus unnecessary work as a stronger question than bandwidth. Source99
replays the unchanged scheduler's one-second failure floor independently.

Main-thread sampling spans the forward client and whole service journey respectively. Client self
samples include~9.0s in exact byte-span comparisons,~1.9s in verified selection/copying and~4.8s in
scoped-control cursor callbacks. It also has~101s in the profiler's idle bucket; service~133s idle.
These are sample-weighted stack residence, not complete CPU/wait decomposition. Native workers,
IndexedDB and rendering are not fully measured. The service process records~41.0CPU seconds across
its whole~163s journey. Empty cycles can therefore carry substantial client/storage/pacing work even
when the HTTP handler itself is short. Client bundle frames are mapped against the exact built maps.
The existing bulk custody reader has already failed adoption; these samples do not overturn that.

## Checks and limits retained

The new observation wrapper initially passed Buffer slices to a decoder whose returned views were
then erased. Five separate transparency cases catch this before any real journey. Copy into an owned
Uint8Array before decoding; final single/batch empty/productive/refused cases prove incoming/outgoing
bytes and object pass-through remain unchanged. Preserve the failed source/log and final check.
The wrapper's total observed request/response decode work is~131ms; CPU sampling overhead is not
identified by that counter. No profiling result is substituted for uninstrumented acceptance.

Every read HTTP response is accounted for, and every successful request/page is classified. The
original strict all-publisher-metadata criterion is **not fully met**:10 capacity replies finish
before the observer decodes a body, so their publishers remain unknown. Do not count them as empty
or infer their scope. Keep this qualified result rather than silently weakening the protocol or
repeating a native journey to obtain a desired outcome. The five unchanged successful streams and
all1024 actual positions are still directly observed. The protocol/instrumentation precede dispatch;
the full identity receipt was written after dispatch. All execution files stay byte-exact afterward.

Independent native audit verifies every original seed row, envelope/ciphertext/wrapper/head signature
and prefix; only the expected one H reverse edit is added, with M/Q unchanged. Exact exports, sender-
closed ordering, selected-worker identity, readonly resources and offline cold-profile preservation
pass. Decoder metadata grants no authority and is not independent proof of an empty page signature;
the unchanged owner still verifies every actual response. No keys, writing, tickets or DBs enter Git.

No software repair, old-test change, rate/capacity change, signing, push, preview restart, release
preparation or deployment. Generalized qualification remains paused.99 records source falsifiers,
prior negative evidence and the next bounded repair contract.
