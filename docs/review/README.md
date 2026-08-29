# Stage 0 lineage review — continuation runbook

This directory is the durable entry point for the retrospective review of the Stage 0 lineage from
`c6116669030eedeea3d599bca0da3547114e6930` through `9edd9300adebcec3abd2234c946f1dcccdc17eef`.
It exists so a new task can resume the analysis without inheriting chat history.

Use this prompt:

> Continue the lineage analysis according to `docs/review/README.md`. Run `node scripts/review-status.mjs`, claim the
> first ready work item unless I name one, and leave a complete handoff in the review workspace.

That prompt is for **one sequential task**. For parallel foundation work, name distinct ids explicitly:

> Continue the lineage analysis according to `docs/review/README.md`, working only on `F-01`.

> Continue the lineage analysis according to `docs/review/README.md`, working only on `F-02`.

Do not launch multiple agents with “first ready”; file claims cannot make a cross-worktree race atomic.

If a work item is named, use:

> Continue the lineage analysis according to `docs/review/README.md`, working on `<work-item-id>`.

The review is analytical. Do not change production code, requirements, selection records, generated vectors,
or tests as part of it. A discovered correction becomes a finding; implementation requires a separate request.

## First five minutes

1. Read this file completely.
2. Run `node scripts/review-status.mjs`. Stop if it reports a lineage or artifact validation error.
3. Determine the intended work from the status output or the user's named id.
4. **Foundation exception:** for `F-01`, read only [config.json](./config.json), the `original` rows of
   [source-manifest.tsv](./source-manifest.tsv), and [briefs/F-01.md](./briefs/F-01.md) before producing a first
   complete draft. For `F-02`, read only config, the `end-state` and `selection` manifest rows, and
   [briefs/F-02.md](./briefs/F-02.md). Do not read orientation, status prose, the other foundation artifact, or
   later-selection summaries first. After the blind draft, read them to check coverage without allowing them to
   redefine the snapshot.
5. For every other work item, read [orientation.md](./orientation.md), [STATUS.md](./STATUS.md),
   [DECISIONS.md](./DECISIONS.md), the row in [work-items.tsv](./work-items.tsv), and its section in
   [briefs.md](./briefs.md).
6. Check for an existing artifact or session claiming the same work. Do not overwrite another agent's work.
7. Create one session file from [templates/session.md](./templates/session.md), then create or update only the
   artifact(s) owned by the claimed work.

The current checkout is not the review boundary. At the time this workspace was created, `HEAD` was detached at
`dbfd01f`, while the descendant lineage continued to `9edd930`. Never use the checked-out copy of a file as a
proxy for either boundary. Read snapshots explicitly:

```sh
git show c6116669030eedeea3d599bca0da3547114e6930:docs/TRD.md
git show 9edd9300adebcec3abd2234c946f1dcccdc17eef:docs/TRD.md
git diff c6116669030eedeea3d599bca0da3547114e6930..9edd9300adebcec3abd2234c946f1dcccdc17eef -- docs/TRD.md
git show --stat --oneline <commit>
git diff <commit>^..<commit>
```

Do not check out, reset, rebase, or otherwise move the worktree to perform this review.

At creation time, `package.json`, `docs/review/`, and `scripts/review-status.mjs` are the uncommitted machinery;
`.opencode/` is pre-existing user state. Preserve all four. Until the machinery is committed or explicitly
transferred, it exists only in this worktree; a task in another worktree must stop if this entry file is absent.

## Sources and precedence

The documents have different jobs. Do not flatten them into one source type.

| Source | Job in this review |
| --- | --- |
| PRD and TRD at `c6116669030eedeea3d599bca0da3547114e6930` | Original contract for this phase: requirements, bounds, candidates, risks and open rows |
| PRD and TRD at a later commit | What that commit claimed was currently true |
| Selection records | Reasoning, rejected alternatives, costs, residuals and promised evidence |
| `decisions.md` | Append-only implementation decision history |
| `sequencing.md` | Dependency plan, gates, early warnings and assumptions likely to be wrong |
| `progress.md` | Disposable working state; useful evidence of what was believed at that moment, but not authority |
| `performance.md` | Measurement history and method |
| `sessions.md` | Earlier product and architecture provenance; consult when a promoted requirement's nuance is in question |
| Generators, vectors, tests and WASM | Executable evidence, not self-authenticating proof of the prose that produced them |
| Primary external standards | Authority for RFC, NIST, WebCrypto, WebAuthn, ASVS and compatibility claims |

