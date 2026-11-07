import { expect, type Page, type Worker } from '@playwright/test';

/** Test-only faults in the realm that owns IndexedDB. Never imported by an app entry. */
const owners = new WeakMap<Page, Worker>();
const localWorker = (page: Page, name: 'localOwner' | 'localStartup') => {
  const pattern = new RegExp(`/${name}\\.worker(?:\\.ts|-[A-Za-z0-9_-]+\\.js)$`);
  const workers = page.workers().filter((worker) => pattern.test(new URL(worker.url()).pathname));
  expect(workers, `one actual ${name} Worker must receive the fault`).toHaveLength(1);
  return workers[0]!;
};

export async function refuseNativeContent(page: Page) {
  const worker = localWorker(page, 'localOwner');
  await worker.evaluate(() => {
    const fault = { enabled: true, attempts: 0, aborts: 0 };
    Object.assign(globalThis, { __doneTestContentFault: fault });
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (value, key) {
      const request = add.call(this, value, key);
      if (fault.enabled && this.name === 'content') {
        fault.attempts++;
        this.transaction.addEventListener('abort', () => fault.aborts++, { once: true });
        request.addEventListener('success', () => this.transaction.abort(), { once: true });
      }
      return request;
    };
  });
  owners.set(page, worker);
}

export async function allowNativeContent(page: Page) {
  const worker = owners.get(page);
  expect(worker, 'storage fault must have been installed on the native owner').toBeDefined();
  const seen = await worker!.evaluate(() => {
    const fault = (
      globalThis as typeof globalThis & {
        __doneTestContentFault: { enabled: boolean; attempts: number; aborts: number };
      }
    ).__doneTestContentFault;
    fault.enabled = false;
    return { attempts: fault.attempts, aborts: fault.aborts };
  });
  expect(seen.aborts, 'observe an actual Worker IndexedDB transaction abort').toBeGreaterThan(0);
  owners.delete(page);
  return seen.attempts;
}

export async function refuseNativeGenesisContent(page: Page) {
  const worker = localWorker(page, 'localStartup');
  await worker.evaluate(() => {
    const fault = { aborted: false };
    Object.assign(globalThis, { __doneTestGenesisFault: fault });
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, key) {
      const request = put.call(this, value, key);
      if (
        this.name === 'entries' &&
        Array.isArray(key) &&
        key[1] === 'local-genesis-v1' &&
        value.stage === 'content'
      ) {
        this.transaction.addEventListener('abort', () => (fault.aborted = true), { once: true });
        request.addEventListener('success', () => this.transaction.abort(), { once: true });
      }
      return request;
    };
  });
  return async () => {
    const observed = await worker.evaluate(
      () =>
        (globalThis as typeof globalThis & { __doneTestGenesisFault: { aborted: boolean } })
          .__doneTestGenesisFault.aborted,
    );
    // Retain the old Window assertion, now backed by observation of the actual native abort.
    await page.evaluate(
      (value) => Object.assign(window, { startupAbortObserved: value }),
      observed,
    );
  };
}
