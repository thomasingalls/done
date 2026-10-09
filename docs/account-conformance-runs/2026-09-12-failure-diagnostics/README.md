# Bounded failure diagnostics — F-10/N-08/P-07

Ten campaign stages pass, including the full **1,003-test / 92-file unit suite**, 72 native/service
Node cases, and generated activation (120), delivery (80), inbound (60) and malformed-hint (150) checks.
All source pins agree at campaign completion. `summary.json` and stage logs retain the actual census.
Raw/large JSON is losslessly gzip compressed; `archive-files.json` maps original hashes and names.

Begin/challenge/finish refusals now retain a typed bounded stage/reason before success parsing. Native
checks prove a refusal supplies no receipt, preserves resumable progress, and permits a subsequent
verified exact retry. Unknown/extended objects still face the existing closed success parsers.

Delivery HTTP 409 hints use the closed unsigned `{v:1,kind:"unknown",reason}` vocabulary. The client
reads at most 512 bytes under the existing abort/drain lifetime, retains a diagnostic and returns no
decision bytes. Other responses, malformed hints and network failures remain unconfirmed. Signed
receipt, membership, witness, reentry and commit checks are unchanged.

Service core and private HTTP diagnostics, and the private client diagnostic buffer, retain at most
32 fixed operation/phase/code records per buffer. They are memory-only and omit identifiers, paths,
request digests, exception text, factors, tokens and writing. Known busy/crypto failures have bounded
classes; unknown causes retain the failing phase without arbitrary details. Diagnostic callbacks cannot
change decisions. `server.diagnostics()`, `core.diagnostics`, and `readPrivateTransportDiagnostics()`
are read-only private inspection surfaces; no public diagnostics endpoint or telemetry was added.

The native commit-fault test asserts the intended hook actually ran. The privacy regressions cover
the new runtime path and retain their original deliberate side-write positive control. Exploratory
test repairs were direct-Node TypeScript syntax and a test fixture's `{bytes,...}` wrapper; both were
corrected before this campaign. This closes these findings for the bounded private composition;
general account recovery/product presentation and production observability remain later work.
