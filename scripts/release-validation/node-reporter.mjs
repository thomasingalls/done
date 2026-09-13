import { writeFileSync } from 'node:fs';
import { relative } from 'node:path';

/** Exact leaf identities for directNodeCensus; suites/nesting require another adapter. */
export default async function* reporter(events) {
  const cases = [],
    errors = [];
  let summary;
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
      yield `${type} ${data.name}\n`;
    }
    if (type === 'test:summary' && !data.file) summary = data;
  }
  if (!summary) errors.push('Missing terminal Node summary');
  writeFileSync(
    process.env.RELEASE_CASE_REPORT,
    JSON.stringify({
      schema: 1,
      nonce: process.env.RELEASE_RUN_NONCE,
      cases,
      errors,
      ...(summary ? { summary } : {}),
    }) + '\n',
  );
}
