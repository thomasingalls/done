# Reproduce the native owner kernel

This laboratory requires the private **fictional** prepared fixture and source-equivalent frontend
retained in `/private/tmp`, not real account data. Factors, virtual credentials and profiles are
deliberately absent from Git. Do not substitute a production profile.

1. Check out source8d6d42c1 and install its locked dependencies with Node24.18.0. Use the retained
   released frontend from phase157 and the fictional H fixture from phase155/162; check the hashes
   in `identities.json`. The fixed loopback53781 origin matches that fixture's pin/RP.
2. Restore every file in `identities.json.reproduction` from its `.txt` carrier into the indicated
   relative path under `/private/tmp/done-worker-owner-20261028`. Link `lab/src`,
   `lab/account-protocol`, `lab/wasm` and the lab/harness node_modules to the matching repository
   inputs. The retained driver is a diagnostic and intentionally names its closed private paths.
3. Supply the source-equivalent Node24.18.0 container identity used by the earlier lab as
   `container-image.json`; its immutable image ID is recorded in native container reports. Docker
   mounts current `account-service`, `account-protocol`, `src`, `scripts` and `docs` read-only.
   The service state/profile are copied afresh per case. Never run on8443 or production.
4. Run the retained build with shell failure propagation (`set -e`), then `node --test
   lab/channel.test.mjs`, then `python3 run.py <fresh-output-name>`. Build first: the launcher
   refuses mismatched lab inputs or any change in the complete asset inventory. It runs14 native
   cases once with one worker, zero retries and unchanged180s case deadlines. No source mutation
   during a run. Preserve failed runs instead of overwriting output directories.
5. `join-before-09-source` in the version map reconstructs the native mixed-owner counterexample.
   Its diagnostic expects the blocked exclusive→shared ordering and then cancels. The final test
   requires prompt refusal instead. Do not count the before diagnostic's passing runner as a
   functioning owner. The other version maps explain prior failures and adaptations.

The extra isolation headers apply only to `/worker-lab/`, and the shared acquisition modes and
lock port exist only in the retained build transformations. No shipping source needs to be edited
to run the experiment. A successful run is feasibility evidence; it does not qualify performance,
an actual Goals integration, suspended-phone behavior or service automation.
