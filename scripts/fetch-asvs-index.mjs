/**
 * Rebuild the pinned ASVS index that scripts/generate-baseline-vectors.mjs
 * checks the selected profile against (TRD §15 row 17).
 *
 * **This is not part of `pnpm check` and must not become part of it.** It
 * reaches the network, and a build step that reaches the network turns a
 * third party's publishing schedule into a build failure. The point of pinning
 * the index is that the profile is checked against *a stated version of the
 * standard*, offline and deterministically; moving to a new version is a
 * deliberate act with a document change beside it.
 *
 * What it writes is identifiers and levels, never requirement text. The ASVS
 * is CC BY-SA 4.0, and a derived index of identifiers is what the profile
 * needs — reproducing the prose would be both unnecessary and a licence
 * obligation the repository has no reason to take on.
 *
 * Usage: node scripts/fetch-asvs-index.mjs [--check]
 *   --check  fetch and compare against the pinned file without writing, so a
 *            drift can be looked at deliberately rather than discovered.
 */

import { writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const OUT = new URL('./lib/asvs-5.0.0-index.json', import.meta.url);

const pinned = JSON.parse(readFileSync(OUT, 'utf8'));

/** Minimal RFC 4180 reader: the ASVS CSV quotes fields containing commas and newlines. */
const parseCsv = (text) => {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') field += c;
      else if (text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows;
  return body
    .filter((r) => r.length === header.length)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
};

const main = async () => {
  const response = await fetch(pinned.source_url);
  if (!response.ok) throw new Error(`${pinned.source_url} returned ${response.status}`);
  const text = await response.text();
  const sha256 = createHash('sha256').update(text).digest('hex');

  const rows = parseCsv(text);
  const chapters = {};
  const levels = {};
  for (const r of rows) {
    chapters[r.chapter_id] ??= { name: r.chapter_name, total: 0, L1: 0, L2: 0, L3: 0 };
    chapters[r.chapter_id].total += 1;
    chapters[r.chapter_id][`L${r.L}`] += 1;
    levels[r.req_id] = Number(r.L);
  }

  const doc = {
    ...pinned,
    source_sha256: sha256,
    totals: {
      requirements: rows.length,
      L1: rows.filter((r) => r.L === '1').length,
      L2: rows.filter((r) => r.L === '2').length,
      L3: rows.filter((r) => r.L === '3').length,
    },
    chapters,
    levels,
  };
  const json = JSON.stringify(doc, null, 2) + '\n';

  if (process.argv.includes('--check')) {
    if (sha256 !== pinned.source_sha256) {
      console.error(
        `The published ASVS ${pinned.version} CSV has changed.\n` +
          `  pinned:  ${pinned.source_sha256}\n  fetched: ${sha256}\n` +
          '  This is a decision, not a build failure. Read the diff, then rerun without --check.',
      );
      process.exit(1);
    }
    console.log(`ASVS ${pinned.version} is unchanged at the pinned digest.`);
    return;
  }

  writeFileSync(OUT, json);
  console.log(
    `Wrote ${rows.length} requirements across ${Object.keys(chapters).length} chapters from ASVS ${pinned.version}.`,
  );
};

await main();
