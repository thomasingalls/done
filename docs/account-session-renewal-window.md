# Rapid-reopen session liveness

2026-10-13. Base: signed `47466b84` (reader-first compatibility). This bounded service repair
does not enable local history conversion, change stored/wire formats or resume release validation.

## Failure and selected behavior

Every fresh network-login owner renews its short-lived access token using the encrypted remembered
session. The service previously refused a ninth live token with `capacity`, even though the same
authenticated login was still valid. Tokens live up to five minutes. Rapid reopen/short-lived owners
could consume all eight and strand durable membership progress before another domain request could
be made. The reader-first lifecycle fixture encountered exactly that renewal refusal; a backend
restart discarded the volatile tokens and let it continue.

Keep the bound of **eight live access tokens per session**, but make it a window of the newest
issuances. A successful renewal retires the oldest-issued token of that same login when necessary.
Equal issuance/expiry times retain insertion order; token use never promotes an old token. Another
login, including one for the same account, keeps its own window. This permits brief overlap between
owners without forcing a valid remembered login to wait for token expiry.

This changes the bound's failure policy, not account authority. The normal HTTP rate/in-flight limits
remain. Attempts, sessions and grants retain their own bounds. Eight continuously competing owners
are not promised indefinite token usability: an older owner may need transparent renewal. Possession
of the renewal secret already authorizes replacement access, subject to every existing live check.

## Ordering and authority

`renew()` retains its `BEGIN IMMEDIATE` validation transaction: current session state, absolute
deadline, renewal-secret hash, active account, confirmed credential and complete credential binding
must all match. The response expiry remains the minimum of five minutes and the original session
deadline. Neither the renewal secret nor the 30-day login deadline rotates or slides.

Retire/install access only after that transaction successfully returns. Invalid requests and aborted
renewals do not retire valid access. The test hook's lost post-commit return also installs nothing.
If the actual successful reply is lost after installation, repeating renewal issues another token
under the same checks/window; it does not need an exact token replay or another passkey ceremony.
Only token hashes remain in volatile service memory; no raw access bearer is stored on disk.

Retired access receives the existing `access-required` refusal. The scoped browser transport already
clears only the matching cached access, renews once and reacquires a grant using a fresh signed device
proof. Its captured semantic request bytes and retry bound remain. A missing/revoked/expired login
still requires sign-in. Access never replaces membership, device or operation authority checks.
An already-issued scoped grant retains its original lifetime and current parent/session/device
checks; retiring access alone does not revoke that grant, just as ordinary access expiry does not.

Service restart still discards all volatile access/grants and uses the existing renewal path.
Revocation still invalidates the remembered login and is checked at guarded operations. No client
renewal algorithm, content admission, fresh final authority check, journal fence or undo behavior
changes in this phase.

## Compatibility and rollout

This is a service implementation change with the same session endpoints and response formats.
Existing cached clients already handle `access-required`. No schema migration, new token storage,
new user prompt or browser cleanup is needed. Rolling back the service restores the former capacity
failure; it does not invalidate stored session carriers or make local history unreadable.

The packaged defaults remain reader **on**, installer **off**, retention **off**. Private conversion
is used only to prepare disposable lifecycle fixtures. The reader-first publication still needs its
tested container identity and a retained compatible rollback image before any future writer release.
This phase does not publish or touch the deployed service or personal browser storage.

## Focused evidence

The [packet](./development-evidence/2026-10-13-session-reopen/README.md) records the deterministic
before/after control, the real browser-client renewal/grant tests and the packaged lifecycle rerun
without its backend-restart workaround. It distinguishes a failed validation return from an installed
token whose response was lost. These are bounded liveness/correctness checks, not timing or
multi-instance capacity claims.
