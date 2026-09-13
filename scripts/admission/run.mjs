/** Standalone admission retains full/default and explicit case/no-mutant variants, with the
 * same disposable owner and complete result adapter used by the release manifest. */
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { admissionSelection, admissionStage } from '../release-validation/admission-adapter.mjs';
import { executeStages } from '../release-validation/execute.mjs';
import { render } from '../storage-conformance/report.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
if (process.env.CHROMIUM_PATH)
  throw Error(
    'The owned admission adapter uses the pinned installed Playwright Chromium; CHROMIUM_PATH overrides are not supported',
  );
const args = process.argv.slice(2),
  { output: requested } = admissionSelection(root, args);
const output = resolve(
  root,
  requested ?? `test-results/admission/${new Date().toISOString().replaceAll(':', '-')}`,
);
const summary = await executeStages({
  root,
  output,
  stages: [admissionStage(root, args)],
  selection: 'standalone-admission',
});
const stage = summary.stages[0];
if (stage) {
  try {
    const report = join(output, 'stages', stage.key, 'cases.json');
    copyFileSync(report, join(output, 'report.json'));
    writeFileSync(join(output, 'report.md'), render(JSON.parse(readFileSync(report))));
  } catch (e) {
    console.error('No complete admission report: ' + e.message);
    process.exitCode = 1;
  }
}
console.log('Admission report: ' + join(output, 'report.md'));
if (summary.status !== 'passed') process.exitCode = 1;
