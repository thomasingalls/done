import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { PrivateAuthority } from '../../account-service/authority.ts';
import {
  native,
  selected,
  open,
  close,
  cold,
  prepare,
  submission,
  pending,
  record,
  deliveryStatus,
  edit,
} from '../account-delivery/fixtures.mjs';
test(
  'real v8 browser submissions receive owned service heads and recover a lost acceptance reply',
  { timeout: 30000 },
  async (t) => {
    const f = await native(t),
      item = await selected(f, 'service-owned-head');
    await open(f.page, item);
    await prepare(f.page);
    const authority = PrivateAuthority.open(
      join(dirname(f.dbPath), 'root.sqlite'),
      f.pin,
      f.testOperatorKey,
    );
    t.after(() => authority.close());
    const call = (w) =>
      authority.decideSubmission(f.server.core, {
        workspaceId: item.scope.workspaceId,
        bytes: new Uint8Array(w.bytes),
      });
    const first = await submission(f.page),
      accepted = await call(first);
    assert.equal(accepted.kind, 'decision');
    // Lose the response at the test bridge before the browser persists it.
    await close(f.page);
    await cold(f);
    await open(f.page, item);
    assert.deepEqual(await submission(f.page), first);
    assert.equal((await pending(f.page)).length, 1);
    assert.deepEqual(await call(first), accepted);
    assert.equal((await record(f.page, 1, accepted.bytes)).status.acceptedThrough, 1);
    await edit(f.page, 0, 0, 'service round trip ');
    await prepare(f.page);
    const second = await submission(f.page, 2),
      r = await call(second);
    assert.equal(r.kind, 'decision');
    assert.equal((await record(f.page, 2, r.bytes)).status.acceptedThrough, 2);
    await close(f.page);
    await cold(f);
    await open(f.page, item);
    assert.equal((await deliveryStatus(f.page)).acceptedThrough, 2);
    assert.deepEqual(await pending(f.page), []);
    assert.ok(
      (await f.page.evaluate(() => editor.read().master)).startsWith('service round trip '),
    );
    await close(f.page);
  },
);
