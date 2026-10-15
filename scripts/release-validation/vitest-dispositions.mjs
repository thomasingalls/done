// One existing mode-specific test inspects private fork allocations. The direct
// Account text path has no such forks; its admission/erasure cases still execute.
// Keep this case in the denominator and require its actual skipped result.
export const namedVitestDispositions = [
  {
    id: 'test/workspaceAdmission.test.ts::["workspace preparation account-text","private prepared histories remain unpublished under pressure and are disposed on discard and drained close"]',
    outcome: 'not-applicable',
    reason: 'The direct Account text path has no private prepared history forks.',
  },
];
export const vitestDisposition = (id) =>
  namedVitestDispositions.find((c) => c.id === id) ?? { id, outcome: 'pass' };
