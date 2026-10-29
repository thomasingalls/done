const worker = new Worker(new URL('./acknowledged-worker.ts', import.meta.url), { type: 'module' });
let next = 0,
  applied: unknown;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (v: unknown) => void }>();
worker.addEventListener('message', (e) => {
  if (e.data.kind === 'apply') {
    applied = e.data.state;
    return;
  }
  const request = pending.get(e.data.id);
  if (!request) return;
  pending.delete(e.data.id);
  if (e.data.ok) request.resolve(e.data.value);
  else request.reject(Error(e.data.error));
});
function request(method: string) {
  const result = new Promise((resolve, reject) => {
    const id = ++next;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, method });
  });
  void result.catch(() => {});
  return result;
}
let finishing: Promise<unknown> | undefined, closing: Promise<unknown> | undefined;
(window as any).acknowledgedLab = {
  request,
  applied: () => applied,
  start: () => {
    finishing = request('finish');
    void finishing.catch(() => {});
  },
  finish: () => finishing,
  close: () => {
    closing = request('close');
    void closing.catch(() => {});
  },
  closed: () => closing,
};
