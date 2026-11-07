// @vitest-environment node
import { afterAll, beforeAll, expect, it } from 'vitest';
import { expect as legacyExpect } from '@playwright/test';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { acceptedRows } from './inbound-native/fixtures';
import { A, entry, authority } from './account-inbound/fixtures';
import { decodeSubmission, encodeSubmission } from '../account-protocol/submission';
import { decodeNetworkEnvelope } from '../account-protocol/envelope';
import {
  decodePositionResponse,
  encodePositionResponse,
  type Bytes,
} from '../account-protocol/positionDecision';

/** Frozen original four Playwright checks from 4d20580c:test/inbound-native/fixtures.ts.
 * This oracle stays test-only; production helpers must not create a reporting step per row. */
function originalAcceptedRows(state: string) {
  const db = new DatabaseSync(join(state, 'account.sqlite'), { readOnly: true });
  try {
    return db
      .prepare(
        "SELECT submission,response FROM delivery_decisions WHERE kind='accepted' UNION ALL SELECT submission,response FROM publisher_decisions WHERE kind='accepted'",
      )
      .all()
      .map((row) => {
        const envelope = decodeNetworkEnvelope(
            decodeSubmission(new Uint8Array(row['submission'] as Uint8Array)).envelope,
          ),
          decision = decodePositionResponse(new Uint8Array(row['response'] as Uint8Array));
        legacyExpect(decision.kind).toBe('accepted');
        if (decision.kind !== 'accepted') throw Error('Expected committed acceptance');
        legacyExpect(decision.head.credential).toBe(envelope.credential_id);
        legacyExpect(decision.head.position).toBe(envelope.seq);
        legacyExpect(decision.leaf.digest).toBe(Buffer.from(envelope.digest).toString('hex'));
        return {
          publisher: envelope.credential_id,
          position: envelope.seq,
          key: envelope.credential_id + '/' + envelope.seq + '/' + decision.leaf.digest,
        };
      });
  } finally {
    db.close();
  }
}

let root: string, source: string, sourceHash: string;
const wire = entry({ publisher: A, updates: [new Uint8Array([1])] }, 1);
const submission = encodeSubmission({
  lineage: authority().lineage,
  envelope: wire.envelope,
  parent: null,
  signature: new Uint8Array(64),
});
const accepted = decodePositionResponse(wire.proof);
if (accepted.kind !== 'accepted') throw Error('Expected synthetic accepted fixture');
const digest = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'done-accepted-rows-'));
  source = join(root, 'closed-source');
  mkdirSync(source);
  const db = new DatabaseSync(join(source, 'account.sqlite'));
  try {
    db.exec(
      'CREATE TABLE delivery_decisions(kind TEXT,submission BLOB,response BLOB);' +
        'CREATE TABLE publisher_decisions(kind TEXT,submission BLOB,response BLOB)',
    );
    db.prepare('INSERT INTO delivery_decisions VALUES(?,?,?)').run(
      'accepted',
      submission,
      wire.proof,
    );
  } finally {
    db.close();
  }
  sourceHash = digest(join(source, 'account.sqlite'));
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

function privateCopy(replacement?: { submission?: Bytes; response?: Bytes }) {
  // Never open a frozen/source database just to observe it: SQLite read-only can create sidecars.
  const directory = mkdtempSync(join(root, 'private-'));
  copyFileSync(join(source, 'account.sqlite'), join(directory, 'account.sqlite'));
  if (replacement) {
    const db = new DatabaseSync(join(directory, 'account.sqlite'));
    try {
      db.prepare('UPDATE delivery_decisions SET submission=?,response=?').run(
        replacement.submission ?? submission,
        replacement.response ?? wire.proof,
      );
    } finally {
      db.close();
    }
  }
  return directory;
}
function sourceUnchanged() {
  expect(digest(join(source, 'account.sqlite'))).toBe(sourceHash);
  expect(readdirSync(source)).toEqual(['account.sqlite']);
}

it('returns the same complete census through the original and strict checks on private copies', () => {
  const directory = privateCopy();
  expect(acceptedRows(directory)).toEqual(originalAcceptedRows(directory));
  expect(acceptedRows(directory)).toEqual([
    { publisher: A, position: 1, key: A + '/1/' + wire.digest },
  ]);
  sourceUnchanged();
});

const corruptions: { name: string; submission?: Bytes; response?: Bytes }[] = [
  {
    name: 'kind',
    response: encodePositionResponse({
      kind: 'refused',
      refusal: {
        workspace: authority().workspace,
        credential: A,
        position: 1,
        digest: wire.digest,
        epoch: 1,
        reason: 'conflict',
        parent: '00'.repeat(32),
        signature: '00'.repeat(64),
      },
    }),
  },
  {
    name: 'credential',
    response: encodePositionResponse({
      ...accepted,
      head: { ...accepted.head, credential: '99'.repeat(16) },
    }),
  },
  {
    name: 'position',
    response: encodePositionResponse({ ...accepted, head: { ...accepted.head, position: 2 } }),
  },
  {
    name: 'digest',
    response: encodePositionResponse({
      ...accepted,
      leaf: { ...accepted.leaf, digest: '00'.repeat(32) },
    }),
  },
  { name: 'malformed submission', submission: new Uint8Array([1]) },
  { name: 'malformed response', response: new Uint8Array([1]) },
];
it.each(['kind', 'credential', 'position', 'digest', 'malformed submission', 'malformed response'])(
  'retains both implementations’ refusal of %s',
  (name) => {
    const corruption = corruptions.find((candidate) => candidate.name === name);
    if (!corruption) throw Error('Missing declared corruption');
    const directory = privateCopy(corruption);
    expect(() => originalAcceptedRows(directory)).toThrow();
    expect(() => acceptedRows(directory)).toThrow();
    sourceUnchanged();
  },
);

it('retains both SQL branches, duplicate rows and the exact return shape', () => {
  const directory = privateCopy();
  const db = new DatabaseSync(join(directory, 'account.sqlite'));
  try {
    db.prepare('INSERT INTO publisher_decisions VALUES(?,?,?)').run(
      'accepted',
      submission,
      wire.proof,
    );
  } finally {
    db.close();
  }
  expect(acceptedRows(directory)).toEqual(originalAcceptedRows(directory));
  expect(acceptedRows(directory)).toHaveLength(2);
  sourceUnchanged();
});
