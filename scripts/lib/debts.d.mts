/**
 * Declarations for scripts/lib/debts.mjs, so the vitest negatives in
 * test/debtManifest.test.ts can exercise the manifest's refusals under the
 * app's strict typecheck without pulling `allowJs` into the program.
 */

export interface DebtInput {
  path: string;
  section: string | null;
  hash: string;
}

export interface DebtPayment {
  kind: string;
  requires: string[];
  refuses?: string[];
}

export interface Debt {
  id: string;
  finding: string;
  property: string;
  owner: string;
  gate: string;
  artifact: string;
  falsifier: string;
  payment: DebtPayment;
  expiry: string;
  registered: string;
  status: 'open' | 'paid' | 'waived';
  inputs: DebtInput[];
  payment_record?: Record<string, unknown> & { kind?: string };
  waiver?: { scope?: string; expiry?: string; authority?: string; recorded?: string };
}

export declare const MANIFEST: string;
export declare const hash12: (text: string) => string;
export declare const section: (text: string, number: string) => string | null;
export declare const loadManifest: (root: string) => Debt[];
export declare const validateManifest: (debts: Debt[], root: string) => string[];
export declare const validatePayment: (debt: Debt) => string[];
export declare const validateWaiver: (debt: Debt) => string[];
export declare const today: () => string;
export declare const evaluateGate: (
  debts: Debt[],
  gate: string,
  root: string,
) => { blocking: { debt: Debt; why: string }[]; waived: Debt[] };
export declare const projection: (debts: Debt[]) => Map<string, Debt[]>;
