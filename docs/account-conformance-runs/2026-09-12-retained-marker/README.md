# Retained promotion reference and comparison cost — F-19

Fourteen stages pass with all 917 source pins unchanged: 1,015 unit tests, 64 native/protocol Node
cases, new 150 generated retained-marker histories, the existing 200 authentication histories and
parser properties/controls, long SV/DS HTTP admission, three-stage refusal retry, actual private sync,
cold reopen, tamper refusal and neutral privacy lifecycle checks. `passing/summary.json` preserves
every stage/census/deadline. Large/raw JSON is losslessly gzipped with original hashes and names.

Storage-only `retainedEncoding: 1` represents the v3–v9 admission candidate by a closed reference to
one retained genesis candidate. Its signature is a locator, not authentication. Packing requires the
two original canonical candidates to be identical. Decoding restores the exact logical structure
before unchanged MAC/receipt/semantic/current-owner checks and native comparison. Substitution with an
unchanged locator still fails the original full-payload MAC. Original signed request/message/MAC bytes
and all historical vectors remain unchanged. Unknown/extended/accessor references refuse. Old logical
readers refuse this encoding; current readers also support prior canonical carriers. No eager rewrite,
new protocol identity, trusted locator or marker-authentication cache was added.

The historical test fixture's `snapshot()` independently expands only the logical shape for existing
assertions; `rows()`/`inventory()` still expose raw native carriers. The new native test examines that
raw encoding, then exercises v9 sync and cold reopen, corrupts its reference, verifies refusal without
carrier changes, restores the exact original value and cold-opens the writing again.

Direct byte equality replaces allocating expanded hex strings and per-byte string arrays. Sequential
single-host measurements use structurally valid synthetic candidates, not whole service admissions:

| Checkpoint bytes | Equality median before | After | Retained JSON before | After |
| --- | ---: | ---: | ---: | ---: |
| 4 KiB | 4.74 ms | 1.98 ms | 34,130 B | 24,434 B |
| 64 KiB | 34.57 ms | 4.55 ms | 279,890 B | 147,314 B |
| 1 MiB | 684.58 ms | 46.38 ms | 4,212,050 B | 2,113,394 B |

The profile records one warmup/three equality samples including detached clone, source/runtime hashes
and V8-encoded size (an encoding proxy, not browser disk usage). Exploratory profiles remain separate.
The valid-data generator initially included ciphertext below the existing 18-byte minimum; its shrunk
16-byte counterexample and original test are preserved. The corrected generator and directed 16/17-byte
refusal controls pass; the product parser was not relaxed.

F-19 remains partial: full MAC/parse work on each owned reread, completion duplication, the 72 MiB private
promotion body bound and maximum-size/concurrency/physical-storage qualification are not solved by this
microprofile. No public unauthenticated DoS or universal capacity bound is claimed. Release validation
must declare the intended workload and check complete admission/open behavior against it.
