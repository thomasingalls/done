import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
export const report = (name, value) => {
  if (process.env.ACCOUNT_REPORT_DIR) {
    mkdirSync(process.env.ACCOUNT_REPORT_DIR, { recursive: true });
    writeFileSync(
      join(process.env.ACCOUNT_REPORT_DIR, name + '.json'),
      JSON.stringify(value, null, 2) + '\n',
    );
  }
};
export const resultJSON = (r) => ({
  ...r,
  errorInstance: r.errorInstance ? String(r.errorInstance) : null,
});
