/** Open-cost measurement harness (phase 555). Not a test: it times ordinary opens of saved devices.
 *
 * Each open goes through the packaged application exactly as a person would: the root page, the
 * setup Worker it boots, the unlock form, the passkey, the setup-to-account handoff, both Worker
 * verification passes and the Window's replay, fork and comparison, up to the first rendered frame
 * of the editor shell. Snapshots come from the send-cost harness (phase 554) and are copied, never
 * consumed: every open starts from a fresh copy of the service and of one device's profile.
 *
 * Read per open: the page-side click time and first-shell-frame time, and from the Worker realm the
 * fixed opening milestones (`__doneOpenMilestones`, with the ledger metrics captured at each) and
 * the final ledger metrics. Worker times are converted to the page clock by `timeOrigin`.
 *
 * Environment: OPEN_COST_ROOT (snapshot root), OPEN_COST_BUILD (send-cost build), OPEN_COST_OUT
 * (results directory), OPEN_COST_CASES (comma list of `<role>:<snapshot>:<online|offline>`, for
 * example `A:snap-3000:online`), OPEN_COST_REPS (default 5), OPEN_COST_LABEL, and optionally
 * OPEN_COST_AUDIT_WAIT_MS to keep each opened editor idle and time its first completed semantic
 * audit. Results stay outside the repository.
 */
import { test, expect, chromium, type Page, type Worker } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, isAbsolute, dirname } from 'node:path';
import { startDevelopmentAccountServer } from '../../../account-service/development-server.ts';
import { startAccountGateway } from '../../lib/account-gateway.mjs';
import { restoreAuthenticator, type SavedCredential } from '../../../test/packaged-account/devices';

// The snapshots' development service pins the send-cost origin, so opens reuse its port.
const port = Number(process.env['OPEN_COST_PORT'] ?? 54391);
const origin = `http://localhost:${port}`;
type Actor = { role: 'A' | 'B'; joined: boolean; code: string; credentials: SavedCredential[] };

