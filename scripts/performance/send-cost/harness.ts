/** Send-cost measurement harness (phase 554). Not a test: one step per run, chosen by SEND_COST_STEP.
 *
 * Two fictional devices of one Account (A original, B joined) on the in-process development
 * service behind the packaged-application gateway. A sends; B is the peer. Each insert into A's
 * master text is one sent position. Per-position local cost is read from A's Worker realm:
 * `__doneLedgerMetrics().acceptedSends` (step wall time minus the HTTP submit wait).
 *
 * Steps: seed (create the account), grow (write positions, snapshot at SEND_COST_TARGETS),
 * reduce (complete one local reduction on a copy of each snapshot), measure (warm-up and K sends).
 * Seeds, snapshots and raw results stay under SEND_COST_ROOT, outside the repository.
 */
import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';
import { startDevelopmentAccountServer } from '../../../account-service/development-server.ts';
import { startAccountGateway } from '../../lib/account-gateway.mjs';
import { account, pending, compared } from '../../../test/device-enrollment/helpers';
import {
  openSaved,
  credentials,
  restoreAuthenticator,
  type SavedCredential,
} from '../../../test/packaged-account/devices';
import { lock } from '../../../test/inbound-native/fixtures';
import type {} from './driver';

const port = Number(process.env['SEND_COST_PORT'] ?? 54391);
const origin = `http://localhost:${port}`;
const driverPath = '/scripts/performance/send-cost/driver.html';
type Actor = { role: 'A' | 'B'; joined: boolean; code: string; credentials: SavedCredential[] };
type Seed = { preparedAt: string; actors: Actor[] };

function env() {
  const root = process.env['SEND_COST_ROOT'],
    build = process.env['SEND_COST_BUILD'];
  if (!root || !build || !isAbsolute(root) || !isAbsolute(build))
    throw Error('Declare absolute SEND_COST_ROOT and SEND_COST_BUILD');
  if (!existsSync(join(build, driverPath))) throw Error('Build lacks the send-cost driver');
  return { root, build };
}
async function service(directory: string, build: string) {
  const backend = await startDevelopmentAccountServer({
    directory,
    port: port + 3,
    policy: { origin, rpId: 'localhost' },
    networkSessions: true,
    membershipContinuation: true,
  });
  try {
    const app = await startAccountGateway({ port, origin, servicePort: port + 3, packaged: build });
    return {
      async close() {
        await app.close();
        await backend.close();
      },
    };
  } catch (cause) {
    await backend.close();
    throw cause;
  }
}
async function launch(profile: string) {
  const context = await chromium.launchPersistentContext(profile, {
    headless: true,
    baseURL: origin,
    timezoneId: 'Europe/Paris',
    viewport: { width: 1280, height: 900 },
  });
  context.setDefaultTimeout(30000);
  context.setDefaultNavigationTimeout(30000);
  return context;
}
async function openDriver(page: Page, actor: Actor) {
  await restoreAuthenticator(page, actor.credentials);
  await page.goto(origin + driverPath);
  await expect.poll(() => page.evaluate(() => !!globalThis.sendCost)).toBe(true);
  const began = Date.now();
  await page.evaluate(({ code, joined }) => globalThis.sendCost.open(code, joined), actor);
  return Date.now() - began;
}
const accepted = (page: Page) =>
  page.evaluate(() => globalThis.sendCost.status().send.acceptedThrough);
const worker = (page: Page) => {
  const found = page.workers().filter((w) => /accountOwner\.worker/.test(w.url()));
  if (found.length !== 1) throw Error('Expected one Account owner Worker, found ' + found.length);
  return found[0]!;
};
type Metrics = {
  work: Record<string, number>;
  costs: Record<string, { calls: number; totalMs: number; maxMs: number }>;
  timings: Record<string, { calls: number; totalMs: number; maxMs: number }>;
  acceptedSends: { stepMs: number; networkMs: number }[];
} & Record<string, unknown>;
const metrics = (page: Page) =>
  worker(page).evaluate(() => {
    const read = (globalThis as unknown as { __doneLedgerMetrics?: () => unknown })
      .__doneLedgerMetrics;
    if (!read) throw Error('Unprofiled build: __doneLedgerMetrics is absent in the Worker');
    return read();
  }) as Promise<Metrics>;
