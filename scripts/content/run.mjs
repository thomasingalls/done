/** Standalone content retains full/default and explicit case/no-mutant variants, with the
 * same disposable owner and complete result adapter used by the release manifest. */
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { contentSelection, contentStage } from '../release-validation/content-adapter.mjs';
import { executeStages } from '../release-validation/execute.mjs';
import { render } from '../storage-conformance/report.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const args = process.argv.slice(2),
  { output: requested } = contentSelection(root, args);
const output = resolve(
  root,
  requested ?? `test-results/content/${new Date().toISOString().replaceAll(':', '-')}`,
);
const summary = await executeStages({
  root,
  output,
  stages: [contentStage(root, args)],
  selection: 'standalone-content',
});
const stage = summary.stages[0];
if (stage) {
  try {
    const report = join(output, 'stages', stage.key, 'cases.json');
    copyFileSync(report, join(output, 'report.json'));
    writeFileSync(join(output, 'report.md'), render(JSON.parse(readFileSync(report))));
  } catch (e) {
    console.error('No complete content report: ' + e.message);
    process.exitCode = 1;
  }
}
console.log('Content report: ' + join(output, 'report.md'));
if (summary.status !== 'passed') process.exitCode = 1;
