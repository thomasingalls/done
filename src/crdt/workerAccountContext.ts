/** Same-realm setup references, never an authority or a replacement for native verification. */
import { parseAuthorityPin, pinBytes, type AuthorityPin } from '../../account-protocol/authority';
import { hex } from './custodyCrypto';
import { NetworkLogin } from '../account/networkLogin';
import type { LocalPasskey } from './accountAccess';
import type { AccountWorkspaceOptions } from './accountWorkspace';
export type WorkerAccountComposition = Awaited<
  ReturnType<(typeof import('./accountReceive'))['openAccountWorkerReceivingWorkspace']>
>;
export interface WorkerSetupDisplay {
  actorName(): Promise<string | undefined>;
  rename(name: string): Promise<void>;
}
export interface WorkerAccountContext {
  readonly slotId: string;
  readonly pin: AuthorityPin;
  readonly joined: boolean;
  readonly code: string;
  readonly identity: AccountWorkspaceOptions['identity'];
  readonly assertPasskey: LocalPasskey;
  readonly networkLogin?: NetworkLogin;
  readonly signal: AbortSignal;
  composed(value: WorkerAccountComposition, display: WorkerSetupDisplay): void;
  /** Withdraw the UI lifetime; must not await a controller waiting on this same workspace. */
  close(): void;
}
export function holdWorkerAccountContext(input: WorkerAccountContext, freshLogin?: NetworkLogin) {
  if (typeof window !== 'undefined') throw Error('Native account context required');
  const slot = input.slotId,
    pin = hex(pinBytes(parseAuthorityPin(input.pin))),
    joined = input.joined,
    identity = JSON.stringify(structuredClone(input.identity)),
    login = input.networkLogin,
    assertPasskey = input.assertPasskey,
    signal = input.signal,
    composed = input.composed,
    close = input.close;
  let code: string | undefined = input.code,
    taken = false,
    published = false,
    closed = false;
  if (
    typeof slot !== 'string' ||
    !slot ||
    typeof code !== 'string' ||
    !code ||
    typeof joined !== 'boolean' ||
    typeof assertPasskey !== 'function' ||
    typeof composed !== 'function' ||
    typeof close !== 'function' ||
    !(signal instanceof AbortSignal) ||
    (login !== undefined && !(login instanceof NetworkLogin)) ||
    (freshLogin && freshLogin !== login)
  )
    throw Error('Native account context changed');
  const current = () => {
    signal.throwIfAborted();
    if (closed) throw Error('Native account context closed');
  };
  return Object.freeze({
    login,
    take(
      options: Pick<AccountWorkspaceOptions, 'slotId' | 'pin' | 'code' | 'identity'> & {
        joined: boolean;
        networkSessions?: boolean;
        composed?: boolean;
      },
    ) {
      current();
      if (
        taken ||
        options.slotId !== slot ||
        options.code !== code ||
        options.joined !== joined ||
        hex(pinBytes(parseAuthorityPin(options.pin))) !== pin ||
        JSON.stringify(options.identity) !== identity ||
        options.networkSessions !== true ||
        options.composed !== true
      )
        throw Error('Native account context scope changed');
      taken = true;
      code = undefined;
      return assertPasskey;
    },
    composed(value: WorkerAccountComposition, display: WorkerSetupDisplay) {
      current();
      if (!taken || published) throw Error('Native account context composition changed');
      published = true;
      composed.call(input, value, display);
      current();
    },
    close() {
      if (closed) return;
      closed = true;
      code = undefined;
      close.call(input);
    },
  });
}
