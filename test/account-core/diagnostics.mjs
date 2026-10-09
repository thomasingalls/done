import { DatabaseSync } from 'node:sqlite';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function snapshot(path) {
  const db = new DatabaseSync(path);
  try {
    return Object.fromEntries(
      ['accounts', 'attempts', 'credentials', 'ceremonies'].map((table) => [
        table,
        db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(),
      ]),
    );
  } finally {
    db.close();
  }
}

export function diagnostic(name, value) {
  if (!process.env.ACCOUNT_REPORT_DIR) return;
  writeFileSync(
    join(process.env.ACCOUNT_REPORT_DIR, `${name}.json`),
    JSON.stringify(
      value,
      (_key, item) =>
        item instanceof Uint8Array ? { base64url: Buffer.from(item).toString('base64url') } : item,
      2,
    ) + '\n',
  );
}

export function failure(name, path, before, error, context) {
  try {
    diagnostic(name, { error: String(error), context, before, after: snapshot(path) });
  } catch (captureError) {
    console.error(`Failure diagnostics unavailable: ${captureError}`);
  }
}
