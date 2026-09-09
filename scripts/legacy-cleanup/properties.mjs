import * as fc from 'fast-check';
import { join } from 'node:path';
import { atomicJSON, fingerprint, HarnessTimeout, describeError } from './diagnostics.mjs';
export const checkHistories = async (diag, name, arbitrary, history, { seed, numRuns, path }) => {
  const started = Date.now();
  let firstFailureAt,
    attempts = 0;
  diag.report.status = 'running';
  diag.report.phase = name;
  diag.event('campaign-start', { name, seed, numRuns, path: path ?? null }, true);
  diag.checkpoint();
  const property = fc.asyncProperty(arbitrary, async (input) => {
    if (diag.fatal) throw new fc.PreconditionFailure(true);
    const stage = firstFailureAt === undefined ? 'generation' : 'shrinking';
    if (firstFailureAt !== undefined && Date.now() - firstFailureAt >= diag.limits['shrink-ms']) {
      diag.fatal = new HarnessTimeout(`${name}:shrinking`, diag.limits['shrink-ms']);
      diag.report.passed = false;
      diag.report.timeout = {
        label: `${name}:shrinking`,
        ms: diag.limits['shrink-ms'],
        error: describeError(diag.fatal),
        trial: diag.trial,
      };
      diag.event('shrink-budget-exhausted', { name }, true);
      diag.checkpoint();
      throw new fc.PreconditionFailure(true);
    }
    diag.trial = {
      campaign: name,
      attempt: ++attempts,
      stage,
      seed,
      inputHash: fingerprint(input),
    };
    atomicJSON(join(diag.output, `${name}-current-input.json`), input);
    diag.event('trial-start', diag.trial, true);
    diag.checkpoint();
    const timeLeft =
      firstFailureAt === undefined
        ? diag.limits['case-ms']
        : Math.min(
            diag.limits['case-ms'],
            diag.limits['shrink-ms'] - (Date.now() - firstFailureAt),
          );
    try {
      await diag.watch(`${name}:${stage}:${attempts}`, () => history(input), Math.max(1, timeLeft));
      diag.event('trial-passed', diag.trial, true);
    } catch (error) {
      firstFailureAt ??= Date.now();
      diag.failure(name, input, error);
      throw error;
    }
  });
  const details = await diag.watch(
    `campaign:${name}`,
    () =>
      fc.check(property, {
        seed,
        numRuns,
        ...(path ? { path } : {}),
        endOnFailure: false,
        markInterruptAsFailure: true,
      }),
    diag.limits['campaign-ms'],
  );
  diag.guard();
  diag.event(
    'campaign-end',
    {
      name,
      attempts,
      elapsedMs: Date.now() - started,
      failed: details.failed,
      shrinks: details.numShrinks,
      path: details.counterexamplePath,
    },
    true,
  );
  diag.trial = null;
  diag.checkpoint();
  return details;
};
