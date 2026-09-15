# F-17 commit backlog reconciliation

September 15, 2026. Eight completed bounded phases above signed `0c84e5cc` are now recorded in
five newly signed descendant commits. A following documentation commit records this map and
reconciles the active checkpoint. No existing commit was rewritten, no unsigned replacement was
created, and no original evidence receipt was relabeled with a new revision.

| Signed commit | Recorded work | Grouping |
| --- | --- | --- |
| `67d31c75` | Private Local preparation handoff | Exact retained source/test/configuration and registry checkpoint; original functional evidence. |
| `a245fb7f` | Handoff performance, Pixel companion and browser profile | Three related measurement phases grouped into one evidence commit. No runtime change. |
| `ffc0d370` | Selection-snapshot contract, baseline controls and unmounted owner | Two phases combined at the passing component checkpoint; their original evidence packets remain separate. |
| `15eb389c` | Private Local selection-history integration | Runtime, tests, native routing, fault-control repair, registries and recovered checkpoint together. |
| `e2d42fac` | Selection-snapshot performance decision | All timings, mixed relative result, failed application gate and refusal of default activation. No runtime change. |

The full commit IDs, parents, tree IDs, signature verification results, phase-to-packet mapping,
source references and registry hashes are in [summary.json](./summary.json).

## Reconstruction and limits

The original working tree contained 219 pending files within this task's scope. Its bytes were
backed up before staging. Git's index received the recovered phase versions without rolling back
the working files. The final content commit, `e2d42fac`, contains every one of those 219 files
byte-for-byte as it stood before this bookkeeping turn. Three unrelated untracked root files were
not read, staged or changed.

The handoff checkpoints match all **1,059 non-document files** of the retained pre-performance
source snapshot. The combined contract/owner checkpoint matches all **1,061 non-document files**
of its passing owned run. The integration and final performance checkpoints match all **1,062
non-document files** of the final comparison's frozen input. These counts include runtime, tests,
runners and configuration. All three corresponding registry/census snapshots match too.

This is stronger than separating only the visible code hunks, but it is not a recreation of every
historical working tree. Three measurement phases share a commit; the contract and component share
another. Append-only records use verified historical byte prefixes. Complete mutable roadmap
versions were not available at every boundary, so intermediate summaries were not invented:
the integration commit restores the later recovered checkpoint, and this reconciliation makes
the active summaries current. Some intermediate summaries therefore lag their newly archived
records. The original evidence packets remain the source for what each phase actually ran.

All **177 files across eight original evidence packets** remain byte-identical. Their references
to `0c84e5cc`, uncommitted work or a pending commit backlog describe their original observations.
They must not be replaced with these new hashes: a later archival commit is not evidence that
the tests ran at that commit. This record supplies the connection instead.

## Verification

From the repository root:

```sh
python3 docs/account-conformance-runs/2026-09-15-f17-commit-backlog/verify.py
python3 docs/account-conformance-runs/2026-09-15-f17-commit-backlog/verify.py --raw
```

The verifier checks all five signatures, direct parent/tree relationships, changed-file counts,
the original 219 files in the final content commit, unchanged evidence, append-only commit prefixes,
52 personal/vector pins and L-2. With `--raw`, it compares each committed non-document file and
registry snapshot directly with the retained frozen phase inputs. Those three large input files
remain local under ignored `test-results/` and are pinned by path and hash in the summary.

The latest functional and performance packet verifiers and current inventory/manifest checks also
pass after the commits. No browser, performance or full functional campaign is rerun here. Signing
does not change the failed gate or qualify a new immutable release aggregate.

## Current position

The backlog through the selection-snapshot performance decision is closed. Default Local and
Account retain the reference. F-17 remains partial: the snapshot increment misses its useful-gain
rule, and the application gate fails Android card typing at 75.1 ms (<16 ms) and focus at 54.2 ms
(<50 ms). General integration remains 263 files / 2,121 dispositions, with 11 not applicable;
0 test-file, 96 command and 63 campaign obligations remain unresolved.

Next profile the snapshot application variant's remaining document/history fork, complete
comparison and publication costs before choosing another repair. The original failed observations,
loaded-host uncertainty, wrapper certification and immutable qualification remain open.
