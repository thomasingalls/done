import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { Browser, Page } from '@playwright/test';

export function installDispatchProbe(options: { fault: boolean }) {
  const now = () => performance.timeOrigin + performance.now();
  const events: any[] = [], plainRows: any[] = [], beats: any[] = [], faults: any[] = [], timings: any[] = [], longtasks: any[] = [];
  const seq = { plain: 0, editor: 0, other: 0 };
  const targetOf = (el: EventTarget | null): keyof typeof seq => el instanceof Element ? el.id === 'dispatch-control' ? 'plain' : el.closest('.card') ? 'editor' : 'other' : 'other';
  let last = now(), overflow = 0;
  setInterval(() => { const at = now(); if (beats.length < 100000) beats.push({ at, previous: last, lateMs: at - last - 16 }); else overflow++; last = at; }, 16);
  for (const kind of ['keydown', 'beforeinput', 'input', 'keyup']) addEventListener(kind, (event: Event) => {
    const target = targetOf(event.target); if (target === 'other') return;
    if (kind === 'beforeinput') seq[target]++;
    const row = { kind, target, index: seq[target], at: now(), stampEpoch: performance.timeOrigin + event.timeStamp, trusted: event.isTrusted, focused: document.hasFocus(), visible: document.visibilityState, active: targetOf(document.activeElement), rafAt: 0 };
    events.push(row); if (kind === 'beforeinput') requestAnimationFrame(() => { row.rafAt = now(); });
    if (kind === 'input' && target === 'plain') plainRows.push({ at: now(), length: (event.target as HTMLTextAreaElement).value.length });
    if (kind === 'beforeinput' && target === 'plain' && options.fault && [30, 60, 90].includes(seq.plain)) {
      const at = now(); while (now() - at < 80) {} faults.push({ index: seq.plain, at, end: now() });
    }
  }, true);
  if (PerformanceObserver.supportedEntryTypes.includes('event')) new PerformanceObserver(list => {
    for (const e of list.getEntries() as PerformanceEventTiming[]) timings.push({ name: e.name, at: performance.timeOrigin + e.startTime, processingStart: performance.timeOrigin + e.processingStart, processingEnd: performance.timeOrigin + e.processingEnd, duration: e.duration, interactionId: e.interactionId });
  }).observe({ type: 'event', durationThreshold: 16, buffered: true } as any);
  if (PerformanceObserver.supportedEntryTypes.includes('longtask')) new PerformanceObserver(list => { for (const e of list.getEntries()) longtasks.push({ at: performance.timeOrigin + e.startTime, ms: e.duration }); }).observe({ type: 'longtask' });
  Object.defineProperty(window, '__dispatch', { value: {
    read: () => ({ events: structuredClone(events), plainRows: structuredClone(plainRows), beats: structuredClone(beats), faults: structuredClone(faults), timings: structuredClone(timings), longtasks: structuredClone(longtasks), overflow }),
    plain: () => { let el = document.getElementById('dispatch-control') as HTMLTextAreaElement | null; if (!el) { el = document.createElement('textarea'); el.id = 'dispatch-control'; el.setAttribute('aria-label', 'Disposable timing control'); el.style.cssText = 'position:fixed;bottom:8px;right:8px;width:240px;height:80px;z-index:2147483647;background:white;color:black'; document.body.append(el); } el.focus({ preventScroll: true }); },
    remove: () => document.getElementById('dispatch-control')?.remove(),
  } });
}
export async function browserIdentity(browser: Browser) {
  const c = await browser.newBrowserCDPSession();
  try {
    const info = await c.send('SystemInfo.getProcessInfo'); const root = info.processInfo.find(p => p.type === 'browser'); if (!root) throw Error('Browser root process unavailable');
    const executable = execFileSync('ps', ['-p', String(root.id), '-o', 'comm='], { encoding: 'utf8' }).trim();
    return { pid: root.id, executable, sha256: createHash('sha256').update(readFileSync(executable)).digest('hex'), version: await c.send('Browser.getVersion') };
  } finally { await c.detach(); }
}
export async function clockBrackets(page: Page) {
  const rows = []; for (let i = 0; i < 5; i++) { const before = Date.now(); const renderer = await page.evaluate(() => performance.timeOrigin + performance.now()); rows.push({ before, renderer, after: Date.now() }); } return rows;
}
