# Private service consumption and signed discovery — chunk D1

2026-09-16, after signed browser installation `f5a3399c`. Private service endpoints are integrated;
client reconnect discovery and the complete browser-over-HTTP path remain D2. No ordinary application
entry, deployment, release campaign, vector regeneration or frozen qualification refresh occurred.

| Check | Result |
| --- | --- |
| Focused service/discovery command | 43 passed; 14 discovery cases/controls plus 29 affected admission cases |
| HTTP command | 3 passed; two new endpoint cases and the existing preparation regression |
| Construction registry | 12 passed |
| Diagnostic unit tests | 2 passed |
| Typecheck, scoped lint/format, diff check and reviewed runtime census | passed; 177 sources, 96 labels/templates, 24 groups, 14 manual entrypoints |

```
node --test --test-timeout=45000 test/account-successor/discovery.test.mjs test/account-successor/discovery-controls.test.mjs test/account-successor/service.test.mjs test/account-successor/restart.test.mjs test/account-successor/service-controls.test.mjs test/account-successor/generated.test.mjs
node --test --test-concurrency=1 --test-timeout=30000 test/account-successor/http.test.mjs test/account-enrollment/http.test.mjs
node --test --test-timeout=30000 test/account-first-authority/registry.test.mjs
node node_modules/vitest/vitest.mjs run test/diagnostics.test.ts
node node_modules/typescript/bin/tsc -b --noEmit
```

Discovery returns only a root-signed, exact-request-bound null/successor response after checking the
original certified requester, full retained authority and delivery census. It rereads the snapshot,
checks expiry and custody again before response, and retries at most four changed snapshots. It writes
no account/delivery state. Independent Node framing verifies response hashes and signatures.

Thirty shrinking histories (seed 16091605) interleave prepare, admit, publish, discover and restart.
Directed cases cover held child/old parent, detached mutable request inputs, candidate/wrong scope,
expired/oversized requests, damaged ledger/pointer/artifact/account/recovery and late expiry/custody
closure. A paused child process observes another process admitting a successor and must return the
new child. Omitting the final comparison lets an account made ineligible during that pause receive a
signed locator; the normal implementation refuses. This is an eligibility/consistency check, not a
claim that a discovery response grants ciphertext or prevents whole-database rollback.

Real localhost HTTP exercises origin/Host/token/content-type/body bounds, preparation consumption,
exact lost-reply retries, retained admitted status, original member discovery from both heads, absent
authority provisioning and the pending candidate's refused discovery/read/publication. There is no
candidate key-delivery route. The existing service/first-authority checks remain intact.

`http-early` preserves one harness failure: fetch normalized the attempted bad Host override, so the
request reached the parser instead of exercising the Host guard. That case now uses Node's raw HTTP
client and passes. Final logs and input hashes are retained. No application secrets or content are
included; all service state and cryptographic material are synthetic disposable fixtures.
