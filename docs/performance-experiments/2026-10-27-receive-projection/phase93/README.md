# Phase93 — Remaining receiver projection work

Current source still copies the complete inbound state for every read preparation before choosing
one publisher, and status copies it before reducing to scalars. The previous S06 map identifies this
same pattern. Later shipped server authority/discovery reuse does not change these client callbacks.
Select this as the next bounded repair; do not repeat already-addressed server proof work.

[Prospective protocol](protocol.md), [raw12 blocks](raw.json.gz), [independent analysis](analysis.json)
and exact probe/reconstruction sources retain the fixed comparison. Two synthetic publishers carry
unique2KiB envelope/512B proof buffers at32/256/1024/2048 positions each. Chromium/CPU4x, three fresh
pages per depth,20 repetitions/condition, fixed R/C,C/R,R/C, no concurrent build/test. No real accounts
or cryptographic verification are claimed by this model. Repetitions are dependent; the block is the
unit. No statistical population, actual-phone, WAN or service-capacity claim follows.

|Positions/publisher|Full preparation median|Narrow preparation median|Retained bytes cloned R→C|
|---|---:|---:|---:|
|32|0.630ms|0.040ms|163,840→0|
|256|4.595ms|0.005ms|1,310,720→0|
|1024|19.665ms|0.035ms|5,242,880→0|
|2048|44.565ms|0.025ms|10,485,760→0|

Near-zero candidate samples include a zero reading from timer quantization, not zero CPU cost.
The32-position first/last reference drift15.2% breaches the prospective15% trigger; qualify shallow
timing accordingly. Deep reference drift is3.6%/3.6%. Preserve every block and this qualification.
All cursor/status shapes agree independently and candidate copies zero retained payload bytes; deep
medians exceed the prospective20% selection threshold. This establishes a worthwhile copy mechanism,
not an observed end-to-end sync speedup. The16ms local/2.5s peer/30s delivery/600s replay/120s continuation
gates remain unchanged and unproved by this probe.

Repair scope: derive cursor-only read hints and scalar status inside the existing verified-owner
selection callback, before detached cloning. Keep the existing publisher resolver/certified-roster
check and scheduling order. Full inbound state remains mandatory for applying/verifying pages,
retained-old-position checks, history installation, conflicts and commit/lifetime checks. Add actual
receiver and ownership regressions before claiming the default path uses the narrow projection.

Preview8443 was updated first to an immutable build of unsigned92,67288576-dirty, with exact HTTPS
worker/config checks and a disposable local-profile UI smoke. The retained API was not restarted;
existing browser profiles, identity and account state were not touched. The preview stays on that UX
build during later performance work. No release preparation, signing, push or deployment.
