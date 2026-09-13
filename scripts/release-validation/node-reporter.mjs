import { writeFileSync } from 'node:fs';
import { relative } from 'node:path';
import { inspect } from 'node:util';

/** Exact leaf identities for directNodeCensus; suites/nesting require another adapter. */
export default async function* reporter(events) {
  const cases = [],
    errors = [],
    diagnostics = [];
  let summary;
  const save = (phase) =>
    writeFileSync(
      process.env.RELEASE_CASE_REPORT,
      JSON.stringify({
        schema: 1,
        nonce: process.env.RELEASE_RUN_NONCE,
        phase,
        cases,
        errors,
        diagnostics,
        ...(summary ? { summary } : {}),
      }) + '\n',
    );
  save('running');
  for await (const { type, data } of events) {
    if (type === 'test:pass' || type === 'test:fail') {
      if (data.nesting !== 0 || data.details?.type === 'suite')
        errors.push('Unsupported nested case: ' + data.name);
      cases.push({
        id: relative(process.cwd(), data.file ?? '') + '::' + data.name,
        outcome: data.skip
          ? 'skipped'
          : data.todo
            ? 'todo'
            : type === 'test:pass'
              ? 'pass'
              : 'fail',
      });
      const diagnostic = {
        id: cases.at(-1).id,
        durationMs: data.details?.duration_ms ?? null,
        // Node wraps a failed assertion/property in TestFailure.cause. The ordinary
        // Error message alone discards the reproducible seed/path/counterexample.
        ...(data.details?.error
          ? {
              error: inspect(data.details.error, {
                depth: 12,
                customInspect: false,
                maxArrayLength: null,
                maxStringLength: null,
              }),
            }
          : {}),
      };
      diagnostics.push(diagnostic);
      save('running');
      yield `${type} ${data.name}\n`;
      if (diagnostic.error) yield diagnostic.error + '\n';
    }
    if (type === 'test:summary' && !data.file) summary = data;
  }
  if (!summary) errors.push('Missing terminal Node summary');
  save('complete');
}
