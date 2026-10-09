# Private native receive evidence — 2026-09-11

Committed inbound codecs/verifier as `8378596`. The [private receive store](../account-receive.md)
now owns v9 activation, signed read requests and atomic original content/evidence/witness commits.
Its authority comes from the actual admitted Account and factor-owned lifetime. No editor receive path,
service route, enrollment or personal Account is activated.

Final campaign: `test-results/account-receive/2026-09-11T00-28-05.111Z`, executed as
`node scripts/account-receive/run.mjs` (registered as `pnpm account:receive`).
[Summary](./2026-09-11-account-receive/summary.json),
[sources](./2026-09-11-account-receive/sources.json),
[native results](./2026-09-11-account-receive/native.log),
[generated histories](./2026-09-11-account-receive/generated-native.json),
[findings/limits](./2026-09-11-account-receive/findings.json),
[manifest](./2026-09-11-account-receive/manifest.json).

| Check | Result |
| --- | --- |
| Native receive | 17 tests pass: v9 activation, receive commit cuts, renderer death/lost acknowledgement, exact originals, duplicate/conflict, pending dependencies, compaction, expired cold replay and old-reader refusal |
| Missing/corrupt state | Missing content/event, changed ciphertext, and valid native AEAD/witness around a wrong baseline or invalid service page signature all refuse cold open |
| Ownership and bounds | Outstanding request substitution, changed caller buffers, close during crypto with a pending competing lock, changed authority before commit, oversize-before-reservation, quota abort and a 256-record retry batch |
| Native generated histories | 12, seed 9182026: authored content and expected received positions checked across before/after commit cuts, exact retries, cold opens and compaction |
| Actual native controls | Four: removed coverage admits missing content; removed witness loses receipt progress; removed stored page signature accepts invalid service evidence; split-content mutation is detected on readback and cold open |
| Primitive/property checks | 45 tests pass, including 200 generated content/deletion coverage cases (seed 9172026), existing 400 signed inputs, 500 wire mutations and eight verifier guard-removal controls |
| Existing v8 regression | Four properties and 19 native cases pass, including eight generated delivery histories |
| Full unit suite | 951 tests in 83 files pass |
| Build/static/gates | Isolated app build at `test-results/account-receive/app-build`, TypeScript, scoped lint/format and 13 repository gates; adjacent artifacts record results |

The v8 regression demonstrated one compatibility defect introduced during composition. A v7 factory
refused v8 at the wrong existing boundary after receiving a new version ceiling. Both activation tests
failed on the changed error, while still refusing to expose an unsupported editor. The repair preserves
the prior v8 ceiling for older factories and grants v9 only to its explicit owner. The complete
[failing capsule](./2026-09-11-account-receive/compatibility-before/summary.json) and
[exact pre-repair source](./2026-09-11-account-receive/compatibility-before/accountCapture.ts.txt) are retained.
The final [v8 regression capsule](./2026-09-11-account-receive/delivery-regression/summary.json) uses
`test-results/account-delivery/2026-09-11T00-28-09.709Z` and matches final source hashes.

The independent page/acceptance oracle uses Node/OpenSSL; native envelopes use the actual disposable
Account's admitted credential. Authored Yjs content, original framing and durable received positions are
checked independently of storage commit helpers. Arbitrary fixture envelopes do not establish issuance
or safe cloning of a real second writer. The generated campaigns found no additional counterexample.
New native polls explicitly await bounded predicates. Earlier v8 waits are historical regression checks,
not new polling-conformance evidence. The unit mutation bundles emit their documented duplicate-Yjs warning.

An event is not sufficient without content coverage, and valid local encryption is not sufficient without
original service/member signatures. Every cold open checks the complete witness and original wire evidence.
Original pending Yjs frames survive until their dependency union integrates; only then may compaction merge
content. A received event creates no local source capsule. The owner exposes no editor in this phase;
its v9 marker fences older editing factories until the next integration is built.

No full `pnpm check`, general epoch/membership transition, restored-profile guarantee, enrollment, whole debt
payment or personal deployment is claimed. Sources and evidence hashes are preserved. The personal Local
release/predecessor, browser/factors, servers and L-2 remain unchanged.

Next: ordered remote editor promotion under the same lifetime, before v2 receive transport/service and
real second-device enrollment/adoption.
