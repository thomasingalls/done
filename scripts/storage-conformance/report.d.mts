export interface Assertion {
  id: string;
  passed: boolean;
  actual?: unknown;
  expected?: unknown;
}
export interface CaseResult {
  id: string;
  status: string;
  assertions?: Assertion[];
  reason?: string;
  error?: unknown;
}
export interface CandidateReport {
  cases: CaseResult[];
}
export function validateReport<T extends CandidateReport>(report: T, expectedIds: string[]): T;
export function mutationStatus(
  baseline: CaseResult | undefined,
  mutant: CaseResult,
  assertion: string,
): string;
export function exitCode(reports: CandidateReport[], controls?: { status: string }[]): number;
