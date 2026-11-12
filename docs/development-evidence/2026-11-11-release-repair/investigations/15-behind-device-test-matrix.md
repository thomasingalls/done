# Devices behind a prune, rebuilt to trip the failure

A delegated agent's report from 2026-11-12, filed as delivered. Run in copies of `2277ef5db` against the service started the production way, three devices, with failing controls. Paths under `/private/tmp` were session scratch space and no longer exist; the supporting files that mattered are under [support](./support/).

**What happened next.** The reduced-peer strand it reproduced is being fixed by verifying the cut, which the operator chose on 2026-11-12; the six-line skip draft it mentions was rejected. The two conditions it did not reach are HIST-UNTESTED in the product backlog.

---

## Phase 544 follow-up: behind devices, the reduced-peer strand and the history gate (all in copies)

**Bottom line:**
- **Ordinary lost phone: recovers.** A device that took no part in the snapshots, came back after two prune cycles and held unsent writing caught up, sent its writing, and converged by Yjs state and by text. That holds in both orders, with about 1 MB of history and conflicting edits.
- **Negative control: fails as it should.** With history fetch held on the returning device, the same test ends with that device missing 759 of 916 writing markers.
- **The gate depends on configuration, and both outcomes are now shown.** Production `/config` advertises continuation, so devices fetch. With that flag off, a two-device reader at epoch 3 never fetches and strands.
- **The reduced-peer strand is real.** I reproduced it with three devices, and a drafted fix recovers it.
- **New limit: 4,096-position replay bound.** No snapshot can be created or verified once more than 4,096 positions have been accepted since the last admitted snapshot (or ever, if there is none). Verified at node level.

My earlier report's conclusions were provisional; their current status is at the end.

All runs used copies from `git archive 2277ef5db`. Tools ran through `node` directly, never `pnpm`, on ports 53421–53443. I made no edits in the worktree. Copies are deleted and nothing of mine is still running. The machine was loaded by the phase 545 session throughout, so timings are indicative only.

Copy-only seams (diff in `copy-only-seams.patch`):
- `__holdHistory`: receive passes skip the catalog check.
- `__holdReceive`: receive away.
- `__allowReduction`, plus retention threshold 1, quiet 3 s, cooldown 1 s.
- `/config` omitting the continuation flag when `COPY_CONFIG_CONTINUATION_OFF=1`.
- A page global giving the Yjs state vector and snapshot at export.

The "production entry" runs used `scripts/public-account.mjs initialize/api/app` behind an HTTPS terminator with an ephemeral certificate.

### Matrix

| Scenario | Built to expose | Sizes | Result | Negative control |
|---|---|---|---|---|
| Gate, production entry, 2 devices (returning device verified, receive away) | A device that never fetches history after pruning | 135 positions (60 pre-floor, 40 between, 30 after prune), 5 unsent cards, epoch 3 | `/config` has `membershipContinuation: true`. Caught up within 5 s, 136 positions, state and text identical, 0 missing, 0 duplicated | Same entry, flag off: 0 catalog reads in 120 s, 130 markers missing, still showing receive:network-unavailable at the end. Its own writing still reached A |
| Lost phone, production entry, 3 devices: C offline for everything, two prune cycles (snapshots 2 and 3 became receipts), install-first | Uninvolved device cannot catch up, loses or duplicates writing, or diverges | 916 markers: A ~740 positions incl. 200×5 KB cards, 300 past the latest snapshot; B 20; C 3 accepted plus 150 small and 3×5 KB unsent (7 envelopes). About 1.04 MB of text, 82 read requests | Caught up in about 20 s. State and text identical on all three, 0 missing, 0 duplicated | C's history held: converged=false, C missing 759/916, network-unavailable throughout, C's writing still reached A and B |
| Same, send-first, C reduced locally while offline with unsent writing | Order dependence; reduced returning device | Same sizes; C baseline revision 1 | C's writing accepted and on A within 10 s while C could not receive. After the catalog was unblocked, catch-up took about 150 s with network-unavailable shown from about 90 s (cause not established), then converged | Covered by the row above |
| Own stream cut before the producer received it (inside both lost-phone runs) | Producer cutting C's stream ahead of its own receive | A cut snapshot 2 with receive held, after C's 3 accepted cards | A later received them; converged | Covered by the lost-phone control |
| Conflicting and deleted-context edits (inside both lost-phone runs) | Unsent edit inside text deleted before the snapshot; concurrent appends | Goals text | `C-INSIDE` (written inside a word A deleted) survives once on every device. Both tails kept. Deleted words gone everywhere | Under the control, C lacks A's deletion and tail |
| Prune while the returning device is mid-receive | Reads crossing a prune | 4 runs: read delay 2 s, 6 s, hold-after-install, hold-from-return | All converged, but **not demonstrated**: at every prune C had already installed the newer snapshot (6 or 7) at its next catalog check, so it was never behind the new floor. No read returned "unavailable" | Not applicable |
| Reduced peer, 3 devices, dev runtime: C reads B past a pending snapshot's cut, drops A's reads, reduces offline | The reduced-peer strand | Tiny | **Base: stranded** (details below) | — |
| Same, with the draft fix | Fix recovers | Same | Recovered within 45 s with no further action; consistent after reopen | Base run above is the control |
| Replay property, Vitest, two cases | Baseline replay differing from full replay; tampering | memberFixture | Fix: 2/2 pass. 43 of 44 neighbouring baseline tests pass; the one failing is the case that pins the old refusal and must be restated | Base: 2/2 fail ("history-required", "requires retired history") |
| Replay bound, node | Create or verify past 4,096 positions | 4,096 vs 4,097 positions (512 pages) | 4,096 replays in 3.9 s | 4,097 refused: "History replay exceeds its event bound" |

