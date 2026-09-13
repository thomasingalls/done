/** Standalone custody retains full/default and explicit case/no-mutant variants, with the
 * same disposable owner and complete result adapter used by the release manifest. */
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { custodySelection, custodyStage } from '../release-validation/custody-adapter.mjs';
import { executeStages } from '../release-validation/execute.mjs';
import { render } from '../storage-conformance/report.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
if (process.env.CHROMIUM_PATH)
  throw Error(
    'The owned custody adapter uses the pinned installed Playwright Chromium; CHROMIUM_PATH overrides are not supported',
  );
const args = process.argv.slice(2),
  { output: requested } = custodySelection(root, args);
const output = resolve(
  root,
  requested ?? `test-results/custody/${new Date().toISOString().replaceAll(':', '-')}`,
);
const summary = await executeStages({
  root,
  output,
  stages: [custodyStage(root, args)],
  selection: 'standalone-custody',
});
const stage = summary.stages[0];
if (stage) {
  try {
    const report = join(output, 'stages', stage.key, 'cases.json');
    copyFileSync(report, join(output, 'report.json'));
    writeFileSync(join(output, 'report.md'), render(JSON.parse(readFileSync(report))));
  } catch (e) {
    console.error('No complete custody report: ' + e.message);
    process.exitCode = 1;
  }
}
console.log('Custody report: ' + join(output, 'report.md'));
if (summary.status !== 'passed') process.exitCode = 1;
