# Phase208 — retain genuine native approval and network login in the Worker realm

2026-10-29. Optional native opening adapter keeps the ORIGINAL PromotionOpening/RecoveryOpening
object references and original NetworkLogin instance. It captures slot/pin/references synchronously,
checks exact authority/slot/joined mode and login session configuration, consumes its routing once,
and memoizes original approval-lifetime cleanup. It does NOT create, clone, serialize or verify an
approval. ORIGINAL private WeakMaps, fresh binding/signal checks and one-use consumption still decide
access. Window inputs still refuse native opening/login objects. No raw key, token or SessionTask
crosses the port. Scope mismatch/refused or retired carrier cannot consume again.

Same-Worker native handoff accepts an optional original opening owner only within the Worker realm;
expiry/failure retires it and physically ends Worker, successful role takes the references locally.
Original Account factories receive them while all original factor/authority/history/commit checks run.
Original NetworkLogin initializes/prewarms/unlocks once in preparation and activates only on the new
actual Account owner; it stays a native User-lifetime vault owner as in original Page setup. No extra
crypto construction, modified key format or plaintext persistence. Actual original preparation task
root/factor buffers dispose before handoff; original new-owner login/approval cleanup runs on close.
Scoped approval signal intentionally survives planned ceremony-root retirement, and retires with the
original approval owner (not an entire UI controller close that could wait on itself).

Seven new reference/scope/mode/close/failure cases;31 focused/98 metadata/type/lint/format/audit pass.
473 sources/198 domain homes, no home/site change. Independent AST specialization removes ONLY the
optional native adapter and recovers the original Account body. Original WeakMaps/verification/consume,
NetworkLogin, startup/factor/task/authority/history/Window/join/handoff/passkey bodies byte unchanged207.
No old tests edited/deleted or deadlines weakened; new tests required/uncredited. No full-suite/timing
acceptance. Existing182/187/205 blockers remain open, including both205 cold-reader failures.

Native TEST composition uses ORIGINAL withPromotionSlot/readPromotion/withPromotionRoot and actual
original passkey verifier to mint a GENUINE approval. It retains only that same-realm reference, with a
separate original approval signal; no test crypto/verification replacement. Chrome3 pass: genuine
approval without login, genuine approval WITH original live NetworkLogin/composed Account owner, and
structured clone of genuinely minted approval rejected by ORIGINAL private WeakMap. Both successful
cases issue ONE original provider prompt, ZERO additional Account prompts, stay in SAME physical
Worker, admit input with zero port requests and cold reopen exact writing with original packaged
reader. Clone refusal preserves original writing. Chrome2 unchanged default/bad-passkey controls pass.
Five exact owned containers absent. Source-map bodies match actual production code, fictional isolated
profiles/virtual credentials only, no real data/CUA/vault. No Firefox approval credit (virtual provider
is Chrome-only); prior Firefox handoff evidence remains scoped to its tested source.

Next connect the original wizard/native browser/setup-workspace ports to this tested handoff, complete
Account UI and offline/default conversion, THEN unchanged16ms input/2.5s peer/all-marker/30s delivery
measurements. No staging/signing/push, preview8443, release/deploy or service-history automation.
