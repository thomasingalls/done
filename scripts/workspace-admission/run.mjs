/** Standalone workspace-admission retains full/default and explicit case/no-mutant variants, with the
 * same disposable owner and complete result adapter used by the release manifest. */
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  workspaceAdmissionSelection,
  workspaceAdmissionStage,
} from '../release-validation/workspace-admission-adapter.mjs';
import { executeStages } from '../release-validation/execute.mjs';
import { render } from '../storage-conformance/report.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
if (process.env.CHROMIUM_PATH)
  throw Error(
    'The owned workspace-admission adapter uses the pinned installed Playwright Chromium; CHROMIUM_PATH overrides are not supported',
  );
const args = process.argv.slice(2),
  { output: requested } = workspaceAdmissionSelection(root, args);
const output = resolve(
  root,
  requested ?? `test-results/workspace-admission/${new Date().toISOString().replaceAll(':', '-')}`,
);
const summary = await executeStages({
  root,
  output,
  stages: [workspaceAdmissionStage(root, args)],
  selection: 'standalone-workspace-admission',
});
const stage = summary.stages[0];
if (stage) {
  try {
    const report = join(output, 'stages', stage.key, 'cases.json');
    copyFileSync(report, join(output, 'report.json'));
    writeFileSync(join(output, 'report.md'), render(JSON.parse(readFileSync(report))));
  } catch (e) {
    console.error('No complete workspace-admission report: ' + e.message);
    process.exitCode = 1;
  }
}
console.log('Workspace-admission report: ' + join(output, 'report.md'));
if (summary.status !== 'passed') process.exitCode = 1;
