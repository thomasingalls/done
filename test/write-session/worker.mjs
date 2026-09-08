import { fixture } from './runtime.mjs';
const lifecycle = fixture();
self.onmessage = async ({ data: { id, method, args } }) => {
  try {
    self.postMessage({ id, value: await lifecycle[method](...args) });
  } catch (error) {
    self.postMessage({ id, error: error.message });
  }
};
