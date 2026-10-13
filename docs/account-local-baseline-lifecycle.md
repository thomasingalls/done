# Non-deleting baseline lifecycle — 2026-10-13

The [real Account owner integration](./account-local-baseline-owner.md) is committed signed as
**`bb9c7e82`** (`G`). This phase extends the same private `VITE_ACCOUNT_BASELINE_INSTALL=1`
experiment to generation rotation, baseline replacement, initial content handoff and detached copies.
This phase is uncommitted. No personal profile is converted, no product control or automatic installer
is enabled, and publication/general release validation remain paused.

All logical rows in `content`, `heads` and `outbound` remain present. Live readers still consume the
complete, verified history; the authenticated baseline and suffix are independently replayed and
compared with it. This is lifecycle preparation, not a performance activation or deletion phase.

## Replacement and lost replies

The private composed workspace exposes `replaceLocalBaseline(expectedRevision)`. Like initial
installation, it joins the admission FIFO, flushes the journal on the serialized storage tail, then
holds the activity/journal fence and exclusive slot permit until all native work settles. It does not
apply an update, replace the live document, change its revision or recreate the UndoManager.

The supplied revision is an optimistic concurrency condition, not authority to supply baseline bytes:

- The owner first fully verifies the existing carrier and history. An unreadable anchor is fatal;
  replacement cannot silently heal it from the intact history.
- The current revision must equal the requested predecessor. If it is already the immediate successor,
  the owner re-verifies it and returns `already-installed` without reserving/encrypting again. This
  makes a retry of the same request after a lost reply idempotent. Other revisions refuse.
- The owner builds the new candidate from the current verified census. The candidate's predecessor
  is the authenticated old payload hash, and its revision is exactly one greater. The hash stays
  inside encrypted baseline data; the on-disk pointer still uses a keyed commitment.
- New-candidate ineligibility can return `skipped`; existing-anchor failures cannot. Pending sources,
  protocol evidence and full/reference agreement keep their existing checks and bounds.
- The carrier copies all inputs, including the expected old anchor, before awaiting. It authenticates
  the old v3 counter/chunks and requires the exact expected revision/hash and census counter.
- Reservation commits **v3 with the old pointer** and burned new invocations. It never temporarily
  downgrades to v2. An encryption failure, journal interruption or aborted final transaction leaves
  the old baseline readable and every logical history row unchanged.
- After complete fresh authority and exact all-store comparisons, one strict transaction replaces the
  pointer and current encrypted chunks. If the new payload uses fewer chunks, this same transaction
  removes only the superseded `meta/["local-baseline", index]` values beyond the new bound. These are
  obsolete copies of the baseline carrier, not logical history rows. No content/head/outbound deletion
  is introduced; the metadata inventory remains bounded at one current pointer and at most 17 chunks.
- Only after its own successful atomic replacement may the owner release the old in-memory pointer pin.
  It clears its warm view and fully reopens/replays the new representation before releasing admission.
  An arbitrary pointer change or v2 downgrade during an ordinary ownership task still refuses.

A renderer killed after reservation reopens the previous anchor with its burned range. A renderer
killed after final commit reopens the successor and can retry the expected predecessor without another
allocation. This establishes renderer-crash behavior, not power-loss durability or protection against
rolling back an entire browser profile.

## Rotation and retained openers

Rotation still happens under exclusive slot ownership, before a new writer opens. It authenticates
the retained rotation proof and successor key, flushes pending old-generation journal work, verifies
the exact full spool/membership cut, reserves successor-key invocations durably in custody, and
re-encrypts every logical history row at its existing key/sequence.

With an installed baseline:

1. The carrier fully verifies baseline-plus-suffix against intact history. It snapshots the independently
   authenticated v3 counter and sealed baseline chunks and matches their allocation counter to the
   full history census.
