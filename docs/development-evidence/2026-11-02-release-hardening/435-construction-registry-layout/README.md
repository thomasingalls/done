# Normalize construction registry layout without changing its tokens — phase435

Apply only the existing formatter’s JSON layout to the mutable construction registry. Independently compare its complete non-whitespace token sequence and parsed document, not only selected fields or a generator against its own output. Refresh the derived source hash in the release inventory.

All99construction entries, source addresses, source pins, schema/vector hashes, statuses and blockers are exact. Every non-whitespace JSON token is byte-identical. The only derived inventory input change is constructions.json; all other graph fields, counts and obligations are exact. The full first-authority command passes in21.61s, including its unchanged formatter and every contract, verifier, vector and lint stage.17registry checks, inventory and10inventory controls pass. All449runtime source hashes stay exact. [All attempts and reviewed source identities](./evidence.json).

Bookkeeping correction only; no app, test body, assertion, format contract, deadline, trust or gate change. The failed434attempt remains. Ten commands73–82remain; B functional fairness/past-index is still open. The broader deferred test/harness formatting patch remains untouched. No Stage5, signing, push, release preparation, publication or deployment.