function env() {
  const root = process.env['OPEN_COST_ROOT'],
    build = process.env['OPEN_COST_BUILD'],
    out = process.env['OPEN_COST_OUT'];
  if (!root || !build || !out || ![root, build, out].every((p) => isAbsolute(p)))
    throw Error('Declare absolute OPEN_COST_ROOT, OPEN_COST_BUILD and OPEN_COST_OUT');
  if (!existsSync(join(build, 'index.html'))) throw Error('Build lacks the application');
  return { root, build, out };
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
/** Other timed runs on this host (Vitest or Playwright outside this harness), from `pgrep`. */
function foreignRuns() {
  try {
    return execFileSync('pgrep', ['-fl', 'vitest|playwright test'], {
      encoding: 'utf8',
      timeout: 5000,
    })
      .split('\n')
      .filter((line) => line.trim() && !line.includes('open-cost'))
      .map((line) => line.slice(0, 120));
  } catch {
    return []; // pgrep exits 1 when nothing matches.
  }
}
/** With OPEN_COST_QUIET=1, wait (bounded) until no other timed run is active. */
async function quiet() {
  if (process.env['OPEN_COST_QUIET'] !== '1') return { waitedMs: 0, before: foreignRuns() };
  const began = Date.now();
  while (Date.now() - began < 15 * 60 * 1000) {
    const runs = foreignRuns();
    if (!runs.length) return { waitedMs: Date.now() - began, before: [] as string[] };
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  return { waitedMs: Date.now() - began, before: foreignRuns() };
}
type Milestone = { at: number; metrics: Record<string, unknown> };
/** The Worker that ran the opening: the one whose milestones include `authorized`. */
async function openingRealm(page: Page) {
  const found: { worker: Worker; timeOrigin: number; milestones: Record<string, Milestone> }[] = [];
  for (const worker of page.workers()) {
    const read = await worker
      .evaluate(() => {
        const g = globalThis as unknown as { __doneOpenMilestones?: () => unknown };
        return g.__doneOpenMilestones
          ? { timeOrigin: performance.timeOrigin, milestones: g.__doneOpenMilestones() }
          : null;
      })
      .catch(() => null);
    if (read && (read.milestones as Record<string, unknown>)['authorized'])
      found.push({
        worker,
        ...(read as { timeOrigin: number; milestones: Record<string, Milestone> }),
      });
  }
  if (found.length !== 1) throw Error('Expected one opening Worker, found ' + found.length);
  return found[0]!;
}
/** Optional sampling profile of one dedicated Worker, through the page's own CDP session. Returns
 * the profile and an estimate of its clock against the Worker's `performance.now()`. */
async function profileWorker(page: Page, worker: Worker) {
  const cdp = await page.context().newCDPSession(page);
  const attached = new Map<string, string>();
  cdp.on('Target.attachedToTarget', (e) => {
    if (e.targetInfo.type === 'worker') attached.set(e.targetInfo.url, e.sessionId);
  });
  await cdp.send('Target.setAutoAttach', {
    autoAttach: true,
    waitForDebuggerOnStart: false,
    flatten: false,
  });
  await expect.poll(() => attached.has(worker.url()), { timeout: 10000 }).toBe(true);
  const sessionId = attached.get(worker.url())!;
  let id = 0;
  const pending = new Map<number, { resolve(v: unknown): void; reject(e: unknown): void }>();
  cdp.on('Target.receivedMessageFromTarget', (e) => {
    if (e.sessionId !== sessionId) return;
    const v = JSON.parse(e.message) as { id?: number; result?: unknown; error?: unknown };
    const p = v.id === undefined ? undefined : pending.get(v.id);
    if (!p) return;
    pending.delete(v.id!);
    if (v.error) p.reject(Error(JSON.stringify(v.error)));
    else p.resolve(v.result);
  });
  const send = (method: string, params: object = {}) =>
    new Promise<unknown>((resolve, reject) => {
      const n = ++id;
      const timer = setTimeout(() => {
        pending.delete(n);
        reject(Error('Worker profiler deadline: ' + method));
      }, 30000);
      pending.set(n, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      void cdp
        .send('Target.sendMessageToTarget', {
          sessionId,
          message: JSON.stringify({ id: n, method, params }),
        })
        .catch(reject);
    });
  await send('Profiler.enable');
  await send('Profiler.setSamplingInterval', { interval: 500 });
  const before = await worker.evaluate(() => performance.now());
  await send('Profiler.start');
  const after = await worker.evaluate(() => performance.now());
  return {
    async stop() {
      const result = (await send('Profiler.stop')) as { profile: { startTime: number } };
      await cdp.detach().catch(() => {});
      return { profile: result.profile, startedWorkerNow: { before, after } };
    },
  };
}
const workerMetrics = (worker: Worker) =>
  worker.evaluate(() => {
    const g = globalThis as unknown as { __doneLedgerMetrics?: () => unknown };
    if (!g.__doneLedgerMetrics) throw Error('Unprofiled build');
    return g.__doneLedgerMetrics();
  }) as Promise<Record<string, unknown>>;

async function openOnce(
  root: string,
  build: string,
  out: string,
  label: string,
  role: 'A' | 'B',
  snapshot: string,
  network: 'online' | 'offline',
  rep: number,
) {
  const file = join(out, label, `${role}-${snapshot}-${network}-r${rep}.json`);
  if (existsSync(file)) return;
  const host = await quiet();
  const from = join(root, snapshot),
    work = join(out, 'work');
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  for (const name of ['service', role, 'seed.json'])
    cpSync(join(from, name), join(work, name), { recursive: true });
  const actor = (
    JSON.parse(readFileSync(join(work, 'seed.json'), 'utf8')) as { actors: Actor[] }
  ).actors.find((a) => a.role === role)!;
  const backend = await service(join(work, 'service'), build);
  const context = await chromium.launchPersistentContext(join(work, role), {
    headless: true,
    baseURL: origin,
    timezoneId: 'Europe/Paris',
    viewport: { width: 1280, height: 900 },
  });
  try {
    context.setDefaultTimeout(60000);
    const page = context.pages()[0] ?? (await context.newPage());
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await restoreAuthenticator(page, actor.credentials);
    // A returning device's page is controlled by the packaged service worker (also needed offline).
    await page.goto('/');
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    await page.reload();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, undefined, {
      timeout: 30000,
    });
    const codeEntry = page.getByLabel('Unlock code', { exact: true });
    const saved = page.getByRole('button', {
      name: actor.joined ? /Resume device connection/ : /^Unlock Device owner/,
    });
    await expect
      .poll(async () => (await codeEntry.isVisible()) || (await saved.isVisible()), {
        timeout: 60000,
      })
      .toBe(true);
    if (!(await codeEntry.isVisible())) await saved.click();
    await expect(codeEntry).toBeVisible();
    await codeEntry.fill(actor.code);
    const formReadyMs = await page.evaluate(() => performance.now());
    if (network === 'offline') await context.setOffline(true);
    await expect(page.locator('.shell')).toHaveCount(0);
    await page.evaluate(() => {
      const g = globalThis as unknown as { __openShellFrame?: number };
      g.__openShellFrame = undefined;
      const observer = new MutationObserver(() => {
        const shell = document.querySelector('.shell');
        if (!shell?.getClientRects().length) return;
        observer.disconnect();
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            g.__openShellFrame = performance.now();
          }),
        );
      });
      observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    });
    const button = actor.joined
      ? page.getByRole('button', { name: /^(Unlock enrollment|Unlock and get invitation)$/ })
      : page.getByRole('button', { name: 'Confirm code and unlock with passkey' });
    const workersAtClick = page.workers().map((w) => new URL(w.url()).pathname);
    const profiler =
      process.env['OPEN_COST_PROFILE'] === '1'
        ? await (async () => {
            if (page.workers().length !== 1)
              throw Error('Profile needs exactly one Worker at click');
            return profileWorker(page, page.workers()[0]!);
          })()
        : undefined;
    const clickAt = await page.evaluate(() => performance.now());
    await button.click();
    await page.locator('.shell').waitFor({ state: 'visible', timeout: 120000 });
    await page.waitForFunction(
      () => typeof (globalThis as { __openShellFrame?: number }).__openShellFrame === 'number',
      undefined,
      { timeout: 30000 },
    );
    const pageRead = await page.evaluate(() => ({
      timeOrigin: performance.timeOrigin,
      frameAt: (globalThis as { __openShellFrame?: number }).__openShellFrame!,
    }));
    const runsAfterFrame = foreignRuns();
    const profiled = await profiler?.stop();
    const realm = await openingRealm(page);
    if (profiled) {
      mkdirSync(join(out, label), { recursive: true });
      writeFileSync(
        join(out, label, `${role}-${snapshot}-${network}-r${rep}.cpuprofile.json`),
        JSON.stringify({
          ...profiled,
          milestones: Object.fromEntries(
            Object.entries(realm.milestones).map(([name, m]) => [name, m.at]),
          ),
        }),
      );
    }
    const toPage = (at: number) => realm.timeOrigin + at - pageRead.timeOrigin;
    const milestones = Object.fromEntries(
      Object.entries(realm.milestones).map(([name, m]) => [
        name,
        { atPage: toPage(m.at) - clickAt, metrics: m.metrics },
      ]),
    );
    const final = await workerMetrics(realm.worker);
    let audit: unknown;
    const auditWait = Number(process.env['OPEN_COST_AUDIT_WAIT_MS'] ?? 0);
    if (auditWait > 0) {
      const editorAt = (milestones['editor'] as { atPage: number } | undefined)?.atPage;
      const samples: { sincePageClickMs: number; audits: number; completions: number }[] = [];
      const deadline = Date.now() + auditWait;
      let completedAt: number | undefined;
      while (Date.now() < deadline) {
        const m = await workerMetrics(realm.worker);
        const now = (await page.evaluate(() => performance.now())) - clickAt;
        const sample = {
          sincePageClickMs: now,
          audits: m['audits'] as number,
          completions: m['auditCompletions'] as number,
        };
        samples.push(sample);
        if (sample.completions > 0) {
          completedAt = now;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      audit = {
        waitedMs: auditWait,
        editorAtMs: editorAt,
        firstCompletionAfterClickMs: completedAt,
        firstCompletionAfterEditorMs:
          completedAt !== undefined && editorAt !== undefined ? completedAt - editorAt : undefined,
        samples: samples.filter((_, i) => i % 15 === 0 || i === samples.length - 1),
        metrics: await workerMetrics(realm.worker),
      };
    }
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(
      file,
      JSON.stringify(
        {
          label,
          role,
          snapshot,
          network,
          rep,
          formReadyAfterNavigationMs: formReadyMs,
          clickToFrameMs: pageRead.frameAt - clickAt,
          workersAtClick,
          openingWorker: new URL(realm.worker.url()).pathname,
          profiled: !!profiled,
          host: { ...host, afterFrame: runsAfterFrame },
          milestones,
          final,
          audit,
          errors,
        },
        null,
        1,
      ),
    );
  } finally {
    await context.close().catch(() => {});
    await backend.close();
    rmSync(work, { recursive: true, force: true });
  }
}

test.setTimeout(Number(process.env['OPEN_COST_TIMEOUT_MS'] ?? 3 * 60 * 60 * 1000));
test('open-cost step', async () => {
  const { root, build, out } = env(),
    label = process.env['OPEN_COST_LABEL'] ?? 'unlabelled',
    reps = Number(process.env['OPEN_COST_REPS'] ?? 5),
    cases = (process.env['OPEN_COST_CASES'] ?? 'A:snap-3000:online').split(',').map((c) => {
      const [role, snapshot, network] = c.split(':');
      if (
        (role !== 'A' && role !== 'B') ||
        !snapshot ||
        (network !== 'online' && network !== 'offline')
      )
        throw Error('Case must be <A|B>:<snapshot>:<online|offline>: ' + c);
      return { role, snapshot, network } as const;
    });
  // Interleave cases within each repetition so host drift spreads across all of them.
  for (let rep = 1; rep <= reps; rep++)
    for (const c of cases)
      await openOnce(root, build, out, label, c.role, c.snapshot, c.network, rep);
});
