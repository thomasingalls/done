# Owned reconnect discovery — chunk D2

2026-09-16, after signed private HTTP integration `e5e77a05`. The bounded private admission-only flow
now runs through both owners and the HTTP adapters: the first device discovers, verifies, installs and
continues after a candidate is admitted while it is offline. This does not certify or deliver a key to
the candidate, enable ordinary Account entry, deploy a service or resume release validation.

| Check | Result |
| --- | --- |
| Native owner/reconnect/control campaign | 19 passed in `native-final`; `extra` adds two cases and repeats the final-expiry baseline, for 21 distinct cases |
| Named first-epoch native regressions | 2 passed |
| Transport/driver/diagnostic units | 39 passed in five files; includes 60 generated stream partitions |
| History/replay/registry Node cases | 32 passed |
| Typecheck, scoped lint/format, diff check and runtime inventory | passed; 178 sources, 96 labels/templates, 24 groups, 14 manual entrypoints |

```
node --test --test-timeout=90000 test/account-successor/reconnect.test.mjs test/account-successor/owner.test.mjs test/account-successor/owner-controls.test.mjs
node --test --test-timeout=90000 --test-name-pattern='discovery expiry guard|late signed empty' test/account-successor/reconnect.test.mjs
node --test --test-timeout=90000 --test-name-pattern='owned request, atomic|one owner sends and reads back' test/account-receive/native.test.mjs test/account-sync/native.test.mjs
node node_modules/vitest/vitest.mjs run test/privateDiscoveryHttp.test.ts test/privateDeliveryHttp.test.ts test/accountSyncDriver.test.ts test/accountReceiveDriver.test.ts test/diagnostics.test.ts
node --test --test-timeout=30000 test/account-first-authority/registry.test.mjs test/account-successor/client-replay.test.mjs test/account-successor/client-replay-controls.test.mjs test/account-successor/history.test.mjs test/account-successor/history-controls.test.mjs
node node_modules/typescript/bin/tsc -b --noEmit
```

The new browser cases perform preparation and consumption through real HTTP with synthetic account
proofs. The original writer is offline, acknowledges an edit, then reconnects. Automatic discovery owns
its creator-signed nonce/deadline, verifies the root response and exact request, installs under its
existing storage permit and resumes both lanes. A trace of all private requests observes at most one
in flight in the automatic flow. Cold reopen uses epoch 2, preserves writing and issues no more
admission-only discovery. Subsequent envelopes use epoch 2; prior pending epoch-1 bytes remain exact.

Signature/request-hash substitution and oversized replies cannot install authority and leave local
editing usable; a later valid retry converges. Close cancels an outstanding discovery lifetime. A late
signed empty reply cannot downgrade a successor installed meanwhile. Expiry injected at the native
marker comparison aborts installation and preserves a later local edit. Removing only that final
callback permits the expired locator's head to be installed, an effective counterexample; the ordinary
build refuses. This guard concerns online locator freshness, not expiration of the successor signature.

The transport captures and bounds requests, pins its endpoint, omits ambient credentials, forbids
redirects, caps declared and streamed replies at 32 KiB, strictly decodes UTF-8/JSON and drains stream
cancellation. Sixty generated partitions (seed 16091606) include split multibyte UTF-8; exact-bound and
one-byte-over responses discriminate the cap. Wrong status/type, malformed bytes and cancellation return
no usable result and record only finite diagnostic codes.

`native-initial` preserves the first six passing reconnect cases. The final runtime is pinned in
`inputs.json`; the additional expiry-control/late-empty cases were added after the 19-case run and pass
separately. No existing vector bytes, command wrappers, frozen campaign inventories or release credit
were changed. New construction qualification and all second-gate content certification work remain open.
