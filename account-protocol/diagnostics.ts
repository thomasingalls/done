/** Unsigned diagnostic vocabulary. None of these observations grants protocol authority. */
export const SERVICE_HINTS = [
  'invalid-request',
  'envelope-size',
  'unavailable',
  'unsupported-epoch',
  'out-of-order',
  'parent-required',
  'unissued-parent',
  'state-changed',
  'storage-unavailable',
] as const;
export type ServiceHintReason = (typeof SERVICE_HINTS)[number];
export const PROMOTION_REFUSALS = [
  'malformed',
  'unknown-attempt',
  'operation-mismatch',
  'cancelled',
  'expired',
  'proof-conflict',
  'invalid-proof',
  'credential-in-use',
  'account-not-active',
  'account-not-pending',
  'recovery-conflict',
  'already-finished',
  'storage-unavailable',
] as const;
export type PromotionRefusal = (typeof PROMOTION_REFUSALS)[number];
const fields = (input: unknown, keys: string[]): Record<string, unknown> | null => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (
    Reflect.ownKeys(input).length !== keys.length ||
    keys.some((k) => !descriptors[k] || !('value' in descriptors[k]!))
  )
    return null;
  return Object.fromEntries(keys.map((k) => [k, descriptors[k]!.value]));
};
export function serviceHint(input: unknown): ServiceHintReason | null {
  const value = fields(input, ['v', 'kind', 'reason']);
  return value?.['v'] === 1 &&
    value['kind'] === 'unknown' &&
    SERVICE_HINTS.includes(value['reason'] as ServiceHintReason)
    ? (value['reason'] as ServiceHintReason)
    : null;
}
export class PromotionRefusalError extends Error {
  override readonly name = 'PromotionRefusalError';
  readonly authoritative = false;
  readonly stage: 'begin' | 'challenge' | 'finish';
  readonly hint: PromotionRefusal;
  constructor(stage: 'begin' | 'challenge' | 'finish', hint: PromotionRefusal) {
    super(`Promotion ${stage} did not complete: ${hint}. Retry using the retained progress.`);
    this.stage = stage;
    this.hint = hint;
  }
}
export function checkPromotionRefusal(input: unknown, stage: PromotionRefusalError['stage']): void {
  const value = fields(input, ['ok', 'refusal']);
  if (value?.['ok'] === false && PROMOTION_REFUSALS.includes(value['refusal'] as PromotionRefusal))
    throw new PromotionRefusalError(stage, value['refusal'] as PromotionRefusal);
  // Other objects still go through the existing closed success parser and authentication.
}

export const DIAGNOSTIC_OPERATIONS = [
  'submit',
  'read',
  'read-v2',
  'promotion-begin',
  'promotion-challenge',
  'promotion-finish',
  'account-transaction',
  'enrollment',
  'successor',
  'http',
] as const;
export const DIAGNOSTIC_PHASES = [
  'request',
  'storage',
  'verify',
  'commit',
  'response',
  'stream',
] as const;
export const DIAGNOSTIC_CODES = [
  ...SERVICE_HINTS,
  ...PROMOTION_REFUSALS,
  'invalid-token',
  'network-unavailable',
  'response-invalid',
  'response-too-large',
  'inbound-size',
  'aborted',
  'timeout',
  'http-denied',
  'unexpected-failure',
  'storage-busy',
  'crypto-failure',
] as const;
export interface Diagnostic {
  operation: (typeof DIAGNOSTIC_OPERATIONS)[number];
  phase: (typeof DIAGNOSTIC_PHASES)[number];
  code: (typeof DIAGNOSTIC_CODES)[number];
}
export type DiagnosticSink = (event: Diagnostic) => void;
/** No identifiers, raw exception messages, URLs, tokens, factors or writing. Never persisted. */
export function createDiagnostics() {
  const rows: Readonly<Diagnostic>[] = [];
  return {
    record(event: Diagnostic) {
      if (
        !DIAGNOSTIC_OPERATIONS.includes(event.operation) ||
        !DIAGNOSTIC_PHASES.includes(event.phase) ||
        !DIAGNOSTIC_CODES.includes(event.code)
      )
        return;
      if (rows.length === 32) rows.shift();
      rows.push(
        Object.freeze({ operation: event.operation, phase: event.phase, code: event.code }),
      );
    },
    read: () => rows.map((row) => ({ ...row })),
    clear: () => {
      rows.length = 0;
    },
  };
}
export function causeCode(cause: unknown): Diagnostic['code'] {
  if (!(cause instanceof Error)) return 'unexpected-failure';
  const code = Object.getOwnPropertyDescriptor(cause, 'code')?.value;
  const sqlite = Object.getOwnPropertyDescriptor(cause, 'errcode')?.value;
  if (code === 'ERR_SQLITE_ERROR' && [5, 6].includes(sqlite)) return 'storage-busy';
  if (cause instanceof DOMException && cause.name === 'OperationError') return 'crypto-failure';
  return 'unexpected-failure';
}
export function reportDiagnostic(sink: DiagnosticSink | undefined, event: Diagnostic): void {
  try {
    sink?.(event);
  } catch {
    /* Observation cannot alter a transaction or decision. */
  }
}