/** One insert, one accepted position; returns the edit-to-accepted wall time. */
async function sendOne(page: Page, text: string) {
  const before = await accepted(page),
    began = Date.now();
  await page.evaluate((t) => globalThis.sendCost.insert(t), text);
  await expect
    .poll(() => accepted(page), { timeout: 180000, intervals: [20, 40, 80] })
    .toBeGreaterThan(before);
  return Date.now() - began;
}
/** Physical rows in the content stores: the index bound counts these (plus receipt extents). */
const rows = (page: Page) =>
  page.evaluate(async () => {
    const counts: Record<string, number> = {};
    for (const info of await indexedDB.databases()) {
      if (!info.name) continue;
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const q = indexedDB.open(info.name!);
        q.onsuccess = () => resolve(q.result);
        q.onerror = () => reject(q.error);
      });
      try {
        const names = [...db.objectStoreNames];
        if (!['meta', 'content', 'heads', 'outbound'].every((n) => names.includes(n))) continue;
        const tx = db.transaction(['content', 'heads', 'outbound'], 'readonly');
        let total = 0;
        for (const n of ['content', 'heads', 'outbound'])
          total += await new Promise<number>((resolve, reject) => {
            const c = tx.objectStore(n).count();
            c.onsuccess = () => resolve(c.result);
            c.onerror = () => reject(c.error);
          });
        counts[info.name] = total;
      } finally {
        db.close();
      }
    }
    return counts;
  });
const copy = (from: string, to: string) => {
  if (existsSync(to)) throw Error('Refusing to overwrite ' + to);
  for (const name of ['service', 'A', 'B', 'seed.json'])
    cpSync(join(from, name), join(to, name), { recursive: true });
};
const readSeed = (dir: string) => JSON.parse(readFileSync(join(dir, 'seed.json'), 'utf8')) as Seed;
const record = (path: string, value: unknown) => {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 1));
};

test.describe.configure({ mode: 'serial' });
test.setTimeout(Number(process.env['SEND_COST_TIMEOUT_MS'] ?? 6 * 60 * 60 * 1000));

test('send-cost step', async () => {
  const { root, build } = env(),
    step = process.env['SEND_COST_STEP'];
  if (step === 'seed') return seed(root, build);
  if (step === 'grow') return grow(root, build);
  if (step === 'reduce') return reduce(root, build);
  if (step === 'measure') return measure(root, build);
  throw Error('SEND_COST_STEP must be seed, grow, reduce or measure');
});

async function seed(root: string, build: string) {
  const directory = join(root, 'seed');
  if (existsSync(directory)) throw Error('Seed exists; declare another root');
  mkdirSync(directory, { recursive: true });
  const backend = await service(join(directory, 'service'), build),
    contexts: BrowserContext[] = [];
  try {
    for (const role of ['A', 'B']) contexts.push(await launch(join(directory, role)));
    const [a, b] = contexts.map((c) => c.pages()[0]!);
    const first = await account(a!),
      second = await pending(b!, first.link, first.auth);
    await a!.getByLabel('Code on the new device').fill(await compared(a!, b!));
    await a!.getByRole('button', { name: 'Compare and approve', exact: true }).click();
    for (const p of [a!, b!])
      await expect(
        p.getByText('Content access is installed and certified.', { exact: false }),
      ).toBeVisible({ timeout: 60000 });
    await a!.getByRole('button', { name: 'Make writing available', exact: true }).click();
    await expect(
      a!.getByText('Your writing is available to the approved device.', { exact: false }),
    ).toBeVisible({ timeout: 60000 });
    await a!.getByRole('link', { name: 'Close and return to accounts' }).click();
    await a!.goto('/');
    await openSaved(a!, first.code, false);
    await b!.getByRole('button', { name: 'Open your writing', exact: true }).click();
    await expect(b!.locator('.shell')).toContainText('Keep the first device writing', {
      timeout: 60000,
    });
    for (const p of [a!, b!]) {
      await lock(p);
      await p.evaluate(async () => {
        for (const registration of await navigator.serviceWorker.getRegistrations())
          await registration.unregister();
      });
    }
    const actors: Actor[] = [
      { role: 'A', joined: false, code: first.code, credentials: await credentials(first.auth) },
      { role: 'B', joined: true, code: second.code, credentials: await credentials(second.auth) },
    ];
    for (const c of contexts) await c.close();
    contexts.length = 0;
    record(join(directory, 'seed.json'), { preparedAt: new Date().toISOString(), actors });
  } finally {
    for (const c of contexts) await c.close();
    await backend.close();
  }
}

