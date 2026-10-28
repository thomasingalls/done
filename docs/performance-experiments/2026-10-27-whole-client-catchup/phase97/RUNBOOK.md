# Rerun guide

Use a disposable development lab, never a real browser profile, existing account or production API.
The current private fixture lives only in /private/tmp/done-whole-client-20261027 and is not in Git.
Old temporary fixtures may expire; regenerate them rather than implying the hashes recreate secrets.

1. Export the two tree identities in96/measurement-identity.json into source-R/source-C under a fresh
   experiment root. The recorded root is /private/tmp/done-whole-client-20261027; its ports53781 and
   random loopback container publishing must be free. Never replace preview8443/53219/53220.
2. Materialize96/reproduction/harness files, removing only the trailing .txt. Use the final canonical
   helpers there: prepare.py records the initial preparation attempt, not the subsequent corrections.
   Copy97/reproduction/harness-tsconfig.json.txt as harness/tsconfig.json. Copy source-C/package.json
   to harness/package.json, link its scripts to source-C/scripts, and link each snapshot/harness's
   node_modules to the repository's pinned host installation. Do not mix missing runtime sources
   from the live checkout. Preserve Node24.18.0, Chrome executable/version, compiler and lock identities.
3. Materialize the root wrappers/scripts from96/reproduction;97 adds independent summary/sensitivity
   helpers. If changing the experiment root, update all source literals consistently and record new
   identities. Copy96/protocol.md to the root. Extract the pinned1.62.0 serializer with97's extractor
   (arguments: repository root); its output hash must match96. Use the existing exact local image ID
   in96's identity; docker image inspect that ID to container-image.json. A different image/policy
   requires a new protocol/identity, not an old pass receipt.
4. Run build.py with the recorded host Node. Both source trees must pass types/build/budget/isolation;
   run harness tsc --project tsconfig.json too. Fixed build metadata/feature settings live in the
   script. Rebuilt110-file hashes must match the recorded variants for an exact rerun.
5. Create seed-02 and run the copied seed.config.ts through Playwright with FAIR_OUT pointing there,
   FAIR_DIST=source-R/dist and CHROMIUM_PATH set to the recorded executable. This takes genuine UI/
   virtual-passkey setup and1312 accepted backlog edits. No credentials/provider interaction is needed.
   **Known limit:** the old seed does not wait for its entire large Goals paste before leaving writing;
   it yielded5000 characters. A corrected paste-ready seed is a new fixture/protocol revision. Assert
   actual sizes and preserve every setup outcome instead of claiming the requested13k workload.
6. Run audit-native.mjs --seed. Run run.py pilot; the restored ten-device/four-root fixture must pass
   exact keyed localStorage values/IndexedDB and quiet full exports. No pilot timing receives credit.
   Freeze fresh private-fixture hashes using97/freeze-identity.py with96/measurement-identity.json
   as its template; that helper requires exact client/server/image/serializer inputs and carries no
   historical hardware/build results into a fresh run. Record actual host/build receipts separately.
7. With no concurrent builds/tests, run run.py heavy, then run.py nonoverlap serially. They use frozen
   R,C,C,R orders, no retries, new restored service copies and private profiles. Stop and preserve a
   runner failure; performance misses must remain in the analysis, not be silently rerun.
8. Run analyze.py, review-evidence.py, nonoverlap-analysis.py, fidelity.py, audit-native.mjs,
   audit-nonoverlap.mjs and97's whole-summary.py. Run sensitivity.py/native-sensitivity.mjs only on
   their copied reports/DB. Preserve numeric/raw-source identities and all logs. Run privacy.py before
   retaining evidence; this is a known-value check, not a universal secret detector. Never retain the
   actual seed, profiles, provider/authenticator private keys, operator key, tickets or faulted DB.

Reports distinguish full-series2.5s peer acceptance, bulk replay, initial unlock, data guards,
independent derivation and generalized qualification. A report's status=passed can mean the analysis
ran successfully; inspect the explicit acceptance booleans too. These runs do not prepare a release.
