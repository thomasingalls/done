# Read-only disk investigation, 2026-10-12

Requested independently of the performance measurement. A parallel agent inspected project-related
paths without deleting or changing files. Its traversals finished before the first timed run.
Sizes are allocated file sizes from `du`, decimal GB; APFS shared extents can make these larger
than uniquely reclaimable physical bytes. Folder birth dates are not exact historical disk deltas.

## Recent contributor: temporary source snapshots

Project-related `/private/tmp` paths total **15.25 GB**. The largest fifteen folders total
**15.09 GB**, with root directory birth dates on October 10–11:

| Folder under `/private/tmp` | GB |
| --- | ---: |
| done-account-batching | 2.36 |
| done-account-consumers | 1.99 |
| done-account-cold-recovery | 1.40 |
| done-account-cold-open | 1.40 |
| done-account-cold-census | 1.39 |
| done-account-cold-coverage | 1.39 |
| done-client-receive | 0.99 |
| done-sync-publish-77657e23 | 0.89 |
| done-receive-publish-203a0655 | 0.89 |
| done-account-requests | 0.47 |
| done-account-activation | 0.46 |
| done-browser-failures | 0.45 |
| done-publish-5ccee4d0 | 0.44 |
| done-incremental-ledger | 0.43 |
| done-self-stream-progress-perf | 0.13 |

The main mechanism is repeated baseline/candidate source copies including the large docs tree.
Batching has five roughly 453 MB source trees; cold-recovery has three roughly 458 MB source
trees; client-receive has two roughly 463 MB trees. A sampled publication source tree contains
438 MB of docs. In the main worktree `docs/account-conformance-runs` alone is 354.75 MB.
Two publication `source.tar` archives additionally total 843,458,560 bytes. Sampled snapshot
`node_modules` entries are symlinks; `du` did not follow them or count those dependencies again.

## Older worktree allocation

The current worktree totals **10.66 GB**, of which **9.81 GB** is `test-results`. A completed
metadata pass over 237,729 result files found only 700,416 bytes created and 704,512 bytes
modified since October 9. These are overlapping categories, not additive growth estimates.
Large older groups: legacy-host 2.54 GB, account-residue 1.21 GB, release-validation 1.20 GB,
private-release-privacy 0.91 GB. An initial slow metadata pass was interrupted; a later bounded
pass completed the counts above.

Other current totals: main node_modules 292.14 MB, dist 9.16 MB, .dev 74.82 MB, and the entire
ol-infra checkout 379.92 MB. Worktree + scoped temporary artifacts + infra total
26,290,839,552 allocated bytes, combining old and recent data and excluding Docker. This total
is not a whole-disk inventory.

## Docker cache: mostly older, with 3.21 GB linked to recent done builds

After the timed runs finished, a read-only Docker inspection succeeded with sandbox escalation.
The active Docker Desktop builder has **388 cache entries totaling 21,336,312,367 bytes
(21.34 GB)**. Docker reports 20,099,007,133 bytes (20.10 GB) as reclaimable; these are the cache
entries not shared with images. All entries were marked not in use at inspection time. These
are hostwide totals, not totals attributable to this project.

The recent window starts at **2026-10-09 00:00 Europe/Paris**, or 2026-10-08 22:00 UTC. Exact
sizes, creation timestamps, sharing flags and parent links came from Docker's read-only
`GET /system/df` endpoint; `docker buildx du --format=json` independently reported 388 entries.
Build command strings and unrelated image details were not copied into this report.

| Cache group | Entries | Bytes | GB |
| --- | ---: | ---: | ---: |
| Created before the recent window; not attributed to done | 219 | 18,071,095,815 | 18.07 |
| Created in the recent window, all projects | 169 | 3,265,216,552 | 3.27 |
| Recent entries linked to done, including ancestors | 147 | 3,205,573,523 | 3.21 |
| Recent entries not established as done-related | 22 | 59,643,029 | 0.06 |

The last two rows partition the recent-window row. Attribution starts with 83 entries whose
descriptions contain distinctive paths from this repository's Dockerfile, including
`account-service`, `account-protocol`, `scripts/public-account.mjs`, the public runtime test
paths, and the packaged gateway modules. Following their parent links yields 147 distinct
entries, with no missing parents. Each cache ID is counted once. This establishes use by
done; generic dependency and base layers need not be exclusive to done. Other cache entries
are left unattributed rather than inferred from generic Node or pnpm commands.

The linked cache is **2,129,369,211 bytes (2.13 GB) unshared** and **1,076,204,312 bytes (1.08 GB)
shared with images**. Four dependency-install entries account for 1,790,436,249 bytes (1.79 GB),
eleven full-source COPY entries for 296,257,603 bytes (0.30 GB), and thirteen build entries for
220,039,746 bytes (0.22 GB). The current `.dockerignore` excludes docs and evidence archives,
so the repeated large docs copies found on the host are not current Docker build inputs.

The separate hostwide Docker summary reported images at 1.739 GB, containers at 16.38 kB, and
volumes at 83.42 MB. Image and cache sizes overlap: do not add the full image total to the full
cache total. The full 20.10 GB reclaimable-cache figure also includes older, unattributed work;
it is not a project-specific cleanup estimate. Engine cache accounting is not an exact measure
of physical space immediately recoverable from Docker Desktop's virtual disk.

The fifteen large temp folders created October 10–11 plus the linked recent Docker cache
represent **18,298,547,091 bytes, approximately 18.30 GB**, of retained recent project artifacts.
This provides a plausible explanation for most of the observed roughly 20 GB increase, but it
is not a measured historical free-space delta: folder birth times, APFS sharing and Docker's
shared layers limit that inference. Cache creation dates establish age; a recent last-use
timestamp alone was not treated as recent allocation.

Source copies/builds/tars appear reproducible; browser snapshots, patches, profiles and logs
are evidence requiring selective preservation. No cleanup is authorized by this investigation
and none was performed. The new attribution probe reuses the checkout and existing fixture,
with separate small frontend bundles instead of copying docs/source per condition.
