# Forensics on the two packaged failure signatures

2026-10-10, at `0332a9ea`. Read-only analysis by a delegated agent of the Claude review session, from
the logs retained in the [consumers packet](../2026-10-10-account-consumers/README.md) and from
committed code. Nothing was run. It was written before the [reproduction](./README.md) finished; the
closing section compares the two. The working tree in `c030` was being edited while it read, so it
cites committed code through `git show 0332a9ea:`.

**Headline.** Neither signature needs a ledger defect to explain it, and the retained evidence shows
none, though it does not exclude one. The enrollment refusal is a race in code the three latency
commits did not touch. The late delivery fits a retained send back-off that the test's own aborted
submits create, made worse by the shared service rate limit. The retained measurements also show the
incremental path making about three times as many requests per key as the reference path.

## 1. The journeys

Each test starts its own backend (`test/packaged-account/server.ts`), so each gets a fresh
120-request budget. The app is served from `resolve('dist')`; the retained ordinary logs do not record
which build that held.

**Pairing** (`devices.ts`, both tests). The first device creates an account and invites; the second
joins. The first clicks "Compare and approve". Both must show "Content access is installed and
certified." within 30 s (`devices.ts:29-33`, first device checked first).

**Peer/history journey** (`history.spec.ts:52-190` at `0332a9ea`):

1. The second device writes and the first must see it (15 s).
2. Both devices get `route.abort()` on `**/account/delivery/submit` (`:70-71`). Call the first
   device's first aborted submit t0.
3. Both write. The first creates a history snapshot.
4. The second verifies it, with an injected IndexedDB abort of the content and heads transaction
   (`:83-100`).
5. The second reloads and reopens; the install retries.
6. The second locks, goes offline (its context only), reopens, then goes back online.
7. Both routes are removed (`:148-150`), and the second runs `inspect`.
8. The first writes "First device after maintenance". The second must show it within 15 s (`:153`).
   This is where the delivery signature fails.

## 2. Late peer delivery

**Most likely mechanism: retained send back-off on the first device.**

- An aborted submit returns null (`privateDeliveryHttp.ts`), so the pass ends `unknown`
  (`accountSyncDriver.ts:338`) and counts as a failure (`:195-197`). Delays run 1, 2, 4, 8, 16, then
  30 s, with failures capped at 6.
- Attempts therefore land near t0 +0, +1, +3, +7, +15 and +31 s, plus pass time.
- A local edit does not shorten an existing wait: `wake('local')` only sets `due` when it is undefined
  (`:245-247`).
- Only `online`, `authority` or `retry` wakes reset `due` (`:251`). `online` comes solely from the
  browser event (`accountReceive.ts:1927-1928`).
- Removing the route fires none of these, and the first device's context never goes offline.
- The outcome is therefore bimodal. If the routes are removed before the fifth attempt (about
  t0+15 s), that attempt succeeds and the test passes. If they are removed just after it, the next
  attempt is 16 s later and misses a 15 s deadline. The maximum wait is 30 s once failures reach 6.

**Evidence for.** Both retained passing console logs show exactly four aborted submits on the first
device (`packaged-debug-2.log`, `packaged-baseline-debug.log`). Both retained failures
(`packaged-final.log`, `packaged-default.log`) are at `:153`, with total run times of 40.7 s and
41.5 s.

**Evidence against, or missing.** No console or scheduler capture exists from a failing run, so "five
aborted submits in failing runs" is inference.

**Contributing or alternative mechanism: service budget exhaustion,** established as present. In the
passing `packaged-normal-diagnostic.log`, 12 and 14 of each device's last 30 replies are 429s, on
`read-v2` and `history/v1/checkpoint`. A 429 is retried inside the transport after 1 s and then 2 s
(`scopedTransport.ts:179`, `196`), within a 10 s request limit (`:298`). During those retries the
device's single scheduler pass is held (`accountSyncDriver.ts:149`), so its other lane cannot run. A
third 429 becomes a lane failure, and once a receive lane has failures, notification hints no longer
expedite it (`:240`).