/** Open both drivers on a copy; closes everything on return. */
async function session<T>(
  dir: string,
  build: string,
  run: (a: Page, b: Page, opening: { a: number; b: number }) => Promise<T>,
): Promise<T> {
  const s = readSeed(dir),
    backend = await service(join(dir, 'service'), build),
    contexts: BrowserContext[] = [];
  try {
    for (const role of ['A', 'B']) contexts.push(await launch(join(dir, role)));
    const [a, b] = contexts.map((c) => c.pages()[0]!);
    const openA = await openDriver(a!, s.actors[0]!),
      openB = await openDriver(b!, s.actors[1]!);
    try {
      return await run(a!, b!, { a: openA, b: openB });
    } finally {
      for (const p of [a!, b!]) await p.evaluate(() => globalThis.sendCost.close()).catch(() => {});
    }
  } finally {
    for (const c of contexts) await c.close().catch(() => {});
    await backend.close();
  }
}

async function grow(root: string, build: string) {
  const targets = (process.env['SEND_COST_TARGETS'] ?? '300,1000,3000').split(',').map(Number),
    peerEvery = Number(process.env['SEND_COST_PEER_EVERY'] ?? 10),
    work = join(root, 'grow');
  if (!existsSync(work)) copy(join(root, 'seed'), work);
  const log: unknown[] = [];
  for (const target of targets) {
    const snapshot = join(root, `snap-${target}`);
    if (existsSync(snapshot)) continue;
    const reached = await session(work, build, async (a, b, opening) => {
      let n = await accepted(a);
      const began = Date.now(),
        samplesBefore = (await metrics(a)).acceptedSends.length;
      while (n < target) {
        const ms = await sendOne(a, ` a${n + 1}`);
        n = await accepted(a);
        if (n % peerEvery === 0) await sendOne(b, ` b${n}`);
        if (n % 100 === 0) {
          const m = await metrics(a);
          const recent = m.acceptedSends.slice(-20).map((s) => s.stepMs - s.networkMs);
          recent.sort((x, y) => x - y);
          log.push({ position: n, editToAcceptedMs: ms, medianLocalMs: recent[10] });
          record(join(root, 'grow-log.json'), log);
        }
      }
      await a.evaluate(() => globalThis.sendCost.durable());
      await b.evaluate(() => globalThis.sendCost.durable());
      // Let B receive A's tail so the snapshot is quiet on both devices.
      await expect
        .poll(() => b.evaluate(() => globalThis.sendCost.status().receive.phase), {
          timeout: 120000,
        })
        .toBe('idle');
      const m = await metrics(a);
      return {
        target,
        accepted: n,
        peerAccepted: await accepted(b),
        rows: { A: await rows(a), B: await rows(b) },
        opening,
        minutes: (Date.now() - began) / 60000,
        localHistory: await a.evaluate(() => globalThis.sendCost.localHistory()),
        samples: m.acceptedSends.slice(samplesBefore),
      };
    });
    copy(work, snapshot);
    record(join(snapshot, 'snapshot.json'), { ...reached, samples: undefined });
    record(join(root, `grow-samples-${target}.json`), reached.samples);
  }
}

