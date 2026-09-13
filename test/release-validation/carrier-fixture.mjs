import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { catalogueCensus } from '../../scripts/release-validation/census.mjs';
import { hash } from '../../scripts/release-validation/identity.mjs';

export function carrierEvidence(
  t,
  family,
  scope = family + '-carrier-browser',
  { candidate = family, patchPrefix = 'src/crdt/' } = {},
) {
  const root = mkdtempSync(join(tmpdir(), 'done-carrier-census-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const catalogue = readFileSync(`scripts/${family}/catalog.mjs`, 'utf8');
  const selection = catalogueCensus(catalogue, { patches: true });
  const contents = new Map([
    ['account-protocol/fixture.ts', 'protocol'],
    ['wasm/journal-seal/seal.generated.ts', 'seal'],
  ]);
  for (const m of selection.mutants) {
    const path = patchPrefix + m.patch.file;
    contents.set(path, (contents.get(path) ?? '') + m.patch.from + '\n');
  }
  const sources = [];
  for (const [path, text] of contents) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
    sources.push({ path, sha256: hash(text) });
  }
  const pins = Object.fromEntries(sources.map((p) => [p.path, p.sha256]));
  const assertion = (id, passed) => ({ id, actual: true, expected: passed, passed });
  const row = (id) => ({
    id,
    status: 'pass',
    assertions: [
      assertion('baseline', true),
      ...selection.mutants.filter((m) => m.case === id).map((m) => assertion(m.assertion, true)),
    ],
  });
  const actual = {
    schema: 1,
    releaseNonce: 'fresh',
    scope,
    finished: 'now',
    exitCode: 0,
    requestedCandidates: [candidate],
    requestedCases: selection.cases.map((c) => c.id),
    candidates: [
      {
        id: candidate,
        mutation: null,
        source: { files: pins },
        cases: selection.cases.map((c) => row(c.id)),
      },
    ],
    mutations: selection.mutants.map((m) => ({
      id: m.id,
      assertion: m.assertion,
      status: 'detected',
      result: {
        id: m.id,
        mutation: m.patch,
        source: {
          files: {
            ...pins,
            [patchPrefix + m.patch.file]: hash(
              contents.get(patchPrefix + m.patch.file).replace(m.patch.from, m.patch.to),
            ),
          },
        },
        cases: [{ id: m.case, status: 'fail', assertions: [assertion(m.assertion, false)] }],
      },
    })),
    servers: [candidate, ...selection.mutants.map((m) => m.id)].map((variant) => ({
      variant,
      origin: 'http://127.0.0.1:12345',
      closed: true,
    })),
  };
  return { selection, actual, context: { nonce: 'fresh', root, sources } };
}
