# Phase 2 — account setup asks for an issued factor only

Predecessor: phase 1 removal overlay. Base remains signed `1849721ee612`; no new commits.

Contract: SC-06/08 and PRD onboarding amendment. Freshness is established by the existing storage owner, never a saved UI hint. Existing protected/connected workspaces retain all factor, passkey, promotion and network verifiers. Refusals are not permission to enroll or reason to request a nonexistent factor.

Baseline: seven of nine new unit cases fail and two pass; four of five new packaged browser cases fail, while the genuine fresh-account generation/confirmation/cold-unlock case already passes. The repair adds a blocked storage state, preserves migration/repair/removal refusals, provides account-selection/check-again actions, and returns automatic Local lists to explicit protection. Classification is repeated before code issuance; final genesis and registration owners are unchanged. Known confirmed/connected ceremonies still use their existing authentication continuation.

Final pinned Node 24 evidence: all 36 affected unit cases pass (10 new account-entry cases, 4 new removal cases, 22 existing), and all 13 packaged cases pass (5 new, 8 existing onboarding). Typecheck and build pass. Cases cover legacy DB/journal, changed storage after intro, unreadable/missing setup, unfinished removal, unconfirmed-code cold reissue, confirmed-code cold refusal of a wrong factor, and automatic Local writing preserved on returning to protection. The browser removes only its disposable blocked account attempt and independently checks old Local carriers remain.

A new deletion-control mock initially omitted its native request error, causing a rejection with undefined rather than a defined exception. That failed attempt is retained; the mock now supplies a realistic DOMException. No deadline or old assertion changed. No real Firefox/Bitwarden, aggregate qualification, publication or preview adoption claim.
