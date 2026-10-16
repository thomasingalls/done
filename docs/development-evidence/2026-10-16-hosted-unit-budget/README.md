# Hosted unit execution budget — 2026-10-16

The second publication CI run, on signed `dbae813c`, passes 1,795 cases and the named skip,
but baseline anchoring and generated projection/undo each exceed their existing five-second
case limit. The full run is slower than the previous hosted pass. These are deadline failures,
not observed data/model counterexamples; neither result is discarded.

Bound the CI unit step to one independent file worker. Preserve the entire selected population,
every case deadline, the job's 20-minute limit, fixtures, source histories, seed 140919 and all
150 generated undo/redo histories. A disposable Linux ARM64 serial control still fails the
baseline case (48 pass, one timeout), so serialization alone is not credited as a repair.

The two cases repeatedly compare large Uint8Arrays through the general JavaScript matcher.
Use Node's built-in `assert.deepStrictEqual` at exactly five existing comparison sites. It
still compares all baseline payload/MAC bytes, every retained history row and each generated
document encoding; its strict type/prototype checks do not relax equality. Fixture size,
cloning, caller-isolation mutations, per-action checks, random generation and all other
assertions remain. No production implementation or cryptographic format changes.

All 49 affected cases pass in disposable Linux under the original deadlines. A changed
middle byte of the expected baseline fails the strict assertion. A changed final byte of
the generated encoding fails after the first seeded property and shrinks its counterexample.
Those are selected negative controls, not full-suite runs. The projection JSON reporter wraps
the inner assertion; an initially over-specific report guard rejects that shape. The actual
failure/shrinking evidence is retained without claiming the inner stack was exposed.

The complete local Node 24 unit run with one file worker passes all 153 files: 1,797 cases,
one unchanged named skip, total 1,798. All 93 affected adapter cases pass; inventory and plan
retain identical 860 obligation rows and 319 unresolved entries. Runtime and crypto inventory
bytes are unchanged. Five-second deadlines and every old test remain. Only the modified
assertion line receives formatter layout; the deferred formatting proposal is untouched.

Logs, condensed reports and the explicit control summary are indexed here. Raw private
browser state and large disposable binary assertion values are omitted. `source-pins.json`
binds the final phase files. This is a functional harness/runner repair, not a performance
measurement, resumed qualification, successful hosted rerun or production publication.
Next: sign/push, require a complete hosted pass, build/test an identified signed image,
then continue the application-merge → registry → infrastructure-PR → rollout procedure.
