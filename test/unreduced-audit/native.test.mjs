import test from 'node:test';
import assert from 'node:assert/strict';
import {
  nativeUnreduced,
  selected,
  syncing,
  settled,
  online,
  edit,
  view,
  close,
  cold,
  waitPredicate,
} from './fixture.mjs';
async function setup(t, id) {
  const f = await nativeUnreduced(t),
    item = await selected(f, id);
  await syncing(f.page, item);
  await settled(f.page);
  await online(f.page, false);
  assert.equal(
    await f.page.evaluate(() => unreducedOwnerUsesBaseline()),
    false,
    'fixture must exercise the unreduced owner',
  );
  return { f, item };
}
const starts = (page) =>
  page.evaluate(() => unreducedAuditFixture.events.filter((x) => x === 'start').length);
test(
  'unreduced full oracle waits for actual foreground work and input quiet, then survives close and cold',
  { timeout: 60000 },
  async (t) => {
    const { f, item } = await setup(t, 'unreduced-quiet');
    await edit(f.page, 0, 0, 'UNREDUCED AUDIT WRITING ');
    await f.page.evaluate(() => editor.whenDurable());
    const expected = await view(f.page);
    await f.page.evaluate(() => {
      unreducedAuditFixture.events.length = 0;
      unreducedAuditFixture.hold();
      unreducedAuditFixture.expire();
    });
    await waitPredicate(f.page, () => unreducedForegroundEntered === true);
    await f.page.waitForTimeout(1100);
    assert.equal(await starts(f.page), 0);
    await f.page.evaluate(async () => {
      document.dispatchEvent(new Event('beforeinput'));
      releaseUnreducedForeground();
      await heldUnreducedForeground;
    });
    await f.page.waitForTimeout(650);
    assert.equal(await starts(f.page), 0);
    await waitPredicate(f.page, () => unreducedAuditFixture.events.includes('passed'));
    assert.equal(await f.page.evaluate(() => unreducedAuditFixture.closed()), false);
    const pressure = await f.page.evaluate(() => unreducedAuditFixture.pressure());
    assert.deepEqual(pressure, { rows: 0, positions: 0, due: false });
    await close(f.page);
    const before = await starts(f.page);
    await f.page.evaluate(() => unreducedAuditFixture.expire());
    await f.page.waitForTimeout(1100);
    assert.equal(await starts(f.page), before);
    await cold(f);
    await syncing(f.page, item);
    await settled(f.page);
    assert.equal(await view(f.page), expected);
    await close(f.page);
  },
);
test(
  'unreduced oracle disagreement still closes the owner after idle start and retains all acknowledged writing',
  { timeout: 60000 },
  async (t) => {
    const { f, item } = await setup(t, 'unreduced-disagreement');
    await edit(f.page, 0, 0, 'ACKNOWLEDGED UNREDUCED WRITING ');
    await f.page.evaluate(() => editor.whenDurable());
    const expected = await view(f.page);
    await f.page.evaluate(() => {
      unreducedAuditFixture.events.length = 0;
      unreducedAuditFixture.mismatch = true;
      unreducedAuditFixture.expire();
      document.dispatchEvent(new Event('beforeinput'));
    });
    await f.page.waitForTimeout(650);
    assert.equal(await f.page.evaluate(() => unreducedAuditFixture.closed()), false);
    await waitPredicate(
      f.page,
      () => unreducedAuditFixture.closed() || unreducedAuditFixture.events.includes('passed'),
    );
    assert.equal(
      await f.page.evaluate(() => unreducedAuditFixture.closed()),
      true,
      'semantic disagreement must close the owner',
    );
    await close(f.page);
    await cold(f);
    await syncing(f.page, item);
    await settled(f.page);
    assert.equal(await view(f.page), expected);
    await close(f.page);
  },
);
