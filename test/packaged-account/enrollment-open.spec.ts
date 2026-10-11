import { test, expect, type Page } from '@playwright/test';
import { pairedEditors } from './devices';
import { startService, stopService } from './server';

test('a certified second device opens its writing while the first device resumes sync', async ({
  page,
  browser,
}, info) => {
  const service = await startService(info.outputPath('service'), undefined, true, true);
  let pair: Awaited<ReturnType<typeof pairedEditors>> | undefined;
  const events: { status: number; [key: string]: unknown }[] = [];
  const pending = new Set<Promise<void>>();
  const start = Date.now();
  const watch = (device: string, p: Page) =>
    p.on('response', (response) => {
      const path = new URL(response.url()).pathname;
      if (!path.startsWith('/account/') && !path.startsWith('/__account-setup/')) return;
      const row: (typeof events)[number] = {
        device,
        path,
        status: response.status(),
        ms: Date.now() - start,
      };
      events.push(row);
      if (response.status() < 400) return;
      const task = (async () => {
        try {
          const value = await response.json();
          // Keep only closed error codes, never request bodies, tokens or identifiers.
          for (const key of ['kind', 'refusal'])
            if (typeof value[key] === 'string' && /^[a-z-]{1,48}$/.test(value[key]))
              row[key] = value[key];
        } catch {
          row['bodyUnavailable'] = true;
        }
      })();
      pending.add(task);
      void task.finally(() => pending.delete(task));
    });
  watch('first', page);
  try {
    pair = await pairedEditors(page, browser, true, {
      beforeCompare: async (second) => {
        watch('second', second);
      },
    });
    await expect(pair.second.locator('.shell')).toContainText('Keep the first device writing');
  } finally {
    await Promise.all(pending);
    await info.attach('enrollment-requests', {
      body: JSON.stringify(events, null, 2),
      contentType: 'application/json',
    });
    console.log(
      'Enrollment refusals:',
      events.filter((r) => r.status >= 400),
    );
    await pair?.other.close();
    await stopService(service);
  }
});
