/**
 * Read-only integrity and progress projection for docs/review/.
 *
 * The audit spans Git objects beyond the checked-out worktree. This script
 * validates exact object ids and reads history through Git rather than
 * assuming HEAD or working-tree files are either review boundary.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = execFileSync('git', ['-C', SCRIPT_DIR, 'rev-parse', '--show-toplevel'], {
  encoding: 'utf8',
}).trim();
const REVIEW_DIR = join(ROOT, 'docs', 'review');
const OPTIONS = new Set(process.argv.slice(2));
const ALLOWED_OPTIONS = new Set(['--json', '--check']);
const JSON_OUTPUT = OPTIONS.has('--json');

const errors = [];
for (const option of OPTIONS) {
  if (!ALLOWED_OPTIONS.has(option)) errors.push(`unknown option: ${option}`);
}

const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const git = (args) =>
  execFileSync('git', ['-C', ROOT, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

const gitSucceeds = (args) => {
  try {
    git(args);
    return true;
  } catch {
    return false;
  }
};

const lines = (value) => value.split('\n').filter(Boolean);

const parseTsv = (path) => {
  const rows = lines(read(path));
  if (rows.length === 0) throw new Error(`${path} is empty`);
  const header = rows[0].split('\t');
  return rows.slice(1).map((row, index) => {
    const cells = row.split('\t');
    if (cells.length !== header.length) {
      errors.push(`${path}:${index + 2} has ${cells.length} cells; expected ${header.length}`);
    }
    return Object.fromEntries(header.map((name, cell) => [name, cells[cell] ?? '']));
  });
};

const parseFrontMatter = (path) => {
  const content = readFileSync(path, 'utf8');
  const all = content.split('\n');
  if (all[0] !== '---') throw new Error(`${relative(ROOT, path)} has no front matter`);
  const end = all.indexOf('---', 1);
  if (end === -1) throw new Error(`${relative(ROOT, path)} has unterminated front matter`);
  const metadata = {};
  for (const row of all.slice(1, end)) {
    const separator = row.indexOf(':');
    if (separator === -1) continue;
    metadata[row.slice(0, separator).trim()] = row.slice(separator + 1).trim();
  }
  return { metadata, content };
};

const markdownFiles = (path) => {
  if (!existsSync(path)) return [];
  return readdirSync(path, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'README.md')
    .map((entry) => join(entry.parentPath, entry.name));
};

const requireFields = (metadata, fields, path) => {
  for (const field of fields) {
    if (!metadata[field] || /^<.*>$/.test(metadata[field])) {
      errors.push(`${relative(ROOT, path)} is missing concrete front-matter field ${field}`);
    }
  }
};

const requireSections = (content, headings, path) => {
  const rows = content.split('\n');
  for (const heading of headings) {
    const start = rows.findIndex((row) => row === `## ${heading}`);
    if (start === -1) {
      errors.push(`${relative(ROOT, path)} is missing heading "${heading}"`);
      continue;
    }
    const next = rows.findIndex((row, index) => index > start && /^## /.test(row));
    const body = rows
      .slice(start + 1, next === -1 ? undefined : next)
      .join('\n')
      .replace(/<!--.*?-->/gs, '')
      .trim();
    if (body.length < 20) {
      errors.push(`${relative(ROOT, path)} section "${heading}" is empty or too short`);
    }
  }
};

const requireTableWithData = (content, header, path) => {
  const rows = content.split('\n');
  const start = rows.findIndex((row) => row === header);
  if (start === -1) {
    errors.push(`${relative(ROOT, path)} is missing required table header: ${header}`);
    return;
  }
  const candidates = [];
  for (let index = start + 2; index < rows.length && rows[index].startsWith('|'); index += 1) {
    candidates.push(rows[index]);
  }
  if (!candidates.some((row) => row.startsWith('|') && !/^\|[\s:|-]+\|$/.test(row))) {
    errors.push(`${relative(ROOT, path)} table has no data row: ${header}`);
  }
};

const config = JSON.parse(read('docs/review/config.json'));
const lineage = parseTsv('docs/review/lineage.tsv');
const sources = parseTsv('docs/review/source-manifest.tsv');
const workItems = parseTsv('docs/review/work-items.tsv');

if (config.schema_version !== 1) errors.push(`unsupported config schema ${config.schema_version}`);
for (const [filename, expected] of Object.entries(config.manifest_sha256 ?? {})) {
  const actual = createHash('sha256').update(read(`docs/review/${filename}`)).digest('hex');
  if (actual !== expected) errors.push(`${filename} differs from its pinned digest; record a method decision before changing it`);
}
if (Object.keys(config.manifest_sha256 ?? {}).length !== 3) {
  errors.push('config must pin exactly lineage.tsv, source-manifest.tsv and work-items.tsv');
}
if (sources.length !== config.expected_source_count) {
  errors.push(`source manifest has ${sources.length} rows; expected ${config.expected_source_count}`);
}
if (workItems.length !== config.expected_work_item_count) {
  errors.push(`work graph has ${workItems.length} rows; expected ${config.expected_work_item_count}`);
}

const fullSha = /^[0-9a-f]{40}$/;
let boundaryObjectsAvailable = true;
for (const [label, sha] of [
  ['base', config.base],
  ['tip', config.tip],
]) {
  if (!fullSha.test(sha)) errors.push(`config ${label} is not a full lowercase commit id: ${sha}`);
  if (!gitSucceeds(['cat-file', '-e', `${sha}^{commit}`])) {
    errors.push(`config ${label} commit is unavailable: ${sha}`);
    boundaryObjectsAvailable = false;
  }
}

if (boundaryObjectsAvailable && !gitSucceeds(['merge-base', '--is-ancestor', config.base, config.tip])) {
  errors.push('configured base is not an ancestor of tip');
}

const actualCommits = boundaryObjectsAvailable
  ? lines(git(['rev-list', '--topo-order', `${config.base}..${config.tip}`]))
  : [];
const indexedCommits = lineage.map((row) => row.commit);

if (lineage.length !== config.expected_commit_count) {
  errors.push(`lineage has ${lineage.length} rows; expected ${config.expected_commit_count}`);
}
if (actualCommits.length !== config.expected_commit_count) {
  errors.push(`Git range has ${actualCommits.length} commits; expected ${config.expected_commit_count}`);
}
if (JSON.stringify(actualCommits) !== JSON.stringify(indexedCommits)) {
  errors.push("lineage.tsv does not exactly match Git's reverse-chronological range");
}

const seenCommits = new Set();
const allowedTreatments = new Set([
  'substantive',
  'traceability',
  'evidence',
  'measurement',
  'maintenance',
  'planning',
  'propagation',
]);
for (const [index, row] of lineage.entries()) {
  if (Number(row.order) !== index + 1) errors.push(`lineage order ${row.order} is not ${index + 1}`);
  if (!fullSha.test(row.commit)) errors.push(`lineage row ${row.order} has invalid commit ${row.commit}`);
  if (seenCommits.has(row.commit)) errors.push(`lineage repeats commit ${row.commit}`);
  if (!allowedTreatments.has(row.initial_treatment)) {
    errors.push(`lineage row ${row.order} has invalid initial treatment ${row.initial_treatment}`);
  }
  seenCommits.add(row.commit);

  if (!gitSucceeds(['cat-file', '-e', `${row.commit}^{commit}`])) continue;
  const commitLine = git(['rev-list', '--parents', '-n', '1', row.commit]).split(' ');
  const parents = commitLine.slice(1);
  if (parents.length !== 1) {
    errors.push(`${row.commit} has ${parents.length} parents; expected a linear history`);
  }
  const expectedParent = lineage[index + 1]?.commit ?? config.base;
  if (parents[0] !== expectedParent) {
    errors.push(`${row.commit} parent is ${parents[0]}; expected ${expectedParent}`);
  }
  const subject = git(['show', '-s', '--format=%s', row.commit]);
  if (subject !== row.subject) errors.push(`${row.commit} subject differs from lineage.tsv`);
}

const sourceKeys = new Set();
for (const row of sources) {
  const key = `${row.snapshot}:${row.path}`;
  if (sourceKeys.has(key)) errors.push(`source manifest repeats ${key}`);
  sourceKeys.add(key);
  if (!fullSha.test(row.snapshot) || !fullSha.test(row.blob)) {
    errors.push(`source manifest has invalid object id for ${row.snapshot}:${row.path}`);
    continue;
  }
  try {
    const blob = git(['rev-parse', `${row.snapshot}:${row.path}`]);
    if (blob !== row.blob) errors.push(`source blob changed for ${row.snapshot}:${row.path}`);
  } catch {
    errors.push(`source is unavailable: ${row.snapshot}:${row.path}`);
  }
}

const coreDocs = [
  'docs/PRD.md',
  'docs/TRD.md',
  'docs/sequencing.md',
  'docs/progress.md',
  'docs/decisions.md',
  'docs/completed.md',
  'docs/performance.md',
  'docs/sessions.md',
  'docs/development.md',
  'docs/codebase.md',
];
const expectedSourceKeys = new Set([
  ...coreDocs.map((path) => `${config.base}:${path}`),
  ...coreDocs.map((path) => `${config.tip}:${path}`),
  ...Array.from({ length: 17 }, (_, index) => {
    const row = index + 1;
    const names = {
      1: 'algorithm-suite',
      2: 'journal-aead',
      3: 'record-format',
      4: 'envelope-format',
      5: 'finalization',
      6: 'antireplay-retention',
      7: 'checkpoint',
      8: 'attribution-record',
      9: 'chain-head-discovery',
      10: 'portable-package',
      11: 'enrollment-ceremony',
      12: 'account-credential',
      13: 'device-lock',
      14: 'recovery-code',
      15: 'transitions',
      16: 'hosted-retention',
      17: 'web-security-baseline',
    };
    return `${config.tip}:docs/selections/row-${row}-${names[row]}.md`;
  }),
]);
for (const key of expectedSourceKeys) {
  if (!sourceKeys.has(key)) errors.push(`source manifest is missing ${key}`);
}
for (const key of sourceKeys) {
  if (!expectedSourceKeys.has(key)) errors.push(`source manifest has unexpected row ${key}`);
}

const workIds = new Set();
const workArtifacts = new Set();
for (const row of workItems) {
  if (workIds.has(row.id)) errors.push(`work graph repeats id ${row.id}`);
  if (workArtifacts.has(row.artifact)) errors.push(`work graph repeats artifact ${row.artifact}`);
  workIds.add(row.id);
  workArtifacts.add(row.artifact);
}
const expectedWorkIds = new Set(config.expected_work_item_ids);
for (const id of expectedWorkIds) {
  if (!workIds.has(id)) errors.push(`work graph is missing ${id}`);
}
for (const id of workIds) {
  if (!expectedWorkIds.has(id)) errors.push(`work graph has unexpected id ${id}`);
}
for (const row of workItems) {
  const dependencies = row.depends_on === '-' ? [] : row.depends_on.split(',');
  for (const dependency of dependencies) {
    if (!workIds.has(dependency)) errors.push(`${row.id} depends on unknown work item ${dependency}`);
  }
}
const visiting = new Set();
const visited = new Set();
const visitWork = (id) => {
  if (visiting.has(id)) {
    errors.push(`work graph has a dependency cycle at ${id}`);
    return;
  }
  if (visited.has(id)) return;
  visiting.add(id);
  const row = workItems.find((candidate) => candidate.id === id);
  const dependencies = row?.depends_on === '-' ? [] : (row?.depends_on ?? '').split(',').filter(Boolean);
  for (const dependency of dependencies) visitWork(dependency);
  visiting.delete(id);
  visited.add(id);
};
for (const id of workIds) visitWork(id);

const lineageBatches = new Set(lineage.map((row) => row.batch));
if (JSON.stringify([...lineageBatches]) !== JSON.stringify(config.expected_batches)) {
  errors.push('lineage batches do not match config.expected_batches in review order');
}
for (const batch of lineageBatches) {
  if (!workIds.has(batch)) errors.push(`lineage batch ${batch} has no work item`);
}

const allowedArtifactStatuses = new Set(['in-progress', 'complete', 'blocked', 'needs-recheck']);
const allowedClassifications = new Set([
  'substantive',
  'traceability',
  'evidence',
  'measurement',
  'maintenance',
  'planning',
  'propagation',
]);
const allowedVerdicts = new Set([
  'pending',
  'supported',
  'supported-with-qualifications',
  'reopen',
  'superseded',
  'traceability-only',
]);

const commitStates = new Map(lineage.map((row) => [row.commit, { status: 'pending', row }]));
const commitReviewDir = join(REVIEW_DIR, 'commit-reviews');
for (const path of markdownFiles(commitReviewDir)) {
  if (dirname(path) !== commitReviewDir) {
    errors.push(`${relative(ROOT, path)} must be a direct child of docs/review/commit-reviews`);
    continue;
  }
  const filename = path.slice(path.lastIndexOf('/') + 1, -3);
  if (!fullSha.test(filename) || !commitStates.has(filename)) {
    errors.push(`${relative(ROOT, path)} does not name a configured full commit id`);
    continue;
  }
  try {
    const { metadata, content } = parseFrontMatter(path);
    requireFields(
      metadata,
      ['schema', 'kind', 'commit', 'parent', 'batch', 'classification', 'status', 'verdict'],
      path,
    );
    if (metadata.schema !== '1') errors.push(`${relative(ROOT, path)} has unsupported schema ${metadata.schema}`);
    if (metadata.kind !== 'commit-review') errors.push(`${relative(ROOT, path)} kind must be commit-review`);
    if (metadata.commit !== filename) errors.push(`${relative(ROOT, path)} commit does not match its filename`);
    const index = lineage.findIndex((row) => row.commit === filename);
    const expectedParent = lineage[index + 1]?.commit ?? config.base;
    if (metadata.parent !== expectedParent) errors.push(`${relative(ROOT, path)} records the wrong parent`);
    if (metadata.batch !== lineage[index].batch) errors.push(`${relative(ROOT, path)} records the wrong batch`);
    if (!allowedArtifactStatuses.has(metadata.status)) {
      errors.push(`${relative(ROOT, path)} has invalid status ${metadata.status}`);
    }
    if (!allowedClassifications.has(metadata.classification)) {
      errors.push(`${relative(ROOT, path)} has invalid classification ${metadata.classification}`);
    }
    if (!allowedVerdicts.has(metadata.verdict)) {
      errors.push(`${relative(ROOT, path)} has invalid verdict ${metadata.verdict}`);
    }
    requireFields(metadata, ['owner', 'started', 'updated'], path);
    if (metadata.status === 'blocked' && (!metadata.blocked_on || metadata.blocked_on === 'none')) {
      errors.push(`${relative(ROOT, path)} is blocked without an unblock condition`);
    }
    if (metadata.status === 'complete' && metadata.verdict === 'pending') {
      errors.push(`${relative(ROOT, path)} is complete with a pending verdict`);
    }
    if (metadata.verdict === 'superseded' && (!metadata.superseded_by || metadata.superseded_by === 'none')) {
      errors.push(`${relative(ROOT, path)} is superseded without naming its replacement`);
    }
    if (metadata.status === 'complete') {
      requireSections(
        content,
        [
          'Scope and exact sources',
          'Change seen while moving backward',
          'Original-contract trace',
          'Construction and state-machine effect',
          'Assumptions and guarantee boundaries',
          'Evidence and oracle independence',
          'Downstream propagation',
          'Consequences and residual failures',
          'Falsification attempt and counterevidence',
          'Nuance preservation',
          'Verdict',
          'Findings and unresolved checks',
        ],
        path,
      );
    }
    commitStates.set(filename, { status: metadata.status, row: lineage[index], metadata, path });
  } catch (error) {
    errors.push(error.message);
  }
}

let incompleteSeen = false;
for (const row of lineage) {
  const state = commitStates.get(row.commit);
  if (state.status !== 'complete') incompleteSeen = true;
  else if (incompleteSeen) errors.push(`${row.commit} is complete before a newer commit in the reverse walk`);
}

const knownWorkArtifacts = new Set(workItems.map((row) => row.artifact));
const workStates = new Map();
for (const row of workItems) {
  const path = join(ROOT, row.artifact);
  if (!existsSync(path)) {
    workStates.set(row.id, { status: 'pending', row });
    continue;
  }
  try {
    const { metadata, content } = parseFrontMatter(path);
    requireFields(metadata, ['schema', 'kind', 'id', 'status'], path);
    if (metadata.schema !== '1') errors.push(`${row.artifact} has unsupported schema ${metadata.schema}`);
    if (metadata.kind !== 'work-item') errors.push(`${row.artifact} kind must be work-item`);
    if (metadata.id !== row.id) errors.push(`${row.artifact} id does not match work-items.tsv`);
    if (!allowedArtifactStatuses.has(metadata.status)) {
      errors.push(`${row.artifact} has invalid status ${metadata.status}`);
    }
    requireFields(metadata, ['owner', 'started', 'updated'], path);
    if (metadata.status === 'blocked' && (!metadata.blocked_on || metadata.blocked_on === 'none')) {
      errors.push(`${row.artifact} is blocked without an unblock condition`);
    }
    if (metadata.status === 'complete') {
      requireSections(
        content,
        [
          'Scope and exclusions',
          'Exact sources inspected',
          'Method',
          'Analysis',
          'Affirmative conclusions',
          'Candidate or validated findings',
          'Disconfirmed hypotheses and null results',
          'Unresolved questions',
          'Completion criteria',
          'Handoff',
        ],
        path,
      );
      const requiredTableHeaders = {
        'F-01': [
          '| Claim id | Exact source | Type | Actors | Guarantee or constraint | Assumptions | Open/candidate status | Gate | Falsifier |',
        ],
        'F-02': [
          '| Claim id | Exact source | Claim class | Actors/trust boundary | Claimed guarantee | Assumptions | Residual |',
          '| State machine | Persistent state | Transition | Required ordering | Crash behavior | Consumer/evidence |',
          '| TRD row | Selected/open/split | Construction or unresolved question | Downstream consumers | Evidence path |',
        ],
        'P-01': [
          '| Claim id | Original source | Introducing commit | Selection record | Final requirement | Executable evidence | Consumers | Disposition | First divergence |',
        ],
        'S-01': [
          '| Scenario | Initial state | Ordered events | Expected invariant | Designed outcome | Evidence | Result | Residual |',
        ],
        'V-01': [
          '| Finding or conclusion | Origin owner | Strongest challenge | Independent evidence | Result | Final disposition |',
        ],
        'Z-01': [
          '| Area | Artifact count expected | Count present | Unresolved | Synthesis disposition |',
        ],
      };
      if (/^X-/.test(row.id)) {
        requiredTableHeaders[row.id] = [
          '| Relevant claims/rows/commits | Reconstructed invariant | Actors and durable state | Scenario or counterexample | Evidence | Conclusion |',
        ];
      }
      for (const header of requiredTableHeaders[row.id] ?? []) {
        requireTableWithData(content, header, path);
      }
    }
    workStates.set(row.id, { status: metadata.status, row, metadata, path });
  } catch (error) {
    errors.push(error.message);
    workStates.set(row.id, { status: 'invalid', row });
  }
}

for (const path of markdownFiles(join(REVIEW_DIR, 'analysis'))) {
  const artifact = relative(ROOT, path);
  if (!knownWorkArtifacts.has(artifact)) errors.push(`${artifact} is not owned by work-items.tsv`);
}

for (const row of workItems) {
  const state = workStates.get(row.id);
  const dependencies = row.depends_on === '-' ? [] : row.depends_on.split(',');
  if (state.status !== 'pending') {
    for (const dependency of dependencies) {
      if (workStates.get(dependency)?.status !== 'complete') {
        errors.push(`${row.id} is ${state.status} before dependency ${dependency} is complete`);
      }
    }
  }
  if (/^B-/.test(row.id) && state.status === 'complete') {
    const incomplete = lineage
      .filter((commit) => commit.batch === row.id)
      .filter((commit) => commitStates.get(commit.commit).status !== 'complete');
    if (incomplete.length > 0) {
      errors.push(`${row.id} is complete with ${incomplete.length} incomplete commit cards`);
    }
  }
}

for (const row of lineage) {
  const state = commitStates.get(row.commit);
  const batchState = workStates.get(row.batch);
  if (
    state.status !== 'pending' &&
    !new Set(['in-progress', 'complete', 'blocked', 'needs-recheck']).has(batchState?.status)
  ) {
    errors.push(`${row.commit} has a review card while batch ${row.batch} is not active`);
  }
}

const allowedFindingStatuses = new Set(['candidate', 'validated', 'rejected', 'superseded']);
const allowedFindingTypes = new Set([
  'contradiction',
  'ambiguity',
  'propagated-assumption',
  'guarantee-overstatement',
  'evidence-weakness',
  'implementation-hazard',
  'acceptable-tradeoff',
]);
const allowedSeverities = new Set(['critical', 'high', 'medium', 'low', 'note']);
const allowedConfidences = new Set(['high', 'medium', 'low']);
const findingStatuses = new Map();
const findings = new Map();
const findingDir = join(REVIEW_DIR, 'findings');
for (const path of markdownFiles(findingDir)) {
  if (dirname(path) !== findingDir) {
    errors.push(`${relative(ROOT, path)} must be a direct child of docs/review/findings`);
    continue;
  }
  try {
    const { metadata, content } = parseFrontMatter(path);
    const filename = path.slice(path.lastIndexOf('/') + 1, -3);
    requireFields(
      metadata,
      [
        'schema',
        'kind',
        'id',
        'status',
        'type',
        'severity',
        'confidence',
        'introduced_by',
        'work_item',
        'created_by',
        'updated',
        'challenged_by',
      ],
      path,
    );
    if (metadata.schema !== '1') errors.push(`${relative(ROOT, path)} has unsupported schema ${metadata.schema}`);
    if (metadata.kind !== 'finding') errors.push(`${relative(ROOT, path)} kind must be finding`);
    if (metadata.id !== filename) errors.push(`${relative(ROOT, path)} id does not match its filename`);
    if (findings.has(metadata.id)) {
      errors.push(`${relative(ROOT, path)} duplicates finding id ${metadata.id}`);
      continue;
    }
    if (!/^f-[a-z0-9][a-z0-9-]+$/.test(metadata.id)) {
      errors.push(`${relative(ROOT, path)} has an invalid semantic finding id`);
    }
    if (!allowedFindingStatuses.has(metadata.status)) {
      errors.push(`${relative(ROOT, path)} has invalid finding status ${metadata.status}`);
    }
    if (!allowedFindingTypes.has(metadata.type)) errors.push(`${relative(ROOT, path)} has invalid type ${metadata.type}`);
    if (!allowedSeverities.has(metadata.severity)) {
      errors.push(`${relative(ROOT, path)} has invalid severity ${metadata.severity}`);
    }
    if (!allowedConfidences.has(metadata.confidence)) {
      errors.push(`${relative(ROOT, path)} has invalid confidence ${metadata.confidence}`);
    }
    if (
      metadata.introduced_by !== 'unknown' &&
      metadata.introduced_by !== config.base &&
      !commitStates.has(metadata.introduced_by)
    ) {
      errors.push(`${relative(ROOT, path)} introduced_by is outside the configured lineage`);
    }
    if (!workIds.has(metadata.work_item)) errors.push(`${relative(ROOT, path)} names unknown work item ${metadata.work_item}`);
    if (metadata.status !== 'candidate') {
      if (metadata.challenged_by === 'none') errors.push(`${relative(ROOT, path)} was disposed without a challenger`);
      if (metadata.challenged_by === metadata.created_by) {
        errors.push(`${relative(ROOT, path)} was challenged by its own creator`);
      }
    }
    if (metadata.status === 'superseded' && (!metadata.superseded_by || metadata.superseded_by === 'none')) {
      errors.push(`${relative(ROOT, path)} is superseded without naming its replacement`);
    }
    requireSections(
      content,
      [
        'Affected requirement or guarantee',
        'Original source',
        'End-state source',
        'First introduction and propagation',
        'Reachable consequence',
        'Supporting evidence',
        'Counterevidence and disconfirmation attempt',
        'Validation procedure',
        'Disposition',
      ],
      path,
    );
    findingStatuses.set(metadata.status, (findingStatuses.get(metadata.status) ?? 0) + 1);
    findings.set(metadata.id, { metadata, path });
  } catch (error) {
    errors.push(error.message);
  }
}

for (const { metadata, path } of findings.values()) {
  if (metadata.status === 'superseded' && !findings.has(metadata.superseded_by)) {
    errors.push(`${relative(ROOT, path)} supersedes to missing finding ${metadata.superseded_by}`);
  }
}

const sessionDir = join(REVIEW_DIR, 'sessions');
const sessions = markdownFiles(sessionDir);
const sessionStates = [];
const activeClaims = new Map();
const sessionIds = new Set();
for (const path of sessions) {
  if (dirname(path) !== sessionDir) {
    errors.push(`${relative(ROOT, path)} must be a direct child of docs/review/sessions`);
    continue;
  }
  try {
    const { metadata, content } = parseFrontMatter(path);
    requireFields(
      metadata,
      ['schema', 'kind', 'session', 'owner', 'work_items', 'started', 'updated', 'status', 'blocked_on'],
      path,
    );
    if (metadata.schema !== '1') errors.push(`${relative(ROOT, path)} has unsupported schema ${metadata.schema}`);
    if (metadata.kind !== 'session') errors.push(`${relative(ROOT, path)} kind must be session`);
    if (sessionIds.has(metadata.session)) errors.push(`${relative(ROOT, path)} duplicates session id ${metadata.session}`);
    sessionIds.add(metadata.session);
    if (!new Set(['in-progress', 'complete', 'blocked']).has(metadata.status)) {
      errors.push(`${relative(ROOT, path)} has invalid session status ${metadata.status}`);
    }
    if (metadata.status === 'blocked' && (!metadata.blocked_on || metadata.blocked_on === 'none')) {
      errors.push(`${relative(ROOT, path)} is blocked without an unblock condition`);
    }
    const claimed = metadata.work_items.split(',').map((id) => id.trim());
    for (const id of claimed) {
      if (id !== 'setup' && !workIds.has(id)) errors.push(`${relative(ROOT, path)} claims unknown work item ${id}`);
      if (metadata.status === 'in-progress' && id !== 'setup') {
        if (activeClaims.has(id)) {
          errors.push(`${id} is actively claimed by both ${activeClaims.get(id).metadata.session} and ${metadata.session}`);
        }
        activeClaims.set(id, { metadata, path });
      }
    }
    if (metadata.status === 'complete') {
      requireSections(
        content,
        [
          'Claim',
          'Sources read',
          'Commands and external evidence',
          'Work log',
          'Artifacts changed',
          'Findings and null results',
          'Handoff',
        ],
        path,
      );
    } else {
      requireSections(content, ['Claim'], path);
    }
    sessionStates.push({ metadata, path, claimed });
  } catch (error) {
    errors.push(error.message);
  }
}

for (const [id, claim] of activeClaims) {
  const work = workStates.get(id);
  if (!work || work.status !== 'in-progress') {
    errors.push(`${claim.metadata.session} actively claims ${id}, whose artifact is not in-progress`);
  } else if (work.metadata?.owner !== claim.metadata.owner) {
    errors.push(`${claim.metadata.session} owner does not match ${id}'s artifact owner`);
  }
}

const readyWork = workItems.filter((row) => {
  if (workStates.get(row.id).status !== 'pending') return false;
  const dependencies = row.depends_on === '-' ? [] : row.depends_on.split(',');
  return dependencies.every((dependency) => workStates.get(dependency)?.status === 'complete');
});
const resumableWork = workItems.filter((row) => {
  const status = workStates.get(row.id).status;
  return new Set(['in-progress', 'needs-recheck']).has(status) && !activeClaims.has(row.id);
});

const validationState = workStates.get('V-01');
if (validationState?.status === 'complete') {
  const validationOwner = validationState.metadata.owner;
  for (const { metadata, path } of findings.values()) {
    if (metadata.status === 'candidate') {
      errors.push(`${relative(ROOT, path)} remains candidate after V-01 completed`);
    }
    if (metadata.challenged_by !== validationOwner) {
      errors.push(`${relative(ROOT, path)} was not challenged by V-01 owner ${validationOwner}`);
    }
  }
}

const batchSummary = [...new Set(lineage.map((row) => row.batch))].map((batch) => {
  const rows = lineage.filter((row) => row.batch === batch);
  const counts = { pending: 0, 'in-progress': 0, complete: 0, blocked: 0, 'needs-recheck': 0 };
  for (const row of rows) counts[commitStates.get(row.commit).status] += 1;
  return { batch, total: rows.length, counts };
});

const workSummary = Object.fromEntries(
  ['pending', 'in-progress', 'complete', 'blocked', 'needs-recheck', 'invalid'].map((status) => [
    status,
    [...workStates.values()].filter((state) => state.status === status).length,
  ]),
);

const head = git(['rev-parse', 'HEAD']);
const headIndex = [...lineage].reverse().findIndex((row) => row.commit === head);
const checkoutPosition = head === config.base ? 0 : headIndex === -1 ? null : headIndex + 1;
const dirty = lines(git(['status', '--short']));
const nextCommit = lineage.find((row) => commitStates.get(row.commit).status !== 'complete');

const result = {
  valid: errors.length === 0,
  boundary: {
    base: config.base,
    tip: config.tip,
    commits: actualCommits.length,
    linear: !errors.some((error) => error.includes('parents')),
  },
  checkout: { head, position: checkoutPosition, dirty },
  batches: batchSummary,
  work: {
    counts: workSummary,
    ready: readyWork.map((row) => row.id),
    resumable: resumableWork.map((row) => row.id),
  },
  nextCommit: nextCommit
    ? { order: Number(nextCommit.order), commit: nextCommit.commit, subject: nextCommit.subject }
    : null,
  findings: Object.fromEntries(findingStatuses),
  sessions: {
    total: sessions.length,
    active: sessionStates.filter((session) => session.metadata.status === 'in-progress').map((session) => ({
      session: session.metadata.session,
      owner: session.metadata.owner,
      workItems: session.claimed,
    })),
  },
  errors,
};

if (JSON_OUTPUT) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(
    `review: ${result.valid ? 'valid' : 'INVALID'} lineage — ${actualCommits.length} linear commits, ` +
      `${config.base.slice(0, 7)}..${config.tip.slice(0, 7)}`,
  );
  const position =
    checkoutPosition === null ? 'outside the pinned range' : `commit ${checkoutPosition} of ${lineage.length}`;
  console.log(`checkout: ${head.slice(0, 7)} (${position}); ${dirty.length} dirty path(s)`);
  for (const batch of batchSummary) {
    console.log(
      `${batch.batch}: ${batch.counts.complete}/${batch.total} complete · ` +
        `${batch.counts['in-progress']} in progress · ${batch.counts.blocked} blocked`,
    );
  }
  console.log(
    `work: ${workSummary.complete} complete · ${workSummary['in-progress']} in progress · ` +
      `${workSummary.pending} pending · ${workSummary.blocked} blocked`,
  );
  console.log(`ready: ${readyWork.map((row) => row.id).join(', ') || 'none'}`);
  console.log(`resumable: ${resumableWork.map((row) => row.id).join(', ') || 'none'}`);
  if (nextCommit) {
    console.log(`next commit: ${nextCommit.order} ${nextCommit.commit.slice(0, 7)} — ${nextCommit.subject}`);
  }
  console.log(
    `findings: ${[...findingStatuses.entries()].map(([status, count]) => `${count} ${status}`).join(' · ') || 'none'}`,
  );
  console.log(`sessions: ${sessions.length} total · ${result.sessions.active.length} active`);
  for (const session of result.sessions.active) {
    console.log(`  ${session.session}: ${session.owner} — ${session.workItems.join(', ')}`);
  }
  if (errors.length > 0) {
    console.error('\nreview validation failed:');
    for (const error of errors) console.error(`- ${error}`);
  }
}

if (errors.length > 0) process.exit(1);
