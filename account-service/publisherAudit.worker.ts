import { enableMembershipStore } from './membershipStore.ts';
/** Read-only snapshot census. No signing key, issuer, network or repair path. */
import { parentPort, workerData } from 'node:worker_threads';
import { DatabaseSync } from 'node:sqlite';
import { snapshot, census, verifyCurrentWorkspaceAuthority, selectPublisher } from './delivery.ts';
import { publisherContext } from './publisherTips.ts';
const { path, workspace, publisher, context, pin, membership } = workerData;
const db = new DatabaseSync(path, { readOnly: true });
try {
  db.exec('PRAGMA query_only=ON; BEGIN');
  if (membership) enableMembershipStore(db);
  const s = snapshot(db, workspace, publisher);
  if (!s || publisherContext(s) !== context) parentPort!.postMessage({ kind: 'stale' });
  else {
    try {
      // Custody is deliberately unavailable in this worker. The exact header digest was
      // captured by the live owner after its custody check; all public proofs are reverified.
      const auth = selectPublisher(
        await verifyCurrentWorkspaceAuthority(s, { pin, check() {} }),
        s.publisher,
      );
      const result = await census(s, auth);
      parentPort!.postMessage({ kind: 'verified', count: result.count });
    } catch {
      parentPort!.postMessage({ kind: 'mismatch' });
    }
  }
} finally {
  if (db.isTransaction) db.exec('ROLLBACK');
  db.close();
}
