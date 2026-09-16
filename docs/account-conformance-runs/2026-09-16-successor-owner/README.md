# Lifecycle-owned successor installation — chunk C2b

2026-09-16, after signed replay adapters `cf371bd0`. The supported private v9 composed owner can now
install the one admission-only successor, retain pending work and reopen it. Tests call the service's
internal admission owner; consumption/discovery HTTP and automatic reconnect discovery remain D.
Release validation, ordinary Account entry and deployment remain paused.

| Check | Result |
| --- | --- |
| New native owner/controls | 13 passed: 12 in `native-final`, the additional zero-prefix case in `zero` |
| Named first-epoch native regressions | 2 passed |
| Focused Node replay/history/registry | 32 passed, including existing 40/80 generated history campaigns |
| Affected unit files | 74 passed in seven files |
| Typecheck, scoped lint/format, diff check and reviewed runtime inventory | passed; 176 sources, 96 labels/templates, 24 groups, 14 manual entrypoints |

```
node --test --test-timeout=90000 test/account-successor/owner.test.mjs test/account-successor/owner-controls.test.mjs
node --test --test-timeout=90000 --test-name-pattern='zero accepted prefix' test/account-successor/owner.test.mjs
node --test --test-timeout=90000 --test-name-pattern='owned request, atomic|one owner sends and reads back' test/account-receive/native.test.mjs test/account-sync/native.test.mjs
node --test --test-timeout=30000 test/account-successor/client-replay.test.mjs test/account-successor/client-replay-controls.test.mjs test/account-successor/history.test.mjs test/account-successor/history-controls.test.mjs test/account-first-authority/registry.test.mjs
node node_modules/vitest/vitest.mjs run test/sourceCapture.test.ts test/spoolRecord.test.ts test/spoolBatch.test.ts test/accountDelivery.test.ts test/accountInboundCodec.test.ts test/accountInboundControls.test.ts test/accountTransportContract.test.ts
node node_modules/typescript/bin/tsc -b --noEmit
```

Disposable Chromium profiles and SQLite services perform actual passkey preparation, admission, local
factor opening, encrypted writes, send/read and cold reopen. Original genesis/receipt, slot binding,
wrapped credentials and seal reservation remain byte-identical. Source text, continuous spool positions
and accepted/received prefixes survive epoch-2 publication and compaction. The empty accepted-prefix
case starts offline before any send, cold-opens pending old captures, then publishes them successfully.

Native transaction interception aborts the successor marker before commit or withholds its completion
callback after commit. The former leaves epoch 1 and an editable workspace. The latter permits an
acknowledged synchronous journal edit before the page is killed; reopen selects epoch 2 and recovers
that edit. These are browser interruption/transaction cases, not a whole-machine power-loss claim.

A held exact old outbound is accepted either before admission (lost epoch-1 response) or afterward
(epoch-2 response over the unchanged epoch-1 envelope). Both resume without re-minting or resetting
positions. A held old receive response is discarded after adoption, current polling resumes and later
writing converges. An exact adoption retry is idempotent; a different root-signed child is refused
before and after cold reopen. Marker removal without a new MAC fails; unsupported stages/extra fields
and malformed local cuts fail their closed parser with a valid-marker control.

Two effective native omission controls use real fixture crypto and storage:

- With prefix completion omitted, an independently root-signed vector ahead of every retained envelope
  is installed and survives cold reopen. The normal build refuses and keeps editing available.
- With the ledger-side check omitted, a validly MACed false installation cut makes old authority events
  appear post-install and opens an active editor. The normal build refuses cold startup.

The adversarial signer unwraps only a disposable fixture root using its synthetic factor, never an
application export path. No key material is printed or retained in evidence. Initial native/control
runs passed and are retained as bounded development evidence. `inputs.json` pins final files. No vector
bytes, paused command wrappers, frozen release inventories or qualification counters changed. The new
construction remains open pending HTTP integration and explicit cryptographic qualification.
