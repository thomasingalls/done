export interface Candidate {
  id: string;
  branch: string;
  revision: string;
}
export interface Scenario {
  id: string;
  requirement: string;
  title: string;
}
export const candidates: Candidate[];
export const cases: Scenario[];
export const pending: (Scenario & { reason: string })[];
export const mutants: {
  id: string;
  candidate: string;
  case: string;
  assertion: string;
  path: string;
  from: string;
  to: string;
}[];
