/** Terminal presentation after native drain. The native member barrier remains the release proof. */
import { isAccountId } from '../account/accountIdentity';
import {
  getAccountTransitionNotice,
  accountTransitionKind,
  isAccountTransition,
  type AccountTransition,
} from '../account/accountTransitionNotice';
export interface AccountWorkerClosed {
  readonly v: 1;
  readonly kind: 'accountClosed';
  readonly owner: string;
  readonly ok: boolean;
  readonly notice: Readonly<{ accountId: string; kind: AccountTransition }> | null;
}
const fail = () => Error('Worker terminal message changed');
function fields(v: unknown, required: readonly string[], optional: readonly string[] = []) {
  if (!v || typeof v !== 'object' || Object.getPrototypeOf(v) !== Object.prototype) throw fail();
  const d = Object.getOwnPropertyDescriptors(v);
  if (
    Reflect.ownKeys(v).some(
      (k) =>
        typeof k !== 'string' || ![...required, ...optional].includes(k) || !('value' in d[k]!),
    ) ||
    required.some((k) => !Object.hasOwn(d, k))
  )
    throw fail();
}
export function accountWorkerClosed(
  owner: string,
  ok: boolean,
  accountId: string | undefined,
): AccountWorkerClosed {
  const notice = getAccountTransitionNotice();
  const kind =
    notice && notice.accountId === accountId ? accountTransitionKind(notice.message) : undefined;
  return captureAccountWorkerClosed(
    {
      v: 1,
      kind: 'accountClosed',
      owner,
      ok,
      notice: kind && isAccountId(accountId) ? { accountId, kind } : null,
    },
    owner,
  );
}
export function captureAccountWorkerClosed(
  input: unknown,
  owner: string,
  expectedAccountId?: string,
): AccountWorkerClosed {
  fields(input, ['v', 'kind', 'owner', 'ok'], ['notice']);
  const v = input as AccountWorkerClosed;
  if (
    v.v !== 1 ||
    v.kind !== 'accountClosed' ||
    v.owner !== owner ||
    !/^[a-f0-9]{32}$/.test(v.owner) ||
    typeof v.ok !== 'boolean'
  )
    throw fail();
  let notice: AccountWorkerClosed['notice'] = null;
  // Earlier v1 Workers have no terminal notice. Their native release barrier is still mandatory.
  if (Object.hasOwn(v, 'notice') && v.notice !== null) {
    try {
      fields(v.notice, ['accountId', 'kind']);
      if (
        isAccountId(v.notice.accountId) &&
        isAccountTransition(v.notice.kind) &&
        (expectedAccountId === undefined || v.notice.accountId === expectedAccountId)
      )
        notice = Object.freeze({ ...v.notice });
    } catch {
      /* A presentation refusal cannot replace the native cleanup acknowledgment. */
    }
  }
  return Object.freeze({ v: 1, kind: 'accountClosed', owner: v.owner, ok: v.ok, notice });
}

/** Bind only to the actual dedicated Worker's message event, never a global Window message. */
export function createAccountWorkerTerminalReceiver(config: {
  owner: string;
  accountId(): string | undefined;
  complete(ok: boolean): void;
  retire(): void;
  present(notice: NonNullable<AccountWorkerClosed['notice']>): void;
}) {
  let seen = false;
  return (input: unknown) => {
    if (!input || typeof input !== 'object') return false;
    const kind = Object.getOwnPropertyDescriptor(input, 'kind'),
      owner = Object.getOwnPropertyDescriptor(input, 'owner');
    if (kind?.value !== 'accountClosed' || owner?.value !== config.owner || seen) return false;
    seen = true;
    let outcome: AccountWorkerClosed;
    try {
      outcome = captureAccountWorkerClosed(input, config.owner, config.accountId());
    } catch {
      config.complete(false);
      config.retire();
      return true;
    }
    config.complete(outcome.ok);
    config.retire();
    if (outcome.notice) config.present(outcome.notice);
    return true;
  };
}
