/** Same-realm references only. Original private WeakMaps still authenticate/consume each approval. */
import { parseAuthorityPin, pinBytes, type AuthorityPin } from '../../account-protocol/authority';
import { hex } from './custodyCrypto';
import { NetworkLogin } from '../account/networkLogin';
import type { PromotionOpening } from '../account/promotionOpening';
import type { RecoveryOpening } from '../account/recoveryOpening';
export interface WorkerCeremonyOpening {
  readonly slotId: string;
  readonly pin: AuthorityPin;
  readonly promotionOpening?: PromotionOpening;
  readonly recoveryOpening?: RecoveryOpening;
  readonly networkLogin?: NetworkLogin;
  /** Retire the ORIGINAL approval lifetime; no new authority can be created by this callback. */
  close(): void | Promise<void>;
}
export function holdWorkerCeremonyOpening(input: WorkerCeremonyOpening) {
  if (typeof window !== 'undefined') throw Error('Native ceremony opening required');
  const slot = input.slotId,
    pin = parseAuthorityPin(input.pin),
    promotion = input.promotionOpening,
    recovery = input.recoveryOpening,
    login = input.networkLogin,
    close = input.close;
  if (
    typeof slot !== 'string' ||
    !slot ||
    typeof close !== 'function' ||
    !!promotion === !!recovery ||
    (login !== undefined && !(login instanceof NetworkLogin))
  )
    throw Error('Native ceremony opening changed');
  let taken = false,
    closing: Promise<void> | undefined;
  return Object.freeze({
    get login() {
      return login;
    },
    take(options: {
      slotId: string;
      pin: AuthorityPin;
      joined: boolean;
      networkSessions?: boolean;
    }) {
      if (
        taken ||
        closing ||
        options.slotId !== slot ||
        hex(pinBytes(parseAuthorityPin(options.pin))) !== hex(pinBytes(pin)) ||
        options.joined !== !!recovery ||
        (login && options.networkSessions !== true)
      )
        throw Error('Native ceremony opening scope changed');
      taken = true;
      return Object.freeze({
        ...(promotion ? { promotionOpening: promotion } : {}),
        ...(recovery ? { recoveryOpening: recovery } : {}),
      });
    },
    close() {
      if (closing) return closing;
      let resolve!: () => void, reject!: (cause: unknown) => void;
      closing = new Promise<void>((yes, no) => {
        resolve = yes;
        reject = no;
      });
      try {
        Promise.resolve(close.call(input)).then(resolve, reject);
      } catch (cause) {
        reject(cause);
      }
      return closing;
    },
  });
}