2. The content re-encryption transaction preserves the old baseline pointer and ciphertext. It signs
   the advanced allocation counter in the v3 domain, including that pointer. Before commit, the owner
   repeats complete fresh custody/marker authentication. The transaction compares every history key
   and ciphertext, the old counter/MAC, and every metadata key/chunk; it rechecks journal emptiness
   synchronously before replacing any row.
3. The new reader accepts a baseline encrypted under an earlier retained generation. Its payload must
   name that exact pointer generation; current allocation/reservations cannot regress. Its authority
   epoch, network generation, predecessor cuts, signed boundaries and suffix are still verified by
   the existing transition replay. Advancing local encryption is not a grant of network authority.
4. Old openers remain mandatory. A missing opener refuses rather than dropping the anchor. This phase
   does not retire keys. A later explicit baseline replacement uses the current generation, but that
   alone does not authorize deleting other historical key/proof material.

The rotation adapter derives the prospective installation cut from the **authenticated** counter
witness and retained successor proof. This supplies the baseline reader before custody's final
`active_rotation`/membership commit, including restart after content switched but that custody write
aborted. Reservation updates to custody are reflected in the fresh-record comparison. The durable
rotation record and old openers remain available on restart.

Undo remains a live-owner property: replacing a baseline does not change it. Rotation keeps the
existing product rule of retiring the old editor and opening a new owner; it does not promise to
persist a live undo stack across closing/reopening. Journalled writing survives that boundary.

## Remaining reader audit

| Path | Disposition in this phase |
| --- | --- |
| Original/joined cold and live v9 owners; standalone v9 receive-store reader; reference audits | Already use the private baseline-aware carrier; now accept supported replacement revisions and retained earlier-generation anchors, with full/reference comparison |
| `accountRotation` | Supplies freshly authenticated proof/cut context, retains baseline metadata/openers during exact re-encryption, and resumes after interrupted custody activation |
| `accountCatchup.prepareUploadedCatchup` | Its separately created owner now supplies the same private baseline context and fresh marker/custody checks; an anchored single-device account can make the first approved-device checkpoint |
| `membershipSource` | Existing private adapter remains in use for later device admission, removal, replacement-device checkpoints and history preparation; the lifecycle journey exercises later admission/removal from anchored owners |
| Removed original/joined startup and live local editing/export | Verify the anchor under the last installed local authority **and** retain `verifyDetachedPrefix` against the authenticated terminal proof. No successor key or active membership is fabricated, and delivery/notification drivers remain disabled |
| Source selection, receive/delivery, export from the live workspace | Still receive full verified records/document. No reduced spool is passed off as full history |
| v4/v5 journal owner and upload conversion; v6–v8 preparation owners | Cannot install an anchor and already reject the later v9 owner/representation. They are not given a generic v3 downgrade or a new supported migration path |
| Generic Local salvage/clear, legacy cleanup, initial promotion/genesis | Not anchored Account readers; their existing ownership/version fences remain. This work does not make a trimmed Account clear/salvage path supported |

The explicit `requireFullSpool` guards in successor, membership and detached-prefix verification remain.
No supported consumer is switched to reduced history in this phase. All-device recovery's separate
product journey is not rerun here; terminal removed-copy behavior and its common local readers are
covered, but this is not a claim of complete recovery/restore qualification.

## Evidence and next boundary

[Focused evidence](./development-evidence/2026-10-13-local-baseline-lifecycle/README.md) records commands,
logs, source hashes and scope. Tests use generated credentials/content in disposable profiles. A busy
machine is suitable for these correctness checks; no timing improvement is inferred.

The next bounded work is the **retirement evidence contract**: settle what must survive for outstanding
old network reads, old checkpoint cuts, and restoration of a journal paired with an older database.
Then implement/test an exact atomic deletion transition and all resulting reduced-reader paths.
The current 4 MiB payload bound, full/reference replay, disabled anchored warm fast path/compaction,
and lack of an external whole-profile monotonic witness remain explicit limits. Public activation
still requires reader-before-writer rollout and a compatible rollback plan; an older image or disabling
this private flag cannot reopen a newly anchored/replaced/rotated profile reliably.