**Sizes not reached:**
- **Thousands of positions past the floor through the UI.** I reached about 740 A positions and 300 past the latest snapshot. Separate positions need separate publication windows (about 2–3 per second), so thousands would take 15–30 minutes per run.
- **A snapshot at the install bound.** Reached about 1.04 MB of text, an estimated 78% of the 4 MiB install. A single 20 KB card sat at "Waiting to save…" for over 30 s (seen once, under load), so I used 5 KB cards.
- **Hundreds of unsent positions.** The client packs offline edits into a few envelopes: 150 cards plus 3 large ones became 7.
- **The 4,096 bound through the UI.** Built at node level instead.

### Production configuration: what makes a device fetch
Each link verified by reading; the run evidence is noted where it exists.
1. **Container entry.** `Dockerfile:79-80` runs `scripts/public-account.mjs`. That goes `public-server.ts` → `public-runtime.ts` → `openPublicState`, which builds `AccountCore` with `membershipContinuation: true` (`public-state.ts:170`).
2. **Service side.** `session-host.ts:32` puts the flag in `/__account-setup/config`, and `scoped-http.ts:97` registers the history route only when it is on. Run: production `/config` returned `"networkSessions":true,"membershipContinuation":true`.
3. **Client side.** `packagedConfig.ts:79-111` reads the flag (and caches it at :145 and :175). `windowCeremonyUi.ts:317` and `:407` pass it to the Worker.
4. **The gate.** `accountReceive.ts:1717-1724` fetches if continuation, installed or inherited history, epoch past 3, or generation past 1. Runs: a two-device account is at epoch 3 and depends on the flag (both outcomes shown). Three-device accounts are at epoch 5 and fetch regardless.

So the sibling's reading of the gate is right; it only bites where the service does not advertise continuation, and production does.

### Reduced peer

**Reproduction, base build.** The test seams only create the timing.
- C fetched the catalog and snapshot 3, did not install it, and its reads of A returned 409 "unavailable" on growing backoff.
- At 45 s it showed "Changes from your other devices are not arriving here." with receive:network-unavailable and Retry receiving. The menu said "Receiving: retrying, Received positions: 12".
- Twelve seconds later, after B wrote, the notice was gone, so the stall can be silent while another device's writing still arrives. In an earlier run there was no notice at 45 s at all.
- New writing from B still arrived, and C's own writing reached A.
- Reopening did not help. Only a newer snapshot whose cuts were all at or past C's frontiers recovered it, about 25 s after admission. In practice that means someone creates and verifies another snapshot on two other devices.

**What triggers it in real use.** C has to read B past a pending snapshot's cut, then reduce, while it lags on A and never installs the previous snapshot.
- Normal reduction requires sync to be quiet, which normally means caught up. But "quiet" also counts offline and halted lanes, and phase 539 lets full-check devices reduce while behind.
- C also installs each new latest snapshot at every catalog check.
- So the realistic cases are a slow device whose passes span a manual verify and prune, or one whose reads of one publisher fail.

