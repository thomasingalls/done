# Phase 15 — Disposable development setup server lifecycle

Parent overlay: `4b43e68a8b73427c6a75d5b3f501cf5d90645436`. No production changes.

Each stock setup run now chooses a unique service directory and requests bounded SIGTERM shutdown (ten-second cleanup grace). No old lock is removed or stolen. The existing private-file regression reads the actual directory from runner metadata, proves each operator key/database/pin file exists and then requires HTTP refusal; probing obsolete nonexistent paths is insufficient. All original nineteen cases, ninety-second case deadlines and registration/recovery/wrong-code/tab/owner-drain assertions remain. Normal CI runs this complete development walkthrough too.

Two consecutive full stock runs pass all nineteen cases: local Node 26.11.1 and CI-pinned Node 24.18.0. Their directories differ and both maintenance locks are absent after normal shutdown. The second complete JSON report, both logs and lock observations are retained. Eleven onboarding/browser planning cases, type checking, lint and diff checks pass. Node 24 was downloaded only into scratch storage and its archive checked against the official SHA-256 manifest; receipt retained. This is macOS Chromium evidence, not a claim that hosted Linux CI has run or that the real-provider walkthrough was repeated.

Planning stays 854/313 blocked; aggregate qualification remains paused. Existing shared stale state and all user preview state are untouched. No commits, signing, publication or preview update.
