/** Standalone local-clear retains full/default and explicit case/no-mutant variants, with the
 * same disposable owner and complete result adapter used by the release manifest. */
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  localClearSelection,
  localClearStage,
} from '../release-validation/local-clear-adapter.mjs';
import { executeStages } from '../release-validation/execute.mjs';
import { render } from '../storage-conformance/report.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
if (process.env.CHROMIUM_PATH)
  throw Error(
    'The owned local-clear adapter uses the pinned installed Playwright Chromium; CHROMIUM_PATH overrides are not supported',
  );
const args = process.argv.slice(2),
  { output: requested } = localClearSelection(root, args);
const output = resolve(
  root,
  requested ?? `test-results/local-clear/${new Date().toISOString().replaceAll(':', '-')}`,
);
const summary = await executeStages({
  root,
  output,
  stages: [localClearStage(root, args)],
  selection: 'standalone-local-clear',
});
const stage = summary.stages[0];
if (stage) {
  try {
    const report = join(output, 'stages', stage.key, 'cases.json');
    copyFileSync(report, join(output, 'report.json'));
    writeFileSync(join(output, 'report.md'), render(JSON.parse(readFileSync(report))));
  } catch (e) {
    console.error('No complete local-clear report: ' + e.message);
    process.exitCode = 1;
  }
}
console.log('Local clear report: ' + join(output, 'report.md'));
if (summary.status !== 'passed') process.exitCode = 1;