When a selection record and the PRD/TRD at the same commit disagree, the PRD/TRD says what the project claimed
was current; the disagreement is itself review evidence. The original-contract work must preserve what
`c6116669030eedeea3d599bca0da3547114e6930` said even if later documents improve it.

## Artifact model

Progress is derived from independent files to reduce conflicts between tasks and worktrees.

- [config.json](./config.json) fixes the boundary and schema.
- [lineage.tsv](./lineage.tsv) is the immutable, reverse-chronological commit index.
- [source-manifest.tsv](./source-manifest.tsv) pins the boundary documents by blob id.
- [work-items.tsv](./work-items.tsv) is the immutable dependency graph for synthesis work.
- `commit-reviews/<full-sha>.md` records one commit. Absence means pending.
- `analysis/` holds the result named by each work item.
- `findings/<stable-slug>.md` holds one candidate or resolved finding.
- `sessions/<date>-<task>-<suffix>.md` is a task-local chronological handoff.
- [STATUS.md](./STATUS.md) is a human checkpoint maintained by a coordinator. It may lag the derived state.
- [DECISIONS.md](./DECISIONS.md) is append-only and records changes to this review method or boundary.

The `initial_treatment` column in `lineage.tsv` is routing, not a verified fact. A commit card may reclassify its
commit and must explain why. Commit subjects are also navigation aids rather than evidence of what the patch does.

`node scripts/review-status.mjs` is authoritative for mechanical progress. It validates the boundary, compares the lineage
index with Git, validates artifact front matter, summarizes batches and findings, and names dependency-ready
work. Add `--json` for structured output. `pnpm review:status` and `pnpm review:check` are convenience aliases
when the repository's pinned pnpm runtime is already available; the direct Node command needs no package-manager
startup or dependency installation.

## Claiming and completing work

The absence of an artifact means `pending`. To claim work:

1. Re-run `node scripts/review-status.mjs` immediately before claiming.
2. Create the work item's exact artifact path using the corresponding template, with `status: in-progress`.
3. Create a uniquely named session log. Use a task/thread identifier in its filename when one is available.
4. Work only within the claimed scope. Cross-scope discoveries become findings or messages to the owner.

### Resuming and reactivating

The status command calls an item `resumable` when its artifact is `in-progress` but no active session claims it.
To take it over, read every prior session naming that id, preserve its analysis, change the artifact's `owner` and
`updated` fields, and create a new session before continuing. The old session is the ownership history; do not
rewrite it.

A `blocked` item is reactivated only after its named unblock condition is true. Record the evidence, change it to
`in-progress`, and create a new session. A `needs-recheck` item should be taken by a different owner where possible
and follows the same procedure. If a session still says `in-progress`, treat the claim as active; only a
coordinator or that owner may close an abandoned session after checking its handoff and filesystem state.

To complete work:

1. Fill every required section in the artifact. A list of files read is not analysis.
2. Create a finding file for each concern that survives an attempt to disprove it.
3. Record null results explicitly: which hypotheses were tested and what evidence rejected them.
4. Set the artifact to `status: complete`, update its date, and finish the session handoff.
5. Run `node scripts/review-status.mjs` and record any validation problem before stopping.

Use `blocked` only when a specific missing fact, authority, or unavailable artifact prevents meaningful work.
Name the unblock condition. Do not mark an incomplete analysis complete because the task is ending.

Claims are advisory within one shared filesystem. They cannot lock another Git worktree. When agents operate in
different worktrees, the coordinator should assign distinct work items. If duplicate work is later merged,
preserve both evidence sets and reconcile them rather than choosing the first writer automatically.

## The audit method

### Foundation

`F-01` and `F-02` deliberately separate two acts that can anchor each other:

- `F-01` extracts the original contract from `c6116669030eedeea3d599bca0da3547114e6930` without reading later
  selection reasoning first.
- `F-02` derives the end-state system and its claimed guarantees from
  `9edd9300adebcec3abd2234c946f1dcccdc17eef` without deciding whether the
  original plan justified them.

They may run in parallel. Their output is compared only after both exist.

### Reverse commit walk

