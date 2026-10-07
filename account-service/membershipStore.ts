import type { DatabaseSync } from 'node:sqlite';
import {
  MEMBERSHIP_CREDENTIAL_LIMIT,
  MEMBERSHIP_PROOF_LIMIT,
} from '../account-protocol/membership.ts';

/** Explicit development opt-in. No old host may open this schema and keep accepting at epoch 3. */
export const MEMBERSHIP_SCHEMA = `CREATE TABLE membership_admissions (
 workspace_id TEXT NOT NULL, epoch INTEGER NOT NULL CHECK(epoch>=4), parent TEXT NOT NULL,
 head TEXT NOT NULL, preparation_id TEXT NOT NULL, artifact TEXT NOT NULL, boundaries TEXT NOT NULL,
 PRIMARY KEY(workspace_id,epoch), UNIQUE(workspace_id,parent), UNIQUE(workspace_id,head),
 UNIQUE(workspace_id,preparation_id));`;
const enabled = new WeakSet<DatabaseSync>();
export function enableMembershipStore(db: DatabaseSync) {
  enabled.add(db);
}
export function membershipEnabled(db: DatabaseSync) {
  return enabled.has(db);
}
export interface MembershipRow {
  workspace_id: string;
  epoch: number;
  parent: string;
  head: string;
  preparation_id: string;
  artifact: string;
  boundaries: string;
}
export function membershipRows(db: DatabaseSync, workspace: string): MembershipRow[] {
  if (!enabled.has(db)) return [];
  if (!db.isTransaction) throw Error('Membership capture requires a transaction');
  const sizes = db
    .prepare(
      'SELECT length(CAST(artifact AS BLOB)) AS a, length(CAST(boundaries AS BLOB)) AS b FROM membership_admissions WHERE workspace_id=? ORDER BY epoch LIMIT ?',
    )
    .all(workspace, MEMBERSHIP_CREDENTIAL_LIMIT + 1);
  if (
    sizes.length > MEMBERSHIP_CREDENTIAL_LIMIT ||
    sizes.some((s) => Number(s.a) > MEMBERSHIP_PROOF_LIMIT || Number(s.b) > MEMBERSHIP_PROOF_LIMIT)
  )
    throw Error('Oversized retained membership history');
  return db
    .prepare('SELECT * FROM membership_admissions WHERE workspace_id=? ORDER BY epoch')
    .all(workspace) as unknown as MembershipRow[];
}

/** Each admission owns a separate exchange; completed historical ceremonies remain immutable. */
export const MEMBERSHIP_CEREMONY_SCHEMA = `CREATE TABLE membership_ceremonies (
 workspace_id TEXT NOT NULL, preparation_id TEXT NOT NULL, head TEXT NOT NULL,
 candidate_id TEXT NOT NULL, existing_commit TEXT NOT NULL, new_commit TEXT,
 existing_reveal TEXT, new_reveal TEXT, decision TEXT, cancellation TEXT,
 expired INTEGER NOT NULL DEFAULT 0 CHECK(expired IN (0,1)),
 PRIMARY KEY(workspace_id,preparation_id), UNIQUE(workspace_id,head),
 FOREIGN KEY(workspace_id,preparation_id) REFERENCES membership_admissions(workspace_id,preparation_id));`;
