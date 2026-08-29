---
schema: 1
kind: finding
id: f-3bea0e6-store-sequence-allocation-undefined
status: repaired
type: implementation-hazard
severity: medium
confidence: high
introduced_by: 3bea0e69469e47b790fe6214d7fbed42bcf84441
work_item: X-02
created_by: /root
updated: 2026-08-29
challenged_by: root-v01-20260826
superseded_by: none
---

# `The authenticated store sequence has no selected crash-safe allocator across tabs, object stores, and generations`

## Affected requirement or guarantee

Content records must carry a monotonic per-`(principal, workspace)` `seq` used for trim ordering and as the claimed
bound on AES-GCM invocations. At the pinned tip the same sequence spans the content and accepted-head object stores.
The design also explicitly permits two tabs to open one store.

## Original source

`c6116669030eedeea3d599bca0da3547114e6930:docs/TRD.md` §6.1 (`OC-024`) requires monotonic trim ordering and
crash-safe state-before-delete behavior, but leaves the concrete format and allocation algorithm to row 3.

## End-state source

At `9edd9300adebcec3abd2234c946f1dcccdc17eef`, `docs/selections/row-3-record-format.md` §§2–3 requires `seq`
before AES-GCM encryption because it is authenticated in AAD, calls it monotonic per store, says two tabs can open
the store, and claims it bounds the per-generation random-IV invocation count. `docs/TRD.md` §6.1 further makes one
sequence span the content and `heads` object stores. Neither source selects a counter record, reservation
transaction, range allocator, generation-start watermark, or retry rule.

## First introduction and propagation

`3bea0e69469e47b790fe6214d7fbed42bcf84441` first selects the authenticated sequence and rejects a derived
counter nonce because two tabs can choose the same next value. `dbfd01f54cdfcab994ac7df2298ba0da0bbe7da9` folds
the record into the TRD, and row 6 later makes the sequence cross two object stores, but no later commit adds the
allocator the same concurrency argument requires.

## Reachable consequence

If two tabs independently read the same maximum and encrypt with `max + 1`, both records authenticate with the same
sequence. A trim state at that value can then delete a concurrently committed update that its snapshot did not
cover, or a key-path collision can abort one writer. An IndexedDB auto-increment key does not directly solve this:
`seq` must be known before asynchronous WebCrypto can authenticate it. A separate durable reservation can solve the
problem, but adds a required kill point and must also count abandoned reservations and establish when a fresh
generation receives a fresh invocation budget.

## Supporting evidence

The row-3 selection itself uses two-tab concurrency to reject an unsafe counter but supplies no equivalent
coordination for `seq`. The pinned TRD calls `seq` monotonic across both stores and uses it for deletion and nonce
budget decisions. [NIST SP 800-38D §8.3](https://csrc.nist.gov/pubs/sp/800/38/d/final) limits the total number of
authenticated-encryption invocations under a key for the RBG-based IV construction; a counter recovered only from
successfully committed records cannot count encryptions followed by abort or page kill.

## Counterevidence and disconfirmation attempt

A short IndexedDB transaction can durably reserve a single sequence or a per-tab range before encryption; gaps after
a crash are harmless to ordering and conservative for the nonce budget. That is a viable resolution and keeps the
selected record bytes unchanged. It is not present in the selected construction, however, and it creates the exact
reserve/encrypt/commit crash states X-02 is required to test. The possibility of a straightforward future solution
reduces severity but does not make the present ordering reconstructible.

## Validation procedure

1. Open one store in two tabs and synchronize both writers at sequence allocation.
2. Assert every content and heads record receives a unique, monotonically increasing `seq` before encryption.
3. Kill after reservation, after encryption, and before/after record commit; verify gaps are retained and never
   reused, and that every encryption attempt is covered by the active generation's budget.
4. At the generation ceiling, verify rotation establishes a new per-key budget without resetting the global trim
   order or permanently refusing all later writes.
5. Race a trim snapshot with a concurrent update at the boundary and prove the update is not swept.

## Disposition

Reopen before Stage 1: select the durable sequence allocator and its generation-budget metadata, then make the
multi-tab and kill-point schedule build-failing.

**Repaired — 2026-08-29** under the authorized `S0-10` disposition workflow (`docs/review/README.md` §Finding lifecycle states the standard; `remediation/traceability.md` is the
generated finding→falsifier matrix). The defect's return is refused by the write-admission model's
`§6.1 — the allocator, and the count the budget reads` test, on the composed storage scheduler.
