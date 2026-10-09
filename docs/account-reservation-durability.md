# Reservation persistence and invocation accounting (F-15)

Base: `ec889d9`. This bounded phase corrects the persistence boundary for the current private,
first-epoch protocol. It changes no stored cryptographic bytes or key derivations.

## Contract and crash model

SC-01 remains a page/navigation-loss acknowledgement contract. Synchronous localStorage journal
acknowledgement does not promise an OS flush. A different invariant governs AES: before invoking
encryption under a reused key, the owner must persist a fresh, non-reusable grant within that key's
lifetime budget. Count abandoned invocations, including ciphertext never retained or transmitted.

Transactions authorizing such grants must request `durability: 'strict'`, report `tx.durability ===
'strict'`, and complete before the invocation. Unsupported, missing, downgraded or throwing capability
must refuse without executing the transaction body. An allocated transaction remains owned through
abort/completion, including when an attempted abort throws; refusal must not turn into success on
completion. There is no fallback to default/relaxed. Reads and unrelated metadata writes retain their
existing policy. A reported-capability refusal uses the owning storage error, not the compatibility exception that
promotion can deliberately bypass with authenticated retained progress. A synchronous transaction-creation
exception retains its existing error shape; no transaction exists to drain and no body or AES runs.

This policy relies on the browser and storage honoring strict persistence. The [IndexedDB transaction
contract](https://www.w3.org/TR/IndexedDB/#transaction-durability-hint) distinguishes persistence to the
medium from completion after an OS write; it describes durability as a hint and warns of cost. Reading
back the property detects unsupported/downgraded API behavior; it cannot attest physical flushes.
Native tests below can establish options, order and refusal, not actual power-cut survival.

The model permits atomic completed-but-unflushed relaxed writes to disappear on OS/power loss. Strict
completion persists its write and prior writes in that database. Page loss abandons continuations;
OS loss additionally drops volatile writes. Already invoked AES and remote publication survive in the
oracle even if the local ciphertext does not. Once invoked, a grant cannot be reused after either kind
of restart. Restore, coordinated rollback, writable profile clones, dishonest storage, eviction and
media corruption are separate exclusions. No strict hint repairs past undercounting from an old writer;
the argument begins with an accurate retained budget and exclusive use of corrected writers.

## Grant inventory and enforcement

| Grant / key | Reservation and persistence | Invocation / disposition |
| --- | --- | --- |
| Custody root, initial creation or resumption | `custody.completeCreation` reserves 3 in authenticated `seal_reserved`; `custodyRecord.transact` persists the full custody record | One generation envelope and two credentials; resumption burns another 3, including after partial encryption. Final protected record retains the count. |
| Custody root, Local promotion | `promotionOwner` reserves 2; `promotionRecord.writePromotion` already requests strict for record + marker | Two new credentials; reserved-stage retry burns another pair. Prepared/selected stages open retained ciphertext. The shared transaction helper must check reported durability. |
| Generation store key, every content kind | `contentStore.appendRecords` authenticates/reserves via `compareAndWrite` | One AES invocation per reserved sequence. Retry/abort burns the range. Includes journal flush, inbound updates, spool records, compaction snapshots. |
| Network envelope key | Attempt event in encrypted `heads` plus authenticated counter witness, committed by `appendSpool` / `compareAndWrite` | `accountEnvelopePreparation` awaits that final commit before one network AES invocation. The local record allocation alone is not the network grant. Retry requires a new attempt; retransmission uses retained exact ciphertext. |
| Fresh factor-derived key | New root enrollment uses fresh factor salt/key and nonce | One seal per fresh derivation; no repeated-key persistent counter. Unsupported custody persistence can abandon this one-time output without admitting root-key encryption. |
| Journal key | Distinct XChaCha construction and nonce space | Not an AES lifetime-counter grant; SC-01 and existing journal rules still govern. |

`compareAndWrite` requires strict for both allocation and final record/witness commits, including v2
activation. `custodyRecord.transact` requires strict for writes. `contentTransaction` enforces any explicit
strict request, including promotion. No broad default change for slot/index/cleanup or read transactions.
Fresh Local and migration installers can write initial zero-count custody through other helpers, but
cannot invoke reused-root AES until `completeCreation` persists the full reserved record. Their retained
initial copies are not a grant or a fallback opener. Initialization refuses missing/inconsistent used
carriers; compaction never reduces counters or removes spool events. Later writes cannot restore an
older reservation value without failing the existing authenticated comparison.

## Required evidence

Before repair, record the actual default/relaxed options and reproduce an undercount by losing a completed
grant after invocation. Keep a legitimate round trip. After repair: generated histories with allocation,
completion, invocation, abandonment, publication, flush and loss; controls omitting strict persistence or
ordering must fail. Native tests must cover requested/reported strict, downgraded/missing/throwing options,
abort/drain and normal reads/writes; exercise custody, content and network attempt paths. Existing budget,
restart, promotion, spool and compaction controls remain required. Preserve the raw campaign and scope
limits before updating the checkpoint. F-05/F-06 byte-contract closure is unchanged.
