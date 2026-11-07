# Phase289 — fresh bounded range preparation

2026-10-30. New prepareInboundRange shares the existing verifier and owned snapshot capture. It
validates a1–4position allowance, selects the offset from the independently supplied current native
prefix, and authenticates original request/page signatures again on each call. Each selected
position/link/envelope/actor/history/lifetime/expiry check remains. A selected invalid entry returns
no partial result. No retained-old-event shortcut; an exhausted original refuses. Nothing here
commits native state, changes a fairness cursor or caches a completed proof.

Only fitting selected results escape the existing byte/record limits; unused verified plaintext is
erased. A conservative indexed-record size hint can return no result to request narrower work;
it grants no evidence or progress. Strict verifyInboundRange retains its complete-range bounds and
all-or-nothing behavior. Original one-entry/v1 semantics and all old tests/assertions remain.

Eight new cases pass, including original indexed bytes, fresh continuation, remaining allowance,
expiry/link/retained/consumed refusal, invalid selected tail, record fitting and late retirement.
An added exact signature-count assertion independently confirms2header+8entry verifications on
a resumed four-position turn. Three isolated faults are detected: ignored allowance, restarted
original prefix and hard rejection instead of fitting prefix.89focused units pass. Full Vitest
2840pass/oneexisting skip,280files; the stronger signature assertion was added after that run and
its8-case focused rerun passes.119metadata checks,7repository contracts, types and scoped lint/
format pass; affected inventory/manifest/identity checks rerun after that assertion is recorded.

Initial implementation import pulled the admission queue through receiveGroup into the isolated
crypto control bundle, producing relative split-chunk failures in8old mutation tests. Preserved;
fixed the dependency by moving the single unchanged four-position fact to pure receiveLimits and
re-exporting its old home. The unchanged8old controls then pass. Initial new continuation fixtures
wrongly carried retained old-event evidence; corrected before the frozen red phase288, with its
explicit refusal test retained. No old test machinery/assertion was modified to get a pass.

Independent bookkeeping:504runtime files (new pure limits module),199unchanged domain homes;
2existing source identities changed. All78specified and16open constructions retained. All1031old
manifest rows retained; the open range construction gains this API/test dependency only. One
required uncredited test added:1032rows/485unresolved. No aggregate qualification credit.

Preparation API is not wired into the writer yet. Next bounded raw-original ownership and8-entry
planner, with native four-position admission, clean size fallback and real deep8/fairness checks.
V2 remains development-only. Page64 deep, repeatable date fixture, withheld/normal gates and native
stale-tab/rollback observations remain before release work. No limit/gate/backoff/flushing change,
normal Page/Worker comparison, service automation, signing/push/deploy/preview/computer use or
personal-profile access.
