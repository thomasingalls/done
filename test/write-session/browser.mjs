import { fixture } from './runtime.mjs';
const worker = new Worker(new URL('./worker.mjs', import.meta.url), { type: 'module' });
const replies = new Map();
let sequence = 0;
worker.onmessage = ({ data }) => {
  const reply = replies.get(data.id);
  replies.delete(data.id);
  if (data.error) reply.reject(Error(data.error));
  else reply.resolve(data.value);
};
window.lifecycle = {
  ...fixture(),
  worker(method, ...args) {
    const id = sequence++;
    return new Promise((resolve, reject) => {
      replies.set(id, { resolve, reject });
      worker.postMessage({ id, method, args });
    });
  },
  terminateWorker() {
    worker.terminate();
  },
};
