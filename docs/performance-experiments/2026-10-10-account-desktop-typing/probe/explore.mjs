// Exploration only: can an account-with-sync session be driven, and what does a keystroke do on the wire?
import { join } from 'node:path';
import { rmSync } from 'node:fs';
import {
  ROOT,
  startBackend,
  startApp,
  stopAll,
  launch,
  createAccount,
  instrument,
  network,
  typeBlock,
  COMPOSE,
  CARD_EDITOR,
  drained,
} from './lib.mjs';

const state = join(ROOT, 'state', 'explore');
rmSync(state, { recursive: true, force: true });
let browser;
try {
  await startBackend(state, true);
  await startApp(state, true);
  browser = await launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 200));
  });
  await page.addInitScript(instrument);
  const net = await network(page);
  const t0 = Date.now();
  await createAccount(page);
  console.log('account created in', Date.now() - t0, 'ms; url', page.url());
  console.log(
    'buttons:',
    (await page.getByRole('button').allTextContents())
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 40),
  );
  const setup = net.all();
  console.log('setup requests', setup.requests.length);
  const paths = {};
  for (const r of setup.requests)
    paths[r.method + ' ' + r.url] = (paths[r.method + ' ' + r.url] ?? 0) + 1;
  console.log(paths);
  await page.locator(COMPOSE).waitFor({ state: 'visible' });
  // A card to type into, the way test/latency/diagnosis.spec.ts makes one.
  await page.locator('.goals .cm-content').click();
  await page.keyboard.insertText('a card to open and type into');
  await page.locator('.goals').getByRole('button', { name: 'Scheduled' }).click();
  await page.locator('.card[data-section="scheduled"] .card-surface').first().click();
  await page.locator(CARD_EDITOR).waitFor({ state: 'visible' });
  await page.keyboard.press('ControlOrMeta+End');
  await drained(page);
  await page.waitForTimeout(2000);
  const mark = net.mark();
  const block = await typeBlock(page, 'hello there', [150]);
  const after = net.since(mark);
  console.log(
    'keys',
    block.keys.map((k) => Math.round(k.paint)),
  );
  console.log('status transitions', block.status.length, block.status.slice(0, 6));
  console.log('long', block.long.length, 'loaf', block.loaf.length);
  console.log('requests during 11 keys:', after.requests.length);
  for (const r of after.requests)
    console.log(
      ' ',
      r.method,
      r.url,
      'status',
      r.status,
      'req',
      r.requestBytes,
      'resp',
      r.encoded ?? r.dataBytes,
      'ms',
      r.end ? Math.round(r.end - r.start) : 'open',
    );
  console.log('stream chunks', after.chunks.length, after.chunks.slice(0, 5));
  console.log('card text:', (await page.locator(CARD_EDITOR).textContent()).slice(-40));
  console.log(
    'open streams:',
    net
      .all()
      .requests.filter((r) => /subscribe/.test(r.url))
      .map((r) => [r.status, r.mime, r.end ? 'closed' : 'open']),
  );
} catch (error) {
  console.log('FAILED', error);
} finally {
  await browser?.close();
  await stopAll();
}
