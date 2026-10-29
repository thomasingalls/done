/** Consume only domain-separated journal subkeys from the actual authenticated Worker. */
import type { ContentIdentity } from './contentRecord';
import { parseJournalEra, type JournalBinding } from './journalEra';
import type { CaptureRoute } from './sourceCapture';
import { requireWindowAccountCohort, type WindowAccountCohort } from './accountWorkerCohort';
import type { Bytes } from './custodyCrypto';

export interface AccountMirrorOpening {
  readonly incarnation: string;
  readonly scope: ContentIdentity;
  readonly dbName: string;
  readonly generation: number;
  /** Owned copies of domain-separated journal subkeys ONLY; this factory consumes/erases them. */
  readonly key: Bytes;
  readonly previous: readonly (readonly [number, Bytes])[];
  readonly binding?: JournalBinding;
  readonly route: Omit<CaptureRoute, 'history'>;
}
export const mirrorOpeningError = () =>
  new Error('Worker mirror opening is not bound to this live account.');
const fields = (v: unknown, expected: string) => {
  if (!v || typeof v !== 'object' || Object.getPrototypeOf(v) !== Object.prototype)
    throw mirrorOpeningError();
  const descriptors = Object.getOwnPropertyDescriptors(v);
  if (
    Reflect.ownKeys(descriptors).sort().join(',') !== expected ||
    Object.values(descriptors).some((d) => !('value' in d))
  )
    throw mirrorOpeningError();
};
const ordinaryKey = (key: Uint8Array) => {
  if (
    !(key instanceof Uint8Array) ||
    Object.getPrototypeOf(key) !== Uint8Array.prototype ||
    !(key.buffer instanceof ArrayBuffer) ||
    key.length !== 32
  )
    throw mirrorOpeningError();
  key.subarray(0, 0);
  return new Uint8Array(key);
};
export function eraseIncomingOpening(input: AccountMirrorOpening) {
  if (!input || typeof input !== 'object') return;
  const d = Object.getOwnPropertyDescriptors(input);
  const erase = (v: unknown) => {
    if (
      v instanceof Uint8Array &&
      Object.getPrototypeOf(v) === Uint8Array.prototype &&
      v.buffer instanceof ArrayBuffer
    ) {
      try {
        v.fill(0);
      } catch {
        /* detached owned bytes cannot be reused */
      }
    }
  };
  erase(d['key']?.value);
  const previous = d['previous']?.value;
  if (Array.isArray(previous)) for (const pair of previous) if (Array.isArray(pair)) erase(pair[1]);
}

export interface AccountMirrorMaterial {
  readonly scope: ContentIdentity;
  readonly route: Omit<CaptureRoute, 'history'>;
  readonly generation: number;
  readonly dbName: string;
  readonly key: Bytes;
  readonly previous: Map<number, Bytes>;
  readonly binding: JournalBinding | undefined;
}
export function eraseMirrorMaterial(value: AccountMirrorMaterial) {
  value.key.fill(0);
  for (const key of value.previous.values()) key.fill(0);
  value.previous.clear();
}
/** Entirely synchronous capture before the caller's first await; no native verification credit. */
export function takeAccountMirrorOpening(
  cohort: WindowAccountCohort,
  input: AccountMirrorOpening,
  principalId: string,
): AccountMirrorMaterial {
  const retained = new Map<number, Bytes>();
  let key: Bytes | undefined;
  try {
    requireWindowAccountCohort(cohort);
    fields(
      input,
      Object.hasOwn(input, 'binding')
        ? 'binding,dbName,generation,incarnation,key,previous,route,scope'
        : 'dbName,generation,incarnation,key,previous,route,scope',
    );
    fields(input.scope, 'principalId,rootId,slotId,storeId,workspaceId');
    fields(input.route, 'credential,epoch,generation,principal,workspace');
    const scope = structuredClone(input.scope),
      route = structuredClone(input.route),
      generation = input.generation,
      dbName = input.dbName;
    if (
      input.incarnation !== cohort.ticket.incarnation ||
      scope.slotId !== cohort.ticket.slotId ||
      [
        scope.principalId,
        scope.workspaceId,
        scope.storeId,
        scope.rootId,
        route.credential,
        route.principal,
        route.workspace,
      ].some((v) => typeof v !== 'string' || !/^[a-f0-9]{32}$/.test(v)) ||
      principalId !== route.principal ||
      !Number.isSafeInteger(generation) ||
      generation < 1 ||
      generation > 0xffffffff ||
      route.generation !== generation ||
      !Number.isSafeInteger(route.epoch) ||
      route.epoch < 1 ||
      typeof dbName !== 'string' ||
      !Array.isArray(input.previous) ||
      input.previous.length > 128
    )
      throw mirrorOpeningError();
    key = ordinaryKey(input.key);
    for (const pair of input.previous) {
      if (
        !Array.isArray(pair) ||
        pair.length !== 2 ||
        !Number.isSafeInteger(pair[0]) ||
        pair[0] < 1 ||
        pair[0] >= generation ||
        retained.has(pair[0])
      )
        throw mirrorOpeningError();
      retained.set(pair[0], ordinaryKey(pair[1]));
    }
    let binding: JournalBinding | undefined;
    if (input.binding) {
      fields(input.binding, 'era,identity,intent');
      fields(input.binding.identity, 'principalId,rootId,slotId,storeId,workspaceId');
      if (
        Object.keys(scope).some(
          (k) =>
            scope[k as keyof ContentIdentity] !==
            input.binding!.identity[k as keyof ContentIdentity],
        ) ||
        typeof input.binding.intent !== 'string' ||
        !input.binding.intent
      )
        throw mirrorOpeningError();
      binding = {
        identity: structuredClone(input.binding.identity),
        intent: input.binding.intent,
        era: parseJournalEra(input.binding.era),
      };
    }
    cohort.write(() => {});
    return { scope, route, generation, dbName, key, previous: retained, binding };
  } catch (cause) {
    key?.fill(0);
    for (const previous of retained.values()) previous.fill(0);
    retained.clear();
    throw cause;
  } finally {
    eraseIncomingOpening(input);
  }
}
