# Private migration page and rehearsal — 2026-09-10

On signed editor commit `46a17fb` plus the uncommitted private utility. The
[procedure and limits](../private-migration-procedure.md) describe its operator boundary. The
[manifest](./2026-09-10-private-migration/manifest.json) pins final source, build and raw evidence.
All files, factors, databases and browser contexts exercised here are synthetic. The author's installation,
backup files, server, relay and browser were not used or changed.

| Executed evidence | Result |
| --- | --- |
| Full Vitest suite | [809 passing tests in 70 files](./2026-09-10-private-migration/unit.json) |
| New controller tests, included above | Five passing tests: 200 generated packet/binding corruptions, 150 retained-intent UI histories (seed 8941), separate code confirmation/fresh inspection, late-file byte erasure/draining, reentrant close before native work |
| Native private page and app handoff | [Four passing cases](./2026-09-10-private-migration/native.json), including one observed renderer crash and an injected native content-transaction abort |
| Production build | Passed; [private HTML and runtime absent](./2026-09-10-private-migration/build-exclusion.json), normal entries remain within their 350 kB gzip gate at 326.6 kB each |
| Visual inspection | [Desktop](./2026-09-10-private-migration/desktop.png) and [mobile](./2026-09-10-private-migration/mobile.png), no horizontal overflow |

The native workflow saves the packet, binding and preview to real test files, restarts the utility and
reselects those files before enrollment. It crashes the renderer after a partial import, reopens with the
original code and files, finishes import/selection and enters the normal Local editor. Four Next cards in
a frozen historical day remain visible. Both the capture ZIP and destination ZIP are read with Python's
independent zipfile/CRC reader and compared against the separate Node input-string oracle. Unfiled bodies
are compared apart from the selected provenance losses. A later master edit survives lock and cold reopen.
The exact original database rows and known journal/ancillary values remain unchanged through these steps.

Other native cases reject a wrong saved digest and wrong origin before enrollment, refuse source drift
before first intent, resume the original factor after an aborted first content write, and reject a retained
service-worker registration while preserving a source marker. The abort case asserts that the injected
native boundary was reached. The synthetic crash is between completed bounded import calls; the abort is
inside a content transaction. Wider instruction-level kill placement is the existing component campaigns'
scope, not newly established here.

The [initial run](./2026-09-10-private-migration/before-crash-wait-fix.json) passed three cases but timed out
in the renderer-death fixture. It awaited the `Page.crash` command response along with the crash event;
the crashed renderer could not provide that response. The corrected fixture sends the command without
awaiting its reply and waits for the independent crash event, matching the existing component harnesses.
The focused recovery rerun and final four-case campaign pass. This was a harness scheduling error; no new
importer or controller defect was established by it. Earlier failure reports predate the final source pins.

The generated controller tests use real packet parsing/replay and a mocked coordinator to isolate file
and UI dispatch ordering. They retain shrinking but found no counterexample in this run. Native source
fixtures and the imported document share pinned Yjs; the string ledger and ZIP reader are independent.
There is no newly executed mutation battery in this phase and no claim that these finite cases cover all
file formats, UI histories, concurrent actors or storage failures.

Executed commands used installed TypeScript, oxlint/oxfmt, Vite build, full Vitest with JSON reporting,
and Playwright with `playwright.private-migration.config.ts` (package alias `storage:private-migration`).
The ordinary app source was unchanged; the new rehearsal exercises its selected-destination handoff.
The complete `pnpm check` chain and older full native coordinator/cleanup, geometry, packaged offline and
platform/latency campaigns were not rerun. Their previous evidence is retained at its original source pins.

The utility depends on operator-controlled quiescence for the sole development client. The service-worker
check is a refusal observation, not proof of old-writer exclusion. This phase performs no personal source
capture, selection, deletion, origin cutover, OS/power-loss test, whole-profile residue scan or independent
review. It adds no production migration authority and pays no conformance debt. Next is preparation of the
private utility at the author's existing origin and the first guided browser step, keeping source data intact.
