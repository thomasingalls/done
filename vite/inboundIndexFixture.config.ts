/** Test-only Worker index ceiling/observations, as with the native interior-cut fixture.
 * Ordinary builds never import this configuration. Page code retains its production ceiling. */
import { defineConfig, mergeConfig, type Plugin } from 'vite';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import application from '../vite.config';
export default defineConfig((environment) => {
  const productionBytes = 32 * 1024 * 1024,
    limit = Number(process.env['INBOUND_INDEX_MAX_BYTES'] ?? productionBytes),
    observe = process.env['INBOUND_INDEX_OBSERVE'] !== '0';
  if (limit !== productionBytes && limit !== 1024 * 1024)
    throw Error('Expected the declared production or test index ceiling');
  const ledger = 'src/crdt/incrementalAccountLedger.ts',
    owner = 'src/crdt/accountReceive.ts';
  const ceiling = '  INDEX_MAX_BYTES = 32 * 1024 * 1024;',
    limitedCeiling = `  INDEX_MAX_BYTES = ${limit};`;
  const hooks: [string, string, string][] = [
    [
      ledger,
      '  return { logicalRows, ownedBytes, eligible: ownedBytes <= INDEX_MAX_BYTES };',
      `  const usage = { logicalRows, ownedBytes, eligible: ownedBytes <= INDEX_MAX_BYTES };
  console.info('native-index-observation:' + JSON.stringify({site:'usage',...usage,indexed:!!view.indexes,nativeSeq:records.at(-1)?.seq??0,limit:INDEX_MAX_BYTES}));
  return usage;`,
    ],
    [
      ledger,
      `  if (
    counter.v !== 2 ||
    records.length > INDEX_MAX_ROWS ||
    records.reduce((n, r) => n + r.bytes.length, 0) > INDEX_MAX_BYTES
  )
    return;`,
      `  if (
    counter.v !== 2 ||
    records.length > INDEX_MAX_ROWS ||
    records.reduce((n, r) => n + r.bytes.length, 0) > INDEX_MAX_BYTES
  ) {
    console.info('native-index-observation:' + JSON.stringify({site:'index-pre-refusal',counterV:counter.v,physicalRows:records.length,physicalBytes:records.reduce((n,r)=>n+r.bytes.length,0),nativeSeq:records.at(-1)?.seq??0,limit:INDEX_MAX_BYTES}));
    return;
  }`,
    ],
    [
      ledger,
      `    !old ||
    !added ||
    counter.v !== 2 ||
    records.length > INDEX_MAX_ROWS ||
    records.reduce((n, r) => n + r.bytes.length, 0) > INDEX_MAX_BYTES
  )
    return;`,
      `    !old ||
    !added ||
    counter.v !== 2 ||
    records.length > INDEX_MAX_ROWS ||
    records.reduce((n, r) => n + r.bytes.length, 0) > INDEX_MAX_BYTES
  ) {
    console.info('native-index-observation:' + JSON.stringify({site:'append-pre-refusal',priorIndexed:!!old,added:!!added,counterV:counter.v,physicalRows:records.length,physicalBytes:records.reduce((n,r)=>n+r.bytes.length,0),nativeSeq:records.at(-1)?.seq??0,limit:INDEX_MAX_BYTES}));
    return;
  }`,
    ],
    [
      ledger,
      '  if (!usage.eligible) return;',
      `  if (!usage.eligible) {
    console.info('native-index-observation:' + JSON.stringify({site:'append-usage-refusal',...usage,priorIndexed:!!old,counterV:counter.v,nativeSeq:records.at(-1)?.seq??0,limit:INDEX_MAX_BYTES}));
    return;
  }`,
    ],
    [
      owner,
      '                    delete result.indexes;',
      `                  {
                    console.info('native-index-observation:' + JSON.stringify({site:'actual-index-drop',counterV:counter.v,nativeSeq:records.at(-1)?.seq??0,peers:[...(result.inbound.peers??new Map())].map(([id,p])=>[id,p.prefix.position])}));
                    delete result.indexes;
                  }`,
    ],
    [
      owner,
      `          syntaxTurn.complete(result);
          if (!audit) resetSemanticAudit();
          return result;`,
      `          syntaxTurn.complete(result);
          if (!audit) resetSemanticAudit();
          console.info('native-index-observation:' + JSON.stringify({site:'full-verified',audit,counterV:counter.v,indexed:!!result.indexes,nativeSeq:records.at(-1)?.seq??0,peers:[...(result.inbound.peers??new Map())].map(([id,p])=>[id,p.prefix.position])}));
          return result;`,
    ],
  ];
  const originals = new Map(
    [...new Set(hooks.map((h) => h[0]))].map((path) => [path, readFileSync(resolve(path), 'utf8')]),
  );
  const identities: {
    path: string;
    source: string;
    limited: string;
    observed: string;
    anchors: number;
    ceilingChanges: number;
    worker: boolean;
  }[] = [];
  const observer = (worker: boolean): Plugin => ({
    name: 'native-index-ceiling-and-observation-only',
    enforce: 'pre',
    transform(source, id) {
      const path = [...originals.keys()].find((p) => id.endsWith('/' + p));
      if (!path) return;
      const original = originals.get(path)!;
      if (path === ledger && original.split(ceiling).length !== 2)
        throw Error('Expected one exact index ceiling');
      const limited =
        path === ledger && limit !== productionBytes
          ? original.replace(ceiling, limitedCeiling)
          : original;
      if (source !== original && source !== limited)
        throw Error('Expected exact index source or its exact ceiling-only transform');
      let observed = limited,
        anchors = 0;
      const selected = worker && observe ? hooks.filter((h) => h[0] === path) : [];
      for (const [, anchor, replacement] of selected) {
        if (observed.split(anchor).length !== 2)
          throw Error('Expected unique index observation anchor');
        observed = observed.replace(anchor, replacement);
        anchors++;
      }
      let inverse = observed;
      for (const [, anchor, replacement] of [...selected].reverse()) {
        if (inverse.split(replacement).length !== 2)
          throw Error('Expected unique inverse observation');
        inverse = inverse.replace(replacement, anchor);
      }
      if (inverse !== limited) throw Error('Index observation altered an existing check');
      if (path === ledger && limit !== productionBytes) {
        if (inverse.split(limitedCeiling).length !== 2)
          throw Error('Expected unique inverse index ceiling');
        inverse = inverse.replace(limitedCeiling, ceiling);
      }
      if (inverse !== original) throw Error('Test build changed more than the index ceiling');
      const sha = (s: string) => createHash('sha256').update(s).digest('hex');
      identities.push({
        path,
        source: sha(original),
        limited: sha(limited),
        observed: sha(observed),
        anchors,
        ceilingChanges: path === ledger && limit !== productionBytes ? 1 : 0,
        worker,
      });
      if (observed !== source) return observed;
    },
  });
  return mergeConfig(application(environment), {
    worker: { plugins: () => [observer(true)] },
    ...(observe
      ? {
          build: {
            rollupOptions: {
              input: {
                app: 'index.html',
                local: 'local.html',
                continuation: 'test/inbound-continuation/driver.html',
              },
            },
          },
        }
      : {}),
    plugins: [
      {
        name: 'native-index-observation-identities',
        closeBundle() {
          for (const path of originals.keys())
            if (observe && !identities.some((i) => i.path === path && i.worker && i.anchors))
              throw Error('Missing actual index Worker observation');
          if (!identities.some((i) => i.path === ledger && i.worker))
            throw Error('Missing actual index Worker ceiling');
          const out = process.env['INBOUND_CONTINUATION_BUILD_RECORD'];
          if (!out) throw Error('Expected declared index identity output');
          mkdirSync(resolve(out, '..'), { recursive: true });
          writeFileSync(
            out,
            JSON.stringify(
              {
                productionBytes,
                limit,
                observe,
                ceilingOnly: !observe,
                inverseByteExact: true,
                identities,
              },
              null,
              2,
            ) + '\n',
          );
        },
      },
    ],
  });
});