**Not excluded: a halted lane.** Any exception from a lane sets `halt = 'operation-failed'` (`:218`),
and only a manual retry clears it. Passing runs show such failures only from retired schedulers at
navigation. Failing runs have no capture.

**Reference path exposure: identical.** The scheduler, transport and test are unchanged since
`23fd688d`.

## 3. Enrollment `authority-changed`

**Where the refusal is produced.**

- Service, at grant begin, finish and on every authorised operation (`grants.ts:224`, `243`, `309`,
  `397`). It fires when the grant's fingerprint no longer matches. The fingerprint covers the
  workspace authority snapshot plus the enrollment preparation row (`grants.ts:47-50`, `111-126`).
- Service, as a ceremony domain refusal (`ceremony.ts:178`).
- Client: the transport evicts the grant and throws `NetworkAuthorityChanged` without retrying
  (`scopedTransport.ts:370-371`). Only `grant-required` gets a transparent retry (`:355`).

**Mechanism.** The committed `deviceEnrollment.operate` retries exactly once
(`deviceEnrollment.ts:887-896`). One approval continuation can legitimately meet two authority
transitions: the approver's own transfer, then the joiner's certification. A second refusal is thrown,
the UI sets an error (`AccountEnrollmentApp.tsx:204`), and polling stops while an error is shown
(`:236`). The approver never reaches "certified".

**Evidence for** (`packaged-deadline-diagnostic.log`, first device's last replies, milliseconds after
1791668150000):

| Time | Request | Status |
| --- | --- | --- |
| 6872 | `ceremony/transfer` | 200 |
| 6979 | `ceremony/exchange` | 409 |
| 7034–7040 | grant begin and finish | 200 |
| 7131 | `ceremony/exchange` | 200 |
| 7256 | `ceremony/transfer` | 409 |
| after 7256 | nothing for about 30 s | — |

The joiner printed "Joining state: certified", so it is the first device that lacks the text. There
are no 429s in that window.

**Evidence against, or missing.** The 409 bodies were not captured, so the second could be a domain
refusal. The joiner's request times were not captured.

## 4. The 429s

**The budget.** One bucket of 120 refilling at 2 per second, shared by all clients; a 429 is not
charged (`scoped-http.ts:161`, `209-211`).

**Self-induced requests.** Each accepted position costs four requests: submit, discover, history
checkpoint and `read-v2`. The service hints every subscriber, the submitter included
(`notifications.ts:38-47`, `scoped-http.ts:283`), and the client answers a hint with
`resetDiscovery()` and a receive wake (`accountReceive.ts:2011-2012`).

**Request rate, single device, fresh account,** from the retained summaries of the earlier packets:

| Build | Requests per key | 429s seen |
| --- | --- | --- |
| Reference (`343c4bce`) | 0.5 | none |
| Self-stream repair (`d5763346`) | 0.6–0.9 | none |
| Incremental (`4500d9b6`) | 1.6 | yes |
| Consumers slice (`0332a9ea`) | 1.6 | yes |

At `0332a9ea`, 100 keys took 15.4 s and made 158 requests, about 10 per second, against 120 + 31
available; six were refused, including one `delivery/submit`. At depth the candidate makes 0.4–0.5
requests per key against 0.2–0.3 for its baseline. So on the incremental path one device typing
exceeds the budget in about 15 s, and two devices do so sooner. The reference path drains it in
roughly 150 s of continuous typing, by arithmetic from 97 requests per 200 keys.

**What each client path does on a 429.**

| Path | Behaviour |
| --- | --- |
| Transport | Retries the same bytes after 1 s and 2 s, then throws `NetworkThrottled`; the grant is kept |
| Delivery submit and read | Swallowed to null, so the lane result is `unknown` and back-off runs 1 to 30 s; exact retained bytes are resent, nothing is half-advanced |
| History transport | Becomes `HistoryTransportUnavailable`, so the receive lane retries |
| `deviceEnrollment` (as committed at `0332a9ea`) | Thrown; the user sees an error and polling stops |
| `membershipEnrollment` | Returns a waiting view |

