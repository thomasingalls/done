/** Standalone local-genesis retains full/default and explicit case/no-mutant variants, with the
 * same disposable owner and complete result adapter used by the release manifest. */
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  localGenesisSelection,
  localGenesisStage,
} from '../release-validation/local-genesis-adapter.mjs';
import { executeStages } from '../release-validation/execute.mjs';
import { render } from '../storage-conformance/report.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
if (process.env.CHROMIUM_PATH)
  throw Error(
    'The owned local-genesis adapter uses the pinned installed Playwright Chromium; CHROMIUM_PATH overrides are not supported',
  );
const args = process.argv.slice(2),
  { output: requested } = localGenesisSelection(root, args);
const output = resolve(
  root,
  requested ?? `test-results/local-genesis/${new Date().toISOString().replaceAll(':', '-')}`,
);
const summary = await executeStages({
  root,
  output,
  stages: [localGenesisStage(root, args)],
  selection: 'standalone-local-genesis',
});
const stage = summary.stages[0];
if (stage) {
  try {
    const report = join(output, 'stages', stage.key, 'cases.json');
    copyFileSync(report, join(output, 'report.json'));
    writeFileSync(join(output, 'report.md'), render(JSON.parse(readFileSync(report))));
  } catch (e) {
    console.error('No complete local-genesis report: ' + e.message);
    process.exitCode = 1;
  }
}
console.log('Local-genesis report: ' + join(output, 'report.md'));
if (summary.status !== 'passed') process.exitCode = 1;
