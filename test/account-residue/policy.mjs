/** Classification after neutral acquisition/matching; never restricts where the collector looks. */
export function freshScopeIssues(collections) {
  const issues = [];
  for (const c of collections)
    for (const e of c.entries) {
      const p = e.location;
      if (c.surface === 'indexedDB' && p[0] === 'database' && p[1] === 'done')
        issues.push({ surface: c.surface, location: p, reason: 'unexpected-predecessor-database' });
      if (
        c.surface === 'localStorage' &&
        p[0] === 'key' &&
        ['done.actor', 'done.device', 'done.sync', 'done.sync.last'].includes(p[1])
      )
        issues.push({ surface: c.surface, location: p, reason: 'unexpected-predecessor-metadata' });
      if (
        c.surface === 'localStorage' &&
        p[0] === 'value' &&
        p[1].startsWith('done.pending-update.') &&
        Buffer.from(e.raw, 'base64').subarray(0, 2).toString() === '1:'
      )
        issues.push({ surface: c.surface, location: p, reason: 'unexpected-predecessor-journal' });
    }
  return issues;
}
