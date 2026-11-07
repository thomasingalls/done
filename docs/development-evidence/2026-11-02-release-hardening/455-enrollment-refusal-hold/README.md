# Phase 455 — stop cohort preparation at enrollment refusal

The current-date H6/M2/Q2recipe uses real current account/device setup and exact
pre-backlog exports. The first app attempt certifies all six Hdevices and their
archives agree. It then waits for a test-only global on navigation that the
shipping SW intentionally resolves to its app shell. Preserve that failed
attempt and repair only test-document routing: use the already attached
authenticator CDPsession to bypass the SW for that navigation, restoring normal
handling before opening a native owner. No unregister, credential detach or
application/SW change. Also retain the earlier ESMconfig --list directory-import
error, before app/test execution, and its package-specifier repair.

The fresh retry reaches an actual app refusal on the second device: `Expired
enrollment challenge`, candidate state `enroll`. The existing helper's waiting/
display assertion fails at its unchanged15sbound. Stop here under the Stage5
functional-refusal rule. No further app run, timing, relaxed expiry or guard edit.

Inspect only a private copy of the closed retry service DB. Its one preparation
is still `challenge`; the saved expiry is583,588.6msafter the host run ended.
The run spans25.655s including wrapper time, not ten minutes. The shared error
also covers `expiresAt-now >600000`; this makes browser/service clock disagreement
plausible, but no clock offset was measured and the failing inequality is not
proven. The original service DB/inventory remains byte-identical after this read.
No codes, signing keys, writing or account identifiers appear in this record.

All failed roots and five-second host/display/swap/power-window logs remain.
No Stage5timed journey has started.454'sbinding smoke and452's15functional cases
stand separately. Native456bindings were prepared but never executed. Diagnose
the refusal before another setup/timed run, then finish fixture/closure binding
and obtain the required latency-sensitive quiet-host handshake. No commit, push,
publication, deployment or access to real accounts.
