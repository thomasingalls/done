import assert from 'node:assert/strict';
import {
  warmNative,
  selected,
  syncing,
  settled,
  online,
  edit,
  view,
  close,
  cold,
  waitPredicate,
} from './warm-audit-fixture.mjs';

const starts = (page) =>
  page.evaluate(() => warmAuditTest.events.filter((event) => event.kind === 'start').length);
const quietWindow = (page, ms) => page.waitForTimeout(ms);

export const nativeWarmAuditQuiet = async (t) => {
  const f = await warmNative(t),
    item = await selected(f, 'warm-audit-quiet');
  await syncing(f.page, item);
  await settled(f.page);
  await online(f.page, false);
  await f.page.evaluate(() => {
    warmAuditTest.hold();
    warmAuditTest.expire();
  });
  await waitPredicate(f.page, () => warmForegroundEntered === true);
  await quietWindow(f.page, 1100);
  assert.equal(await starts(f.page), 0, 'queued native work must defer ordinary audit');
  assert.equal(
    await f.page.evaluate(
      () => warmAuditTest.events.filter((event) => event.kind === 'scheduled').length,
    ),
    0,
    'foreground work must prevent scheduling the discretionary job',
  );
  await f.page.evaluate(async () => {
    document.dispatchEvent(new Event('keydown'));
    releaseWarmForeground();
    await heldWarmForeground;
  });
  for (const kind of ['beforeinput', 'pointerdown']) {
    await quietWindow(f.page, 650);
    assert.equal(await starts(f.page), 0, 'quiet period must not be shortened');
    await f.page.evaluate((kind) => document.dispatchEvent(new Event(kind)), kind);
  }
  await quietWindow(f.page, 650);
  assert.equal(await starts(f.page), 0);
  await waitPredicate(f.page, () => warmAuditTest.events.some((event) => event.kind === 'end'));
  const expected = await view(f.page);
  await close(f.page);
  const closedCount = await starts(f.page);
  await f.page.evaluate(() => {
    warmAuditTest.expire();
    for (const kind of ['keydown', 'beforeinput', 'pointerdown'])
      document.dispatchEvent(new Event(kind));
  });
  await quietWindow(f.page, 1100);
  assert.equal(await starts(f.page), closedCount, 'closed owner cannot rearm its audit');
  assert.equal(await f.page.evaluate(() => warmAuditTest.closed()), true);
  await cold(f);
  await syncing(f.page, item);
  await settled(f.page);
  assert.equal(await view(f.page), expected);
  await close(f.page);
};

export const nativeWarmAuditDisagreement = async (t) => {
  const f = await warmNative(t),
    item = await selected(f, 'warm-audit-oracle');
  await syncing(f.page, item);
  await settled(f.page);
  await online(f.page, false);
  assert.equal((await f.page.evaluate(() => opened.removeLocalHistory(0))).kind, 'removed');
  await edit(f.page, 0, 0, 'ACKNOWLEDGED AUDIT WRITING ');
  await f.page.evaluate(() => editor.whenDurable());
  const expected = await view(f.page);
  await f.page.evaluate(() => {
    globalThis.forceWarmAuditMismatch = true;
    warmAuditTest.expire();
    document.dispatchEvent(new Event('beforeinput'));
  });
  await quietWindow(f.page, 650);
  assert.equal(await f.page.evaluate(() => editor.status.state), 'active');
  await waitPredicate(
    f.page,
    () =>
      editor.status.state === 'closed' ||
      warmAuditTest.events.some((event) => event.kind === 'end' && event.complete),
  );
  assert.equal(
    await f.page.evaluate(() => editor.status.state),
    'closed',
    'semantic oracle mismatch must close the owner',
  );
  const events = await f.page.evaluate(() => warmAuditTest.events);
  assert.ok(events.some((event) => event.kind === 'error' && event.code === 'repair-required'));
  await close(f.page);
  await cold(f);
  await syncing(f.page, item);
  await settled(f.page);
  assert.equal(await view(f.page), expected);
  assert.equal(await f.page.evaluate(() => editor.status.state), 'active');
  await close(f.page);
};
