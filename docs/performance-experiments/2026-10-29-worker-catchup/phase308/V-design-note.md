# V is an unqualified validation upper bound, not a landing repair

Fresh rows in an ordinary live round come from contentStore.load. After the private warm owner
authenticates the current counter and checks store counts/first/last keys, it audits a bounded
sealed slice. It then lends openedView.opened for a selective load, or creates detached plaintext
copies for an ordinary load. Successful appendRecords commits extend that same owner view using
its captured new plaintext, only after compareAndWrite succeeds. Reservation alone does not
append rows; failed commits, invalidation, replacement and reopen destroy/change the owner view.
A forced/full read instead scans sealed rows, checks placement/counter/MAC, compares retained
sealed evidence where eligible and decrypts changed rows. These paths are in contentStore.ts
load/openSnapshot/appendRecords, and accountCapture.ts opts the private owner into warm loads.

The growing comparison is not normally a fresh full disk read: current warm rounds repeatedly
copy or borrow that already-owned plaintext prefix, then verifiedRecords.verify and
incrementalAccountLedger.appendedRecords compare it with independently retained plaintext.
V attaches ephemeral array provenance only AFTER the existing counter/shape/audit checks.
Copies propagate that provenance; successful exact comparison seeds it on the first retained
view. Same-owner evidence skips old-prefix byte/metadata walks and validates only the suffix.
All new suffix signatures, authority/history, coverage, fresh counter, commit checks and journal
admission stay. It does not remove necessary detached copies or every O(n) census/index loop.
Full/reference paths disable the shortcuts, including the unchanged1024-record semantic oracle.
The separate bounded sealed-row warm audit is untouched. Cold read has no provenance.

What the full comparison protects that lease/counter/audits do not: correspondence between the
exact plaintext being offered NOW and the prior verified projection. A valid lease serializes
operations and fences lifetime; it does not make a Uint8Array immutable. The authenticated
counter describes allocation/generation/witness state, not the identity of every mutable
plaintext buffer. A same-shape mutation/aliasing/incorrect reuse of a cached prefix could leave
the lease and counter unchanged while changing that correspondence. The eager comparison
detects this at the use boundary. The rolling disk audit checks sealed rows, not the independently
retained plaintext projection, and is bounded/delayed. The1024-record reference audit is periodic
and can be deferred; it does not establish per-operation equality before the next audit.
Conversely, a warm plaintext comparison is NOT an immediate check of every unread disk byte: do
not overclaim that it detects arbitrary disk tampering before the disk slice is read.

Concrete falsifier: mutate an old warm plaintext buffer without changing its sequence/generation
or counter, leaving the verifier's detached old copy untouched. Today's full comparison notices;
V's provenance assumption can miss it until another full/reference path. This is a deliberately
unproven immutability assumption, so V remains lab-only with no verification/security credit.
Landing would require an enforceable immutable-prefix ownership contract and independent
sensitivity evidence, or a different proof. No persisted trust, cross-owner handoff or new format.

Audit-unit precision: accountReceive.ts increments sinceAudit by all newly appended physical
records. The current reference trigger also requires a newly appended state row after that
count reaches1024 (or the existing explicit every-audit flag). That state predicate and
cancellation/defer behavior are unchanged in V. Thus neither the threshold nor the warm disk
audit is a promise to compare every prior plaintext byte on each live operation.