async function reduce(root: string, build: string) {
  for (const target of (process.env['SEND_COST_SIZES'] ?? '300,1000,3000').split(',')) {
    const from = join(root, `snap-${target}`),
      to = join(root, `snap-${target}-reduced`);
    if (existsSync(to)) continue;
    const work = join(root, `work-reduce-${target}`);
    rmSync(work, { recursive: true, force: true });
    copy(from, work);
    const result = await session(work, build, async (a) => {
      const attempts: unknown[] = [];
      for (let i = 0; i < 12; i++) {
        const r = (await a.evaluate(() => globalThis.sendCost.reduce(0))) as { kind: string };
        attempts.push(r);
        if (r.kind === 'removed') break;
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
      return {
        attempts,
        localHistory: await a.evaluate(() => globalThis.sendCost.localHistory()),
        rows: await rows(a),
      };
    });
    if ((result.attempts.at(-1) as { kind: string }).kind !== 'removed')
      throw Error('Reduction did not complete: ' + JSON.stringify(result.attempts));
    copy(work, to);
    rmSync(work, { recursive: true, force: true });
    record(join(to, 'reduced.json'), result);
  }
}

async function measure(root: string, build: string) {
  const label = process.env['SEND_COST_LABEL'] ?? 'unlabelled',
    sizes = (process.env['SEND_COST_SIZES'] ?? '300,1000,3000').split(','),
    devices = (process.env['SEND_COST_DEVICES'] ?? 'unreduced,reduced').split(','),
    peers = (process.env['SEND_COST_PEERS'] ?? 'idle,typing').split(','),
    reps = Number(process.env['SEND_COST_REPS'] ?? 3),
    k = Number(process.env['SEND_COST_K'] ?? 30),
    warmup = Number(process.env['SEND_COST_WARMUP'] ?? 5);
  for (let rep = 1; rep <= reps; rep++)
    for (const device of devices)
      for (const size of sizes)
        for (const peer of peers) {
          const out = join(root, 'results', label, `${device}-${size}-${peer}-r${rep}.json`);
          if (existsSync(out)) continue;
          const from = join(root, device === 'reduced' ? `snap-${size}-reduced` : `snap-${size}`),
            work = join(root, 'work');
          rmSync(work, { recursive: true, force: true });
          copy(from, work);
          try {
            const result = await session(work, build, async (a, b, opening) => {
              let typing = true;
              const peerLoop =
                peer === 'typing'
                  ? (async () => {
                      let i = 0;
                      while (typing) {
                        await b.evaluate((t) => globalThis.sendCost.insert(t), ` p${++i}`);
                        await new Promise((resolve) => setTimeout(resolve, 1500));
                      }
                    })()
                  : Promise.resolve();
              try {
                const history0 = await a.evaluate(() => globalThis.sendCost.localHistory());
                for (let i = 0; i < warmup; i++) await sendOne(a, ` w${i}`);
                const before = await metrics(a);
                const editToAccepted: number[] = [];
                for (let i = 0; i < k; i++) editToAccepted.push(await sendOne(a, ` m${i}`));
                const after = await metrics(a);
                const history1 = await a.evaluate(() => globalThis.sendCost.localHistory());
                return {
                  label,
                  device,
                  size: Number(size),
                  peer,
                  rep,
                  opening,
                  accepted: await accepted(a),
                  editToAccepted,
                  samples: after.acceptedSends.slice(before.acceptedSends.length),
                  before,
                  after,
                  history: [history0, history1],
                };
              } finally {
                typing = false;
                await peerLoop.catch(() => {});
              }
            });
            record(out, result);
          } finally {
            rmSync(work, { recursive: true, force: true });
          }
        }
}
