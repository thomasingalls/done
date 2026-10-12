import type { Page, CDPSession } from '@playwright/test';

export async function installRecorder(page: Page, selector: string) {
  return page.evaluate(selector => {
    const element = document.querySelector(selector)!;
    const view = (window as any).__perfEditors?.find((v: any) => v.contentDOM === element);
    const length = () => view ? view.state.doc.length : element.textContent!.length;
    const initial = length(), samples: any[] = [], tasks: any[] = [];
    (globalThis as any).__textHandlers = [];
    (globalThis as any).__warmWork = [];
    (globalThis as any).__textWork = [];
    (globalThis as any).__stalls?.reset();
    (globalThis as any).__authorityIO?.reset();
    addEventListener('keydown', e => {
      if (e.key !== 'x') return;
      const row: any = { at:performance.now(), eventAt:e.timeStamp, frame:null, inputFrame:null };
      row.dispatchMs = row.at - row.eventAt;
      samples.push(row);
      const expected = initial + samples.length;
      const visible = () => {
        if (length() >= expected && (element.textContent ?? '').endsWith('x')) {
          row.visibleAt = performance.now();
          row.frame = row.visibleAt - row.at;
          row.inputFrame = row.visibleAt - row.eventAt;
          setTimeout(() => { row.afterFrame = performance.now() - row.eventAt; }, 0);
        } else requestAnimationFrame(visible);
      };
      requestAnimationFrame(visible);
    }, true);
    new PerformanceObserver(list => {
      for (const e of list.getEntries()) tasks.push({at:e.startTime,ms:e.duration});
    }).observe({type:'longtask'});
    (window as any).__typing = () => ({timeOrigin:performance.timeOrigin,
      samples,tasks,stalls:(globalThis as any).__stalls?.read(),
      authorityIO:(globalThis as any).__authorityIO?.read(),
      handlers:[...(globalThis as any).__textHandlers], work:[...(globalThis as any).__warmWork],
      textWork:[...(globalThis as any).__textWork],visibility:document.visibilityState});
    return {timeOrigin:performance.timeOrigin, now:Date.now()};
  }, selector);
}

/** Independent of renderer completion. Bound outstanding work; never silently slow the cadence. */
export async function typeAtCadence(cdp: CDPSession, count: number, gap = 150) {
  const start = performance.now(), rows: any[] = [], pending = new Set<Promise<void>>();
  let failure: unknown;
  for (let i=0; i<count; i++) {
    const due = start + i * gap;
    await new Promise(resolve => setTimeout(resolve, Math.max(0, due - performance.now())));
    if (failure) throw failure;
    if (pending.size >= 64) throw Error('Input recorder outstanding command bound exceeded');
    const row: any = {i, due, sent:performance.now(), epoch:Date.now()};
    rows.push(row);
    const command = {key:'x',code:'KeyX',windowsVirtualKeyCode:88,nativeVirtualKeyCode:88,
      timestamp:row.epoch/1000};
    // CDP command ordering is retained, but sending the next key does not wait on this key's ack.
    const sent = Promise.all([
      cdp.send('Input.dispatchKeyEvent',{...command,type:'keyDown',text:'x',unmodifiedText:'x'}),
      cdp.send('Input.dispatchKeyEvent',{...command,type:'keyUp'}),
    ]).then(() => { row.completed=performance.now(); }, error => { failure=error; row.error=String(error); });
    pending.add(sent);
    void sent.finally(() => pending.delete(sent));
  }
  await Promise.all(pending);
  if (failure) throw failure;
  return rows;
}
