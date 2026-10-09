import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { fixture, registered, fresh, policy } from '../account-core/fixtures.mjs';
export { fresh, policy, registered };
export function config() {
  return {
    operatorKey: randomBytes(32),
    pin: { v: 1, ...policy, serviceId: '12'.repeat(16), authRoot: '34'.repeat(32) },
  };
}
export async function ready(t, options = {}) {
  const sessions = config();
  let now = 1000;
  const f = fixture(t, { ...options, sessions, now: options.now ?? (() => now) });
  const account = await registered(f, options.alg ?? -8);
  f.seedActive(account.result.accountId);
  return {
    f,
    config: sessions,
    account,
    get sessions() {
      return f.core.sessions;
    },
    setTime(value) {
      now = value;
    },
    begin(who = account) {
      const retryKey = fresh(),
        accountId = who.result.accountId;
      const view = f.core.sessions.begin({ retryKey, accountId });
      if (view.stage !== 'challenge') throw Error(JSON.stringify(view));
      return {
        retryKey,
        accountId,
        view,
        proof: { retryKey, attemptId: view.attemptId, response: who.key.assert(view) },
      };
    },
    mutate(fn) {
      const db = new DatabaseSync(f.path);
      try {
        return fn(db);
      } finally {
        db.close();
      }
    },
  };
}
export const renewal = (r) => ({ sessionId: r.sessionId, renewalToken: r.renewalToken });
export const revocation = (r) => ({ sessionId: r.sessionId, revokeToken: r.revokeToken });
