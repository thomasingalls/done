# Signed-base comparison and dev offline fixture — phase 340

Every failed browser case also fails on unmodified signed base `89b11fe2` with the same Node/dependency lock and installed Chrome. The counter native module also reproduces its missing reservation mutation anchor before it can launch a browser. The baseline full-unit command again reaches the existing 120-second wrapper deadline (exit 143); that is a timeout, not a failing unit assertion. [All attempts and source identities](./evidence.json).

The diagnostic first failed before app launch because of its package import; the attempt and script remain. After that test-only repair, the offline trace shows zero service-worker registrations/caches, a failed fetch of `localOwner.worker.ts`, the Worker error handler firing, and the existing 5,000 ms cleanup timer firing before the UI changes from working to unavailable. Healthy startup/owner handoffs cancel their cleanup timers. This distinguishes the dev fixture's unavailable assets from missing error handling or the already-passing packaged offline path.

The dev-only Vite fixture now marks its frozen assets cacheable. It still runs the actual LocalApp, original Worker modules, storage, native lifetime fences and original startup.spec.ts unchanged. The offline identity test passes without changing its five-second expectation or any assertion. The packaged-preview branch and production Vite configuration are unchanged. The planning inventory retains every disposition/count and its ten controls pass.

The earlier failures remain recorded. Editor/interrupted-creation fault delivery is next; unrelated harness and wrapper failures remain open. No app, trust, format, limit, budget or gate changes. No Stage 5 credit or release action.
