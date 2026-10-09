/** Synthetic harness diagnostics only. Never pass production profiles or unlock arguments here. */
export const describeError = (value, seen = new Set(), depth = 0) => {
  if (value === null || typeof value !== 'object')
    return { name: 'ThrownValue', message: String(value) };
  if (seen.has(value)) return { name: 'CircularCause', message: '[circular error]' };
  if (depth > 8) return { name: 'CauseDepthLimit', message: '[cause depth exceeded]' };
  seen.add(value);
  const result = { name: String(value.name ?? 'Error'), message: String(value.message ?? value) };
  for (const key of ['stack', 'code', 'reason'])
    if (value[key] !== undefined) result[key] = String(value[key]);
  if (value.disposition)
    result.disposition = { kind: value.disposition.kind, reason: value.disposition.reason };
  if ('cause' in value) result.cause = describeError(value.cause, seen, depth + 1);
  if (Array.isArray(value.errors))
    result.errors = value.errors.map((e) => describeError(e, seen, depth + 1));
  return result;
};
