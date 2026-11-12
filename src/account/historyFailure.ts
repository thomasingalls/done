/** Why a history maintenance command did not finish, as a closed list (phase 551). The history
 * view turns each code into a sentence. A service reply is unsigned, so its reason may choose a
 * code, and so a sentence and whether to retry, and nothing else: no saved progress, cursor,
 * catalog or saved snapshot classification ever depends on it. */
import {
  GrantDenied,
  NetworkAuthorityChanged,
  NetworkLoginUnavailable,
  NetworkSignInRequired,
  NetworkThrottled,
} from './scopedTransport';
import { HistoryReceivePending } from '../crdt/historyReceiveFence';
import type { LoginProblem } from './networkLogin';
import { isHistoryFailureCode, type HistoryFailureCode } from './historyFailureCodes';

export {
  HISTORY_ROUTE_REFUSALS,
  HISTORY_FAILURES,
  isHistoryFailureCode,
  type HistoryFailureCode,
} from './historyFailureCodes';

/** One of this device's own refusals. The message stays for diagnostics; the code is shown. */
export class HistoryRefusal extends Error {
  readonly code: HistoryFailureCode;
  constructor(code: HistoryFailureCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.code = code;
  }
}

/** An authorization refusal's reason, after the scoped transport's own retries. */
export function grantFailure(reason: string): HistoryFailureCode {
  switch (reason) {
    case 'capacity':
      return 'history-capacity';
    case 'storage-unavailable':
      return 'history-storage-unavailable';
    case 'malformed':
      return 'history-malformed';
    case 'wrong-account':
    case 'insufficient-scope':
    case 'invalid-proof':
    case 'grant-required':
    case 'access-required':
      return 'history-access-refused';
    default:
      return 'history-refused';
  }
}
/** The network login has no access and is not asking for a passkey: say why it is disconnected. */
export function loginFailure(problem: LoginProblem | undefined): HistoryFailureCode {
  switch (problem) {
    case 'unreachable':
      return 'history-unreachable';
    case 'busy':
      return 'history-capacity';
    case 'unavailable':
      return 'history-storage-unavailable';
    case 'outdated':
      return 'history-malformed';
    case 'refused':
      return 'history-refused';
    default:
      return 'history-sync-disconnected';
  }
}

/** The code for any failure of a history command, or undefined when nothing names one. */
export function namedHistoryFailure(cause: unknown): HistoryFailureCode | undefined {
  const own =
    cause && typeof cause === 'object'
      ? Object.getOwnPropertyDescriptor(cause, 'code')?.value
      : undefined;
  if (isHistoryFailureCode(own)) return own;
  if (cause instanceof NetworkSignInRequired) return 'history-sign-in-required';
  if (cause instanceof NetworkAuthorityChanged) return 'history-authority-changed';
  if (cause instanceof NetworkThrottled) return 'history-capacity';
  if (cause instanceof GrantDenied) return grantFailure(cause.reason);
  if (cause instanceof NetworkLoginUnavailable) return loginFailure(cause.problem);
  if (cause instanceof HistoryReceivePending) return 'history-receive-pending';
  return undefined;
}

/** The error a page-requested history command ends with: the same failure, with its code. Only the
 * explicit command path wraps; automatic maintenance keeps the original error and its retry rule. */
export function historyCommandFailure(cause: unknown): HistoryRefusal {
  return new HistoryRefusal(
    namedHistoryFailure(cause) ?? 'history-failed',
    cause instanceof Error ? cause.message : 'History maintenance failed',
    { cause },
  );
}