The primary walk is backwards, in the batch order `B-01` through `B-04`. For commit `C`, start from the state
that includes `C`, then ask what proposition, evidence, or constraint disappears on returning to `C^`.

Every substantive commit review must state:

1. the conclusion introduced or changed;
2. the original requirement it purports to satisfy;
3. assumptions added, removed or narrowed;
4. algorithms and state transitions involved;
5. evidence offered and whether it is independent;
6. downstream decisions that inherit it;
7. consequences, guarantee boundaries and residual failure modes;
8. an attempted counterexample or falsification;
9. whether nuance was preserved when propagated.

The seven `traceability` commits still receive review files. They may be short, but must verify that the change is
only attribution/provenance and did not alter substantive text accidentally.

### Cross-cutting passes

After the reverse walk, the `X-*` work items re-derive the load-bearing seams across commits. Do not merely join
the conclusions of the per-commit reviews. Construct the relevant state machine, threat actors and failure cases
again. The `P-01` propagation audit then traces:

```text
original constraint -> selection reasoning -> current PRD/TRD -> executable evidence
```

`S-01` runs adversarial lifecycle scenarios. `V-01` independently challenges candidate findings and the
strongest affirmative conclusions. `Z-01` is the only work item authorized to turn the accumulated record into
an overall judgment.

### Evidence discipline

- Separate an algorithm's security argument from the correctness of its encoding and state machine.
- Treat “selected”, “done”, “closed”, and “ready to close” as claims under review, not dispositions to preserve.
- Distinguish evidence available when a decision was made from evidence discovered later; avoid hindsight
  criticism that the author could not have acted on, while still judging the final propagated state.
- A generator and verifier sharing the same mistaken model are not independent confirmation.
- Distinguish official primitive KATs from project-owned composition vectors.
- For every negative, identify the exact check that rejects it. Parser rejection or a string comparison does
  not demonstrate a cryptographic binding.
- Check crash consistency at every persistence boundary, not only steady-state round trips.
- State service, relay, browser-origin and device compromise separately; do not use “attacker” as one role.
- Separate safety, confidentiality, integrity, availability, durability, portability and UX consequences.
- Prefer primary external sources. Record the exact version/date and a link in the artifact.
- Treat measurements as claims about the recorded hardware and method. Do not generalize silently.
- Tests run in the intermediate checkout are not evidence about the configured tip. If dynamic execution of an
  exact historical snapshot becomes necessary, use a disposable directory, record its SHA and environment, and
  do not move this worktree.

## Finding lifecycle

Create findings from [templates/finding.md](./templates/finding.md). Use a collision-resistant semantic id such
as `f-ff0b48f-step-up-replay` or `f-cross-checkpoint-retention`; do not allocate sequential numbers in parallel.

Statuses:

- `candidate`: plausible, with evidence and an explicit disproof attempt still open;
- `validated`: the concern survives counterevidence and its consequence is demonstrated or tightly argued;
- `rejected`: evidence disproves it; preserve the reasoning so another agent does not repeat it;
- `superseded`: replaced by a better-scoped finding, whose id must be named;
- `repaired`: was `validated`; the defect's repair is demonstrated by named falsifiers that execute in the
  gate (`remediation/traceability.md` is the generated finding→falsifier matrix), and the finding's
  Disposition carries a dated `**Repaired — YYYY-MM-DD**` line naming them. Added 2026-08-29 under the
  separately authorized `S0-10` disposition workflow; deferred residue, if any, stays a registered debt in
  `remediation/debts.json` and holds the finding short of this status only when it is the defect itself
  rather than later-gate evidence.

Severity describes consequence, not effort or rhetorical force. A finding is not validated merely because prose
is ambiguous; identify the reachable bad state, violated requirement, or decision that lacks the evidence it
claims.

## Stop conditions and handoff quality

Stop and leave the work `blocked` when:

- the configured base or tip is missing or no longer has the recorded ancestry;
- required external evidence cannot be obtained and the conclusion depends on it;
- another active artifact owns the same work;
- answering would require changing the review boundary or production artifacts;
- a product choice is required that evidence alone cannot make.

A fresh agent should be able to read the final session section and know: what was examined, what changed in the
review record, which hypotheses remain, the exact next command, and the next ready work item. “Continue the
review” is not a handoff.
