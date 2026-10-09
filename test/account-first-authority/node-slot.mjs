// Preserve the browser source unchanged; resolve its one extensionless TS import for Node probes.
import { registerHooks } from 'node:module';
const url = new URL('../../src/account/slotUnlock.ts', import.meta.url).href;
const hook = registerHooks({
  resolve(specifier, context, next) {
    return next(
      context.parentURL === url && specifier === './es256Signature'
        ? new URL('./es256Signature.ts', url).href
        : specifier,
      context,
    );
  },
});
let slot;
try {
  slot = await import(url);
} finally {
  hook.deregister();
}
export const { slotBindingMessage, slotUnlockChallenge, verifySlotUnlock } = slot;
