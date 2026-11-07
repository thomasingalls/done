/** Shared native-only regression helpers; never imported by an app entry. */
import { expect, type Page } from '@playwright/test';
import assert from 'node:assert/strict';
import { build } from 'vite';
import { resolve, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'node:child_process';
import { openMenuSection } from '../geometry/openApp';
import { decodePositionResponse } from '../../account-protocol/positionDecision';
import { decodeSubmission } from '../../account-protocol/submission';
import { decodeNetworkEnvelope } from '../../account-protocol/envelope';
export function acceptedRows(state: string) {
  const db = new DatabaseSync(join(state, 'account.sqlite'), { readOnly: true });
  try {
    return db
      .prepare(
        "SELECT submission,response FROM delivery_decisions WHERE kind='accepted' UNION ALL SELECT submission,response FROM publisher_decisions WHERE kind='accepted'",
      )
      .all()
      .map((row) => {
        const envelope = decodeNetworkEnvelope(
            decodeSubmission(new Uint8Array(row['submission'] as Uint8Array)).envelope,
          ),
          decision = decodePositionResponse(new Uint8Array(row['response'] as Uint8Array));
        assert.equal(decision.kind, 'accepted');
        if (decision.kind !== 'accepted') throw Error('Expected committed acceptance');
        assert.equal(decision.head.credential, envelope.credential_id);
        assert.equal(decision.head.position, envelope.seq);
        assert.equal(decision.leaf.digest, Buffer.from(envelope.digest).toString('hex'));
        return {
          publisher: envelope.credential_id,
          position: envelope.seq,
          key: envelope.credential_id + '/' + envelope.seq + '/' + decision.leaf.digest,
        };
      });
  } finally {
    db.close();
  }
}
let probe: Promise<string> | undefined;
export function observer() {
  return (probe ??= (async () => {
    const output = await build({
      configFile: false,
      logLevel: 'error',
      build: {
        write: false,
        minify: false,
        rollupOptions: { output: { codeSplitting: false } },
        lib: {
          entry: resolve('test/inbound-native/inspect.ts'),
          name: 'NativeReceiptObserver',
          formats: ['iife'],
        },
      },
    });
    const result = Array.isArray(output) ? output[0]! : output;
    if (!('output' in result)) throw Error('Unexpected observer watch build');
    const chunks = result.output.filter((x) => x.type === 'chunk');
    if (chunks.length !== 1) throw Error('Observer must be one isolated script');
    return chunks[0]!.code + '\nglobalThis.nativeReceiptObserver=NativeReceiptObserver;';
  })());
}
export async function exportWriting(page: Page, path: string) {
  await openMenuSection(page, 'Data');
  const result = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export markdown', exact: true }).click();
  await (await result).saveAs(path);
  return JSON.parse(
    execFileSync('python3', ['scripts/legacy-export/unzip.py', path], { encoding: 'utf8' }),
  ) as { path: string; content: string }[];
}
export async function lock(page: Page) {
  await openMenuSection(page, 'Account');
  await page.getByRole('button', { name: 'Lock workspace', exact: true }).click();
  await expect(page.locator('.shell')).toHaveCount(0);
}
export async function position(page: Page) {
  await openMenuSection(page, 'Sync');
  const text = await page
    .locator('.sync-details')
    .getByText(/^Accepted position: \d+$/)
    .textContent();
  return Number(text!.match(/\d+$/)![0]);
}
export async function idle(page: Page) {
  await openMenuSection(page, 'Sync');
  await expect(
    page.locator('.sync-details').getByText('Sending: idle', { exact: true }),
  ).toBeVisible({ timeout: 20000 });
}
export async function slot(page: Page, joined: boolean) {
  return page.evaluate(async (joined) => {
    const db = await new Promise<IDBDatabase>((accept, reject) => {
      const q = indexedDB.open('done.custody');
      q.onupgradeneeded = () => {
        q.transaction!.abort();
        reject(Error('Expected custody'));
      };
      q.onerror = () => reject(q.error);
      q.onsuccess = () => accept(q.result);
    });
    try {
      const rows = await new Promise<Record<string, unknown>[]>((accept, reject) => {
        const tx = db.transaction('entries', 'readonly'),
          q = tx.objectStore('entries').getAll();
        tx.oncomplete = () => accept(q.result);
        tx.onabort = () => reject(tx.error);
      });
      const found = rows.filter(
        (x) => x['kind'] === (joined ? 'certified-account-device' : 'local-promotion'),
      );
      if (found.length !== 1) throw Error('Expected one real account marker');
      const m = found[0]!;
      return {
        slotId: joined ? String(m['slotId']) : (m['source'] as { slotId: string }).slotId,
        floor: m['inboundReceiptVersion'],
      };
    } finally {
      db.close();
    }
  }, joined);
}
