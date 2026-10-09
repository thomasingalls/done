// @vitest-environment node
import { mkdtemp, mkdir, writeFile, readFile, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { precacheServiceWorker } from './precacheServiceWorker';

it('versions final HTML and public bytes even when their filenames and JavaScript stay fixed', async () => {
  const root = await mkdtemp(join(tmpdir(), 'done-precache-'));
  try {
    await mkdir(join(root, 'assets'));
    const html = '<!doctype html><script type="module" src="/assets/main.js"></script>';
    await writeFile(join(root, 'index.html'), html);
    await writeFile(join(root, 'local.html'), html);
    await writeFile(join(root, 'assets', 'main.js'), 'document.body.dataset.ready = "yes";');
    await writeFile(join(root, 'icon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    await writeFile(join(root, 'manifest.webmanifest'), '{"name":"first"}');
    const hook = precacheServiceWorker().writeBundle!;
    const write = typeof hook === 'function' ? hook : hook.handler;
    const run = async () => {
      // Exercise fixed-name content changes against known final files; the native packaged
      // campaign separately checks that the real build invokes this after Vite removes chunks.
      await Reflect.apply(write, {}, [{ dir: root }, {}]);
      const worker = await readFile(join(root, 'sw.js'), 'utf8');
      const entries = JSON.parse(
        worker.match(/const PRECACHE = ([\s\S]*?);\nconst URLS/)![1]!,
      ) as string[];
      for (const path of entries)
        await access(join(root, path === '/' ? 'index.html' : path.slice(1)));
      expect(entries).toEqual([
        '/',
        '/assets/main.js',
        '/icon.svg',
        '/index.html',
        '/local.html',
        '/manifest.webmanifest',
      ]);
      expect(entries).not.toContain('/sw.js');
      return { entries, version: worker.match(/const VERSION = "([^"]+)"/)![1] };
    };
    const before = await run();
    await writeFile(join(root, 'manifest.webmanifest'), '{"name":"second"}');
    const changedPublic = await run();
    expect(changedPublic.entries).toEqual(before.entries);
    expect(changedPublic.version).not.toBe(before.version);
    await writeFile(
      join(root, 'index.html'),
      html.replace('<script', '<title>Updated</title><script'),
    );
    const changedHtml = await run();
    expect(changedHtml.entries).toEqual(before.entries);
    expect(changedHtml.version).not.toBe(changedPublic.version);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
