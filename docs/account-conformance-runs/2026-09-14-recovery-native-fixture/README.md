# Account recovery native fixture — 2026-09-14

One complete file / **one case passes in 33.310 seconds**. Node execution took 8.529 seconds
within 120; stage time was 11.013. The case retains its 40-second limit and original recovery scenario.
Authority is signed and verified as `be8749f`; new work is uncommitted.

- Both full browser restarts use one persistent profile and three distinct, cleanly closed browser PIDs.
- Virtual WebAuthn credentials are explicitly restored after the first restart.
- IDB aborts, saved-code reentry, tab exclusion, cancellation, renderer death and lost reply are exercised.
- Fourteen native-owner controls pass, including reopen and worker death after reopening.
- All 92 runner checks, TypeScript, scoped style, planning, authority and signatures pass.

The persistent owner adds two bounded reopens after clean exit. No generated histories run here.
Virtual credentials do not establish hardware persistence; one row's literal-code check is not a profile
privacy oracle. The account stays pending. This is recovery-code preparation/confirmation, not full
account recovery/adoption. Wrapper and broader service-only evidence remain separate.

[summary.json](./summary.json) records precise scope and timing. The compressed [artifact index](./artifacts.json.gz)
pins complete receipts/profile records, native-owner controls, exact patch, source/browser identities,
base signature and preservation. Raw inputs remain at `test-results/release-validation/2026-09-14T09-06-17.787Z`, with hashes retained here.
All 191 prior contracts, 52 personal/vector pins, L-2 and historical archives remain unchanged.
General selections contain 192 files / 1,643 cases; 225 integration obligations remain.
Next: **Account core native fixtures — two cases**.
