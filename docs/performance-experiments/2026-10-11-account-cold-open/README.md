# Existing-history cold opening: remove repeated prefix reconstruction

**Result:** complete cold opening of the same retained 2,320-edit / 295-position Account improves
from **11.62s to 4.21s median (63.7%)** in five alternating paired runs. Every full verification still
runs. No stored/wire format, startup authorization, source deletion, deferred-verification policy,
service request behavior or deployment changes. Release validation remains paused.

Parent: signed `4bcac41928dae58a1795d4adb126595b898a56ca` (batching). See [source manifest](./source.json),
[predeclared protocol](./protocol.md), [verification](./verification.md), and [reproduction](./probe/README.md).

## What changed

`verifyDelivery` already had a forward prefix cache, but used it only with a verification memo or
incremental continuation. Cold startup supplied neither. For a clean P-position stream with one
submission and response per position, it recomputed P(P-1) preceding links on every full pass.
Complete cold replay now uses its local forward cache too. Retried positions still invalidate their
suffix; order, signatures, source binding and response checks remain. Independent signed response-head
verification computes another link per position; it is not skipped.

`verifyAccountUnderPermit` now constructs one inbound/delivery/spool census per validation callback
and passes it to the existing verifiers. Previously it constructed three nested censuses over the
same immutable authenticated records. There is no cache across authority changes or opening lifetimes.

Numeric profiling counters identify preliminary and live-owner passes and fixed authorization,
classification, owner-ready and editor-ready milestones. They contain no writing, identities or keys
and are exposed only by the existing profiling build flag. Ordinary-build checks assert the diagnostic
globals are absent.

## Baseline diagnosis and scope decision

The online diagnostic measured **two preliminary validation passes and one live-owner full pass**,
not ten. Eight nested census constructions and repeated decoding *within* each census explain the
larger parse count. It counted exactly 173,755 prefix links: 2 × 295 × 294 + 295. Authorization finished
at 0.157s, preliminary classification at 9.528s, live owner at 11.338s, admission/editor at 11.464s,
and visible shell at 11.831s.

The matched offline comparison below separates network settling. Its baseline performs 72,985 source
parses; the earlier online measurement performs 75,339 by shell observation. These windows must not be
silently combined. All reported primary opens use a fresh context restored from the same saved bytes,
automatic virtual passkeys, fully installed application cache, and offline network state before unlock.

## Matched results

Times are click-to-visible-editor, including the virtual passkey but no human code entry. CPU sampling
is **off** for this table; numeric diagnostics are enabled identically in both arms. Each run restores
the original fixture rather than using history produced by the preceding run. Deep order is AB / BA /
AB / BA / AB; the two smaller checks use AB / BA / AB. Each open is one observation.

| Retained history | Runs/arm | Baseline median (range), ms | Candidate median (range), ms |
|---|---:|---:|---:|
| Own writing, 2,320 edits / 295 positions | 5 | 11,621.9 (11,517.9–11,959.1) | 4,213.1 (4,184.1–4,390.9) |
| Approved second device, 51 inbound records | 3 | 1,173.0 (1,163.7–1,174.2) | 1,175.6 (1,174.8–1,177.7) |
| Fresh Account | 3 | 260.0 (258.8–261.4) | 263.3 (254.7–284.4) |

See [numeric summary](./summary.json) for exact values and [raw deep pairs](./deep-0-baseline/opens.json)
for counters and milestones. The second-device fixture was created through real enrollment and delivery:
48 sequential writing bursts were observed on B before producing the next, retaining 51 inbound head
records and 52 content records. It has no own outbound positions. This is a receive-heavy local reopening
check, **not** a measurement or repair of delayed network catch-up, nor proof that much deeper receive
history is cheap. The fresh and receiver differences are a few milliseconds; no material regression is
established by these small samples.

| Deep open work through visible editor | Baseline | Candidate |
|---|---:|---:|
| Complete delivery / inbound verification passes | 3 / 3 | 3 / 3 |
| Preliminary validation passes | 2 | 2 |
| Prefix-link computations | 173,755 | 885 |
| Inbound census constructions | 8 | 4 |
| Source capsule parses | 72,985 | 44,733 |
| Physical full-record loads | 5 | 5 |
| Rows loaded, including rereads | 19,150 | 19,150 |
| Retained heap after collection, median | 17.28 MB | 17.23 MB |
| First card creation after heap collection, median | 29 ms | 27 ms |

First-edit timing includes Playwright fill/Enter and visible card acceptance, after forced heap
collection; it is a functional/latency guard, not a normal typing p95 claim. Receiver heap remains
9.67 MB and fresh heap about 8.3 MB. Peak heap was not sampled; retained heap cannot establish peak
allocation behavior.

The independent signed-ledger test measures actual hash invocations: at 8/32/128 positions the prior
walker performs 64/1,024/16,384 acceptance-link hashes (including response checks), versus 16/64/256.
A separate 1,000-position candidate check performs exactly 2,000. Thus the link computation growth
criterion is met, beyond the minimum wall-time criterion. This does not claim all ledger work is linear.

## What remains

In the separate candidate CPU profile, opening takes 4.21s, with 3.90s sampled active CPU. Source parsing
accounts for 1.12s inclusive; nested inbound census inspection accounts for 1.28s; self-progress coverage
checking accounts for 0.71s. These overlap and must not be added. In that run, preliminary classification
uses about 1.93s after authorization and live-owner setup about 1.69s. See the [profile summary](./candidate-profile/profile-summary.json)
and [compressed profile](./candidate-profile/cold-0.cpuprofile.gz).

The <2.5s cold-start budget remains unmet for this deep history. Redundant capsule decoding within a
census and reuse across preliminary/live-owner verification are the next cold-open opportunities. The
latter needs explicit custody, buffer ownership, journal snapshot and authority fencing; this slice does
not bypass that design by skipping a validation. Actual pass counts and the repaired profile justify
considering it next, rather than inferring ten passes from parser counts. Larger document coverage costs
and long received histories also remain to be measured.

## Limits and deviations

- Disposable Chromium desktop fixtures on one host, not real customer data or phone latency. Another
  investigation had browser processes on this host. Alternating order and deterministic work counts
  support the mechanism but do not establish isolated-hardware precision or population confidence.
- Restored IndexedDB/localStorage does not restore CacheStorage. The first offline probe lacked an
  installed app cache and could not finish opening; the final probe waits for activation and reloads
  under the service worker before going offline. That failed attempt is retained, not pooled.
- Fixture creation initially treated CodeMirror's empty Goals placeholder as writing. Corrected to an
  explicitly empty fresh document. Another first receiver probe waited for an old explicit open button;
  retained approved connections already open directly. Both failures and the corrected run are retained.
- Two native cases initially completed their assertions but failed to save evidence because the requested
  output directory did not exist. After creating it, both cases passed; the first log is retained.
- An existing ledger mutation-control test fails on both parent and candidate: removing one ordering
  guard still leaves the mutated fixture refused by envelope parsing. Its normal refusal assertions pass,
  but that control's claimed rescue is stale. This is recorded, not counted as passing or changed here.
