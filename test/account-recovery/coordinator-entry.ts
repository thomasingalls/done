import {
  beginLostDeviceRecovery,
  resumeLostDeviceRecovery,
  finishLostDeviceRecovery,
  openRecoveredWorkspace,
  type RecoveryTransport,
} from '../../src/account/lostDeviceRecovery';
import type { SetupConfig } from '../../src/account/setupProgress';
import type { RecoveryOpening } from '../../src/account/recoveryOpening';
import { rememberedRecoveryRoutes } from '../../src/account/lostRecoveryRoutes';
let early: Awaited<ReturnType<typeof beginLostDeviceRecovery>> | undefined;
let opened: Awaited<ReturnType<typeof openRecoveredWorkspace>> | undefined;
let opening: RecoveryOpening | undefined;
const controller = new AbortController();
declare global {
  interface Window {
    recoveryRequest(op: string, body: unknown): Promise<unknown>;
    recoveryAssertion(challenge: string): Promise<
      {
        id: string;
        response: {
          authenticatorData: string;
          clientDataJSON: string;
          signature: string;
          userHandle: string;
        };
      } & { toJSON?: () => unknown }
    >;
  }
}
const transport: RecoveryTransport = (op, body) => window.recoveryRequest(op, body);
const buffer = (value: string) =>
  Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), (c) => c.charCodeAt(0))
    .buffer;
export async function begin(config: SetupConfig) {
  early = await beginLostDeviceRecovery(config, {
    signal: controller.signal,
    transport,
    assert: async (options) => window.recoveryAssertion(options.challenge),
  });
  return { slotId: early.slotId, accountId: early.accountId };
}
export const prepare = (code: string) => early!.prepare(code);
export async function confirm(code: string) {
  const saved = await early!.confirm(code);
  opening = saved.opening;
  return saved.slotId;
}
export const resume = (config: SetupConfig, slotId: string, code: string) =>
  resumeLostDeviceRecovery(config, slotId, code, controller.signal);
export const finish = (config: SetupConfig, slotId: string, code: string) =>
  finishLostDeviceRecovery(config, slotId, code, controller.signal, transport);
export const hints = (config: SetupConfig) => rememberedRecoveryRoutes(config.pin);
export async function open(config: SetupConfig, slotId: string, code: string) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
  Object.defineProperty(navigator.credentials, 'get', {
    configurable: true,
    value: async (options: CredentialRequestOptions) => {
      const challenge = btoa(
        String.fromCharCode(...new Uint8Array(options.publicKey!.challenge as ArrayBuffer)),
      )
        .replaceAll('+', '-')
        .replaceAll('/', '_')
        .replaceAll('=', '');
      const r = await window.recoveryAssertion(challenge);
      return {
        id: r.id,
        response: {
          authenticatorData: buffer(r.response.authenticatorData),
          clientDataJSON: buffer(r.response.clientDataJSON),
          signature: buffer(r.response.signature),
          userHandle: buffer(r.response.userHandle),
        },
      };
    },
  });
  const fresh = opening;
  opening = undefined;
  opened = await openRecoveredWorkspace(config, slotId, code, controller.signal, fresh);
  return { text: opened.editor.workspace.read().master, login: opened.login.getSnapshot() };
}
export async function close() {
  await opened?.editor.workspace.close();
  opened?.login.close();
  opened = undefined;
  early?.close();
  early = undefined;
}
