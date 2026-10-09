/** Neutral detector: no product imports, storage schema, authentication or decryption. */
import { createHash } from 'node:crypto';
import { containerParts } from './containers.mjs';
export const LIMITS = Object.freeze({
  decodeDepth: 8,
  cloneDepth: 64,
  valueBytes: 64 * 1024 ** 2,
  surfaceBytes: 256 * 1024 ** 2,
  checkpointBytes: 1024 ** 3,
  collectorMs: 30000,
});
export const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function compile(needles) {
  if (
    !Array.isArray(needles) ||
    !needles.length ||
    new Set(needles.map((n) => n.id)).size !== needles.length ||
    needles.some(
      (n) =>
        typeof n.id !== 'string' ||
        !n.id ||
        (!n.values?.length && !n.raw?.length) ||
        (n.values ?? []).some((v) => typeof v !== 'string' || !v.length) ||
        (n.raw ?? []).some(
          (v) => typeof v !== 'string' || !v || Buffer.from(v, 'base64').toString('base64') !== v,
        ),
    )
  )
    throw Error('A nonempty unique needle manifest is required');

  return needles
    .flatMap((n) =>
      (n.values ?? []).flatMap((v) => {
        const utf16 = Buffer.from(v, 'utf16le');
        return [
          ['utf8', Buffer.from(v)],
          ['utf16le', utf16],
          ['utf16be', Buffer.from(utf16).swap16()],
          ['json-escaped', Buffer.from(JSON.stringify(v).slice(1, -1))],
          ['hex', Buffer.from(Buffer.from(v).toString('hex'))],
          ['HEX', Buffer.from(Buffer.from(v).toString('hex').toUpperCase())],
        ].map(([encoding, bytes]) => ({ id: n.id, encoding, bytes }));
      }),
    )
    .concat(
      needles.flatMap((n) =>
        (n.raw ?? []).map((r) => ({
          id: n.id,
          encoding: 'raw-byte-needle',
          bytes: Buffer.from(r, 'base64'),
        })),
      ),
    );
}
export function matchBytes(input, needles, limits = LIMITS, fault = '', prepared) {
  const original = Buffer.from(input),
    matches = [],
    issues = [],
    seen = new Set(),
    found = new Set();
  let expanded = 0;
  const issue = (reason) => {
    if (!issues.includes(reason)) issues.push(reason);
  };
  const compiled = prepared ?? compile(needles);
  function visit(bytes, depth, route) {
    if (bytes.length > limits.valueBytes || (expanded += bytes.length) > limits.surfaceBytes) {
      issue('decode-byte-budget');
      return;
    }
    // Matching precedes deduplication hashes, summaries and redaction.
    for (const n of compiled) {
      let offset = bytes.indexOf(n.bytes);
      while (offset !== -1) {
        const key = [n.id, route, n.encoding, offset].join(':');
        if (!found.has(key)) {
          found.add(key);
          matches.push({ needle: n.id, representation: route + '/' + n.encoding, offset });
        }
        offset = bytes.indexOf(n.bytes, offset + Math.max(1, n.bytes.length));
      }
    }
    const key = hash(bytes);
    if (seen.has(key)) return;
    seen.add(key);
    const compressed =
      (bytes[0] === 0x1f && bytes[1] === 0x8b && bytes[2] === 8) ||
      [0x04034b50, 0x06054b50, 0x08074b50].some(
        (signature) => bytes.length >= 4 && bytes.readUInt32LE(0) === signature,
      );
    const candidates = [];
    for (const encoding of ['utf-8', 'utf-16le', 'utf-16be']) {
      try {
        candidates.push(new TextDecoder(encoding, { fatal: true }).decode(bytes));
      } catch {
        /* arbitrary binary */
      }
    }
    const descend = (next, label) => {
      if (!next.length || next.equals(bytes)) return;
      if (depth >= limits.decodeDepth) {
        issue('decode-depth-budget');
        return;
      }
      visit(next, depth + 1, route + '/' + label);
    };
    if (compressed) {
      if (!limits.containers) issue('unsupported-compressed-container');
      else {
        try {
          for (const [i, part] of containerParts(
            bytes,
            Math.min(limits.valueBytes, limits.surfaceBytes - expanded),
          ).entries())
            descend(part, 'container-' + i);
        } catch {
          issue('invalid-unsupported-or-overbudget-container');
        }
      }
    }
    for (const text of new Set(candidates)) {
      if (text.includes('\n'))
        for (const line of text.split('\n')) descend(Buffer.from(line), 'line');
      for (const literal of text.matchAll(/"(?:\\.|[^"\\])*"/g)) {
        try {
          descend(Buffer.from(JSON.parse(literal[0])), 'json-literal');
        } catch {
          /* not a JSON string */
        }
      }
      if (/\\(?:u[0-9a-fA-F]{4}|["\\/bfnrt])/.test(text)) {
        try {
          descend(Buffer.from(JSON.parse('"' + text + '"')), 'json-escaped-string');
        } catch {
          /* not a complete escaped string */
        }
      }
      if (/^\s*[[{"]/.test(text)) {
        try {
          const value = JSON.parse(text);
          const walk = (v, d) => {
            if (d > limits.cloneDepth) {
              issue('json-depth-budget');
              return;
            }
            if (typeof v === 'string') descend(Buffer.from(v), 'json-string');
            else if (v && typeof v === 'object') {
              if (
                Array.isArray(v) &&
                v.length &&
                v.every((b) => Number.isInteger(b) && b >= 0 && b < 256)
              )
                descend(Buffer.from(v), 'json-byte-array');
              for (const [k, child] of Object.entries(v)) {
                descend(Buffer.from(k), 'json-key');
                walk(child, d + 1);
              }
            }
          };
          walk(value, 0);
        } catch {
          /* text need not be JSON */
        }
      }
      for (const span of text.matchAll(/[A-Fa-f0-9]{8,}/g))
        if (span[0].length % 2 === 0) descend(Buffer.from(span[0], 'hex'), 'hex');
      if (fault !== 'base64')
        for (const span of text.matchAll(/[A-Za-z0-9+/_-]{8,}={0,2}/g)) {
          const s = span[0],
            raw = s.replaceAll('-', '+').replaceAll('_', '/');
          if (raw.length % 4 === 1) continue;
          const decoded = Buffer.from(raw, 'base64');
          if (decoded.toString('base64').replace(/=+$/, '') !== raw.replace(/=+$/, '')) continue;
          descend(decoded, 'base64');
        }
    }
  }
  visit(fault === 'hash' ? Buffer.from(hash(original)) : original, 0, 'raw');
  return { matches, issues, sha256: hash(original), bytes: original.length };
}
/** Collection contains lossless base64 transports of raw values, never product JSON summaries. */
export function assess(
  collections,
  needles,
  required,
  allow = () => false,
  limits = LIMITS,
  fault = '',
) {
  const matches = [],
    issues = [],
    acquired = [],
    exposures = [];
  let total = 0;
  const seenSurfaces = new Set(),
    prepared = compile(needles);
  for (const c of collections) {
    seenSurfaces.add(c.surface);
    for (const e of c.errors ?? []) issues.push({ surface: c.surface, reason: e });
    if (c.complete !== true) issues.push({ surface: c.surface, reason: 'collector-incomplete' });
    let surfaceBytes = 0;
    for (const e of c.entries) {
      const bytes = Buffer.from(e.raw, 'base64');
      if (bytes.toString('base64') !== e.raw) {
        issues.push({ surface: c.surface, reason: 'invalid-raw-transport' });
        continue;
      }
      total += bytes.length;
      surfaceBytes += bytes.length;
      if (total > limits.checkpointBytes || surfaceBytes > limits.surfaceBytes) {
        issues.push({ surface: c.surface, reason: 'acquisition-byte-budget' });
        break;
      }
      const result = matchBytes(bytes, needles, limits, fault, prepared);
      const locator = { surface: c.surface, location: e.location };
      for (const m of result.matches) {
        const row = { ...locator, ...m };
        (allow(row) ? exposures : matches).push(row);
      }
      for (const reason of result.issues) issues.push({ ...locator, reason });
      acquired.push({ ...locator, sha256: result.sha256, bytes: result.bytes, type: e.type });
    }
  }
  for (const surface of required)
    if (!seenSurfaces.has(surface)) issues.push({ surface, reason: 'missing-collector' });
  return {
    verdict: matches.length
      ? 'prohibited-match'
      : issues.length
        ? 'incomplete'
        : 'complete-no-prohibited-match',
    matches,
    exposures,
    issues,
    acquired,
    totalBytes: total,
  };
}
