# Phase235 — preserve live passkey cancellation across the Worker boundary

2026-10-29. A live provider NotAllowedError/AbortError becomes one fixed credential-specific
transport code, reconstructed as the native cancellation DOMException. No raw provider message
crosses the port. Root/Task/prompt withdrawal wins over a late response, disposal remains unconditional,
and malformed or generic replies remain refusals. Original credential consumers/cryptographic checks,
Task authority, storage and generic channel are unchanged234. No old test edits.

Before: six new controlled cases have three failures; original twelve compatibility cases have one
failure (cancelled setup reports a generic error). After:36 focused,99 metadata,type/lint and all12
UNCHANGED browser cases pass. Original offline Local access, same resumable setup, altered assertion
refusal, provider JSON compatibility and automatic deletion/legacy preservation assertions remain.
Clean source-map bodies match checkout. No profiles, factors or error-context files archived.

Remaining boundary/offline/mixed checks and open182/187/205 review precede unchanged16ms input,
2.5s peer/all-marker and30s delivery measurements. This is functional evidence, not qualification or
performance acceptance. New tests required/uncredited; qualification paused. No real staging/sign/
push, preview8443, release/deploy, service automation, computer use or physical-device access.