## 5. Behavioural changes in `23fd688d..0332a9ea`

No commit touches the scheduler, transport, grants, enrollment or packaged tests. `d5763346` changes
own-stream progress (`advanceSelfReceive` in `accountSyncState.ts`); it can raise capture errors,
which would halt a lane, and that was not ruled out. The effect that does reach these paths is request
volume: faster passes produce about three times the positions and requests per key.

## 6. Production relevance on the reference path

- **Late delivery:** yes. After submit failures with no browser `online` event (a service restart or
  rollout, a silent network change, or 429s), a device's edits can take up to 30 s to leave even while
  the user keeps typing. A receiving device whose lane has failures ignores hints for the same period.
  This is delay, not loss.
- **Enrollment refusal:** yes. Approving a device can leave the approver on "Account authorization
  refused: authority-changed" while the new device shows certified. Saved progress is intact and a
  reload resumes it.
- **Budget:** global, so one busy client throttles every account.

## Candidate remedies, as ranked by this analysis

**Test harness**

1. Keep the scheduler and reply capture as a failure attachment.
2. Make the `:153` step independent of back-off phase by firing `online` on the first context or
   waiting on the reported next attempt. Do not simply extend the timeout; that hides the delay.

**Client scheduling**

3. Enrollment: treat a repeated authority-changed or throttled refusal as "waiting, retry soon",
   keeping the rule that no refusal authorises a new comparison or key wrap.
4. Cut self-induced requests per position. Do not reset discovery and history throttles on a hint
   caused by the device's own commit, and skip the empty own-stream read after a successful submit.
   Keep a periodic tip check for clone detection.
5. On a local edit or proof of reachability, cap the remaining send back-off at 1–2 s. Retries resend
   the exact retained bytes; the cost is a few more requests during an outage.
6. Treat a capacity refusal as "not executed": reschedule without counting a lane failure, and do not
   hold the single pass for 3 s inside the transport.
7. Send one position per typing burst. This is the largest cut in request volume and needs its own
   durability, attribution and undo-boundary analysis.

**Service**

8. A per-session or per-account budget sized to the measured pattern, under a global ceiling.
9. Do not hint the submitting connection for its own commit. Hints carry no authority.
10. Send `Retry-After` with 429s.

## Checked afterwards

Lines re-read by the coordinating session and found as cited: `deviceEnrollment.ts:887-896` at
`0332a9ea` (one retry on `NetworkAuthorityChanged`); `accountSyncDriver.ts:195-197`, `:238-241` and
`:245-253` at `0332a9ea` (back-off, hints ignored while a lane has failures, local wake only when no
wait is pending); and the requests-per-key figures of 0.5 and 1.6 in the retained summaries, with 429s
present only in the incremental builds' blocks.

Against the reproduction:

- **Enrollment mechanism: confirmed and sharpened.** All 62 pairings are separated by the order of the
  joiner's `install` and the approver's second `deliver`. The second 409's body was captured and is
  `authorization-refused` / `authority-changed`. The measured rate at `0332a9ea` is 24 of 50.
- **Retry schedule: confirmed.** Four aborted submits at +0, +1.2–1.4, +3.2–3.5 and +7.3–7.5 s, next
  attempt at +15.3–15.6 s.
- **The fifth-abort path was not observed.** The blocked phase lasted 8.7–10.4 s, well short of the
  15.4 s it needs, and no run failed the 15-second delivery assertion. The retained failures are
  therefore better explained as the retry wait plus budget-driven delay summing past 15 s, which is
  the contributing mechanism above.
- **Budget exhaustion: confirmed as universal** in two-device journeys, and shown causal for delivery
  time by lifting the budgets.
- **Remedies 2 and 3 are what `95923cd8` did.** The reproduction's follow-up measured 0 of 12 failed
  pairings after it.
