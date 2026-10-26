# Phase70 — admitted, portable card heading snapshots

2026-10-25 · encrypted workspace-content foundation; display follows in71.

## Contract and mechanism

The operator requested card heading breadcrumbs with an off switch and no curved leading arrow.
Use optional advisory card metadata `{v:1,headings:[{level,title}]}`, captured with the selected
writing through existing semantic admission. No card Markdown is rewritten, no authority or new
root is introduced, and no crypto, server route or credential mechanism changes. Source positions
and matching accepted line text select the path; the viewport label or equal text elsewhere cannot.
The selected heading is excluded even across multiline Setext titles, quotes and skipped levels.
Bounded/incomplete parsing or invalid metadata omits the optional label without losing writing.

Copy filtering/capacity keeps each original line's path. Move paths travel inside sorted line records,
then follow their resolved relative anchors. Metadata and writing publish together, with the existing
human operation and undo. Supporting moves/duplicates/splits retain paths; differing-context merges
clear an ambiguous label, with undo restoring both originals. Paths returned to consumers are owned
and frozen. The weak cache relies on the existing owner convention of replacing inline JSON values,
not on Yjs enforcing deep immutability after decode. Weak keys do not prolong a closed raw document.

The additive v1 field uses the current workspace schema. Old clients preserve opaque metadata during
same-card moves, but their duplicate/split/export paths can omit it and old merges can retain a prior
snapshot. A genuinely pinned older merge demonstrates that limit in the review. Historical advisory
labels never become access, attribution, completion or deletion authority. No cross-version metadata
fidelity, live backlink, automatic backfill or return-to-Goals mechanism is claimed.

Plaintext ZIP export keeps Markdown identical and adds optional goals-context.json rows only for
actual serialized cards. Rows name file, section, zero-based index and headings. A retained archive
has serializer precedence, so live-card context cannot be attached to archived text at that index.
Unfiled cards have their own file/index rows. This is portable metadata, not a new sidecar importer.

## Evidence and failures retained

- Final affected units:298 pass, one existing named skip; all old moves/export/admission tests remain.
- Thirty new cases cover bounded/malformed/unknown metadata, source hierarchy, filtering/capacity,
  freeze, lifecycle/undo, wire preservation, archive-safe export and three preparation paths
  (reference, local snapshots, account text). Controlled carriers establish semantic admission,
  input ownership, private pending state and cold replay, not encryption or receiving authority.
- TypeScript and focused lint pass. Independent external challenge now passes3/3, with earlier
  counterexamples and exact source/probe identities retained in review/.

An early fixture used an unchecked-marker string without its required trailing space and expected
it to be dropped; existing transfer behavior correctly kept it as writing. The fixture now uses the
actual markup-only source. A new sibling-heading counterexample failed before repair; ancestor scope
now drops the previous sibling/root. Independent review then exposed multiline Setext self-ancestry
and live/archive sidecar misassociation; explicit regressions and repairs retain both original fails.
The first post-repair external assertion assumed a sidecar existed, rather than accepting safe
omission; that failed attempt is also retained. A test carrier's typed-array generic annotation was
corrected without changing its runtime behavior. Passing reruns do not erase failed attempts.

This is a bounded model/semantic slice, not general qualification. The account display preference,
actual card UI/browser checks and final inventory refresh follow. No existing test was edited,
no real data/profile or preview8443 was touched, and no real-index staging/commit/publication occurred.
