/** Genuine fictional three-device fixture, saved only after native owners and browsers close. */
import { chromium, expect, type BrowserContext, type Page } from '@playwright/test';
import { mkdirSync, cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';
import { account, pending, compared, unlock } from '../device-enrollment/helpers';
import {
  openSaved,
  credentials,
  restoreAuthenticator,
  type SavedCredential,
} from '../packaged-account/devices';
import { openMenuSection } from '../geometry/openApp';
import { lock, exportWriting, acceptedRows } from '../inbound-native/fixtures';
import { service } from './server.mjs';
import type {} from './driver';
export const origin = 'http://localhost:54371';
export const driverPath = '/test/inbound-continuation/driver.html';
export const initialMaster = 'A:\nB:\nC:\n';
const civilDate = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
export type Seed = {
  date: string;
  utcPreparedAt: string;
  actors: { role: string; joined: boolean; code: string; credentials: SavedCredential[] }[];
};
export function paths() {
  const root = process.env['INBOUND_CONTINUATION_ROOT'],
    build = process.env['INBOUND_CONTINUATION_BUILD'];
  if (
    !root ||
    !build ||
    !isAbsolute(root) ||
    !isAbsolute(build) ||
    !existsSync(join(build, 'index.html'))
  )
    throw Error('Expected declared native continuation fixture/build');
  return { root, build };
}
export async function launch(profile: string) {
  const context = await chromium.launchPersistentContext(profile, {
    headless: true,
    baseURL: origin,
    timezoneId: 'Europe/Paris',
    viewport: { width: 1280, height: 900 },
  });
  context.setDefaultTimeout(15000);
  context.setDefaultNavigationTimeout(15000);
  return context;
}
export async function driver(page: Page, actor: Seed['actors'][number]) {
  const auth = await restoreAuthenticator(page, actor.credentials);
  await page.goto(origin + driverPath);
  await expect.poll(() => page.evaluate(() => !!globalThis.nativeContinuation)).toBe(true);
  const opened = await page.evaluate(
    ({ code, joined }) => globalThis.nativeContinuation.open(code, joined),
    actor,
  );
  return { auth, deviceId: opened.deviceId }; // Keep the CDP session attached through cold and closure.
}
export async function closeDriver(page: Page) {
  await page.evaluate(() => globalThis.nativeContinuation.close());
}
export async function prepareSeed() {
  const { root, build } = paths(),
    directory = join(root, 'seed');
  if (existsSync(directory))
    throw Error('Seed already exists; preserve it and declare another root');
  mkdirSync(directory, { recursive: true });
  const backend = await service(join(directory, 'service'), build),
    contexts: BrowserContext[] = [];
  try {
    for (const role of ['A', 'B', 'C']) contexts.push(await launch(join(directory, role)));
    const [a, b, c] = contexts.map((context) => context.pages()[0]!);
    const first = await account(a!),
      second = await pending(b!, first.link, first.auth);
    await a!.getByLabel('Code on the new device').fill(await compared(a!, b!));
    await a!.getByRole('button', { name: 'Compare and approve', exact: true }).click();
    for (const p of [a!, b!])
      await expect(
        p.getByText('Content access is installed and certified.', { exact: false }),
      ).toBeVisible({ timeout: 30000 });
    await a!.getByRole('button', { name: 'Make writing available', exact: true }).click();
    await expect(
      a!.getByText('Your writing is available to the approved device.', { exact: false }),
    ).toBeVisible();
    await a!.getByRole('link', { name: 'Close and return to accounts' }).click();
    await a!.goto('/');
    await openSaved(a!, first.code, false);
    await b!.getByRole('button', { name: 'Open your writing', exact: true }).click();
    await expect(b!.locator('.shell')).toContainText('Keep the first device writing', {
      timeout: 15000,
    });
    await openMenuSection(b!, 'Account');
    await b!.getByRole('button', { name: 'Devices', exact: true }).click();
    await b!.getByRole('button', { name: 'Connect another device', exact: true }).click();
    await unlock(b!, second.code);
    const third = await pending(
      c!,
      await b!.getByLabel('Device invitation link').inputValue(),
      second.auth,
    );
    await b!.getByLabel('Code on the new device').fill(await compared(b!, c!));
    await b!.getByRole('button', { name: 'Compare and approve', exact: true }).click();
    await expect(c!.getByRole('button', { name: 'Open your writing', exact: true })).toBeVisible({
      timeout: 30000,
    });
    await expect(b!.getByText('The device is connected.', { exact: false })).toBeVisible({
      timeout: 30000,
    });
    await c!.getByRole('button', { name: 'Open your writing', exact: true }).click();
    await expect(c!.locator('.shell')).toContainText('Keep the first device writing', {
      timeout: 20000,
    });
    await b!.getByRole('link', { name: 'Close and return to accounts' }).click();
    await b!.goto('/');
    await openSaved(b!, second.code, true);
    const saved = [first, second, third],
      pages = [a!, b!, c!];
    const baseline = await exportWriting(a!, join(directory, 'A.zip'));
    for (const [i, p] of pages.entries()) {
      expect(await exportWriting(p, join(directory, `${i}-seed.zip`))).toEqual(baseline);
      await lock(p);
      await p.evaluate(async () => {
        for (const registration of await navigator.serviceWorker.getRegistrations())
          await registration.unregister();
      });
    }
    const actors = await Promise.all(
      saved.map(async (s, i) => ({
        role: ['A', 'B', 'C'][i]!,
        joined: i !== 0,
        code: s.code,
        credentials: await credentials(s.auth),
      })),
    );
    for (const context of contexts) await context.close();
    contexts.length = 0;
    const seed: Seed = { date: civilDate(), utcPreparedAt: new Date().toISOString(), actors };
    writeFileSync(join(directory, 'seed.json'), JSON.stringify(seed));
    writeFileSync(join(directory, 'baseline.json'), JSON.stringify(baseline));
    writeFileSync(
      join(directory, 'accepted.json'),
      JSON.stringify(acceptedRows(join(directory, 'service'))),
    );
    return {
      actors: actors.map((a) => ({ role: a.role, joined: a.joined })),
      baselinePaths: baseline.map((x) => x.path),
    };
  } finally {
    for (const context of contexts) await context.close();
    await backend.close();
  }
}
export function cloneSeed(directory: string) {
  const { root } = paths();
  const from = join(root, 'seed');
  const seed = JSON.parse(readFileSync(join(from, 'seed.json'), 'utf8')) as Seed;
  expect(seed.date).toBe(civilDate());
  if (existsSync(directory)) throw Error('History already exists; preserve it');
  mkdirSync(directory, { recursive: true });
  for (const name of ['service', 'A', 'B', 'C'])
    cpSync(join(from, name), join(directory, name), { recursive: true });
  return {
    seed,
    baseline: JSON.parse(readFileSync(join(from, 'baseline.json'), 'utf8')) as {
      path: string;
      content: string;
    }[],
  };
}