**Why the refusal exists.**
- Commit `43fe12aa0` (2026-10-13) added it, documented in `docs/account-local-baseline-transitions.md`: a signed checkpoint alone cannot show that an unknown old link agrees with retired local history.
- The rule is recorded in the 2026-10-13 decision "Select local retirement evidence rules before deleting history" (`decisions.md:4531`) and in `docs/account-local-retention-evidence.md` rule 4, which also says not to silently omit one publisher's cut.
- That decision accepted this availability limit and said it must be surfaced to the person. Today it shows as network-unavailable.
- `retentionCheckpoint.ts` came in `bcca1aa14`.

**Does skipping a cut the device is already past keep that protection? Partly.**
- Kept: no cursor moves; the cut is never used as a link for progress; admission, signature, coverage and regression checks are unchanged. A cut that meets retained evidence must still match it (four tampered cases refuse in the Vitest draft).
- Lost: refusing to merge snapshot content when one publisher's cut cannot be checked. A cut behind the reduced frontier that is inconsistent with it would be merged silently. Today that same case is skipped silently, not raised. Producing such a fork needs the service to equivocate between readers.

**Draft fix.**
- `inboundLedger.ts`: two throws become `continue` (own cut below the origin with no pin; peer cut inside the retired range with nothing known).
- `retentionCheckpoint.ts`: one throw becomes `continue`, and the unused import is removed.
- Size: about 6 changed lines plus comments.
- Tests: new `test/reducedPeerCut.test.ts` with 2 cases, plus a restatement of the existing `localBaseline.test.ts` case "never trusts a checkpoint cut at a retired unknown link" (drafted).
- It **amends** the 2026-10-13 decision and both docs above.
- Property asserted: a baseline replay with an older snapshot installed after reduction gives the same cursors and installed history as full replay, and the live gate agrees.
- Cold reopen goes through the same baseline replay; the reduced-peer browser run reopened consistently. No dedicated cold-reopen unit test.

**Alternative that keeps the decision.** Verify the past cut by reading that publisher's entries from the cut up to this device's retained frontier, which sit above the pruned floor, and checking the chain. A mismatch is an integrity refusal. About 100–150 lines in the receive fetch and install flow plus tests.

**The same shape elsewhere.**
- `checkRetainedCheckpointCuts` (`retentionCheckpoint.ts`), the live gate that runs first, is in the draft.
- `contextAt` (`inboundLedger.ts:362`) applies to reads and is correct as it is.
- Baseline stream justification is unaffected: a skipped cut never sets a frontier.
- The producer and admitter replay in `historySource.ts` is unaffected.

### Key rotation across a prune (read only, not run)
- **Order.** In each pass a survivor adopts the new authority before installing history (`refreshAuthority` precedes `receiveHistory`, `accountReceive.ts:4100-4110`).
- **Rotation records survive pruning.** Prune rewrites only history records and decisions (`historyCheckpoint.ts:620-647`).
- **Keys.** The snapshot opens with the current and retained generation keys (`historyInstall.ts:130`).
- **So:** it should adopt, install and continue. If adoption stalls, the pass returns before history and shows network-unavailable. A removed device becomes a detached copy. `missed-rotations.spec.ts` covers missed rotations, but never together with a prune.

### Status of my earlier report
| Conclusion | Status |
|---|---|
| Every production device fetches history | Now shown by run, and made precise: it depends on the production config flag for two-device accounts at epoch 3 |
| The lost phone recovers | Verified with three devices, larger sizes, both orders and a negative control |
| Unsent writing is kept and sent | Verified, including conflicts and deleted context |
| Nothing stops a prune while a device is behind | Still by reading |
| Inferred never-fetching strand | Exists only when the service omits continuation |
| Reduced-peer strand | Reproduced |

### Other things noticed
- **The 4,096 replay bound**: any account past it can never create or verify a snapshot again, so it can never be pruned, and the view shows only the generic error.
- **Slow send-first catch-up**: about 150 s, cause not established.
- **20 KB card stall** at "Waiting to save…" for over 30 s (seen once).
- **Silent stalls**: the receive notice disappears while another device's writing keeps arriving, so a strand can show nothing.

Evidence (specs, `fix.patch`, the restated test, run outputs and timelines, seams diff) is in `/private/tmp/claude-502/-Users-thomasingalls-Code-done--claude-worktrees-l2-onboarding-863db1/a2cb3ea1-c2ed-4b47-b08f-dc5bb9d6e506/scratchpad/reduced-peer-evidence/`.
