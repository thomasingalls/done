/** Observation only. This configuration is never imported by an application entry. */
import { defineConfig, mergeConfig, type Plugin } from 'vite';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import application from '../vite.config';
export default defineConfig((environment) => {
  const ledger = 'src/crdt/incrementalAccountLedger.ts',
    owner = 'src/crdt/accountReceive.ts';
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
  const identities: { path: string; source: string; observed: string; anchors: number }[] = [];
  const observer = (): Plugin => ({
    name: 'native-index-observation-only',
    enforce: 'pre',
    transform(source, id) {
      const path = [...originals.keys()].find((p) => id.endsWith('/' + p));
      if (!path) return;
      if (source !== originals.get(path)) throw Error('Expected exact index source');
      let observed = source,
        anchors = 0;
      const selected = hooks.filter((h) => h[0] === path);
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
      if (inverse !== source) throw Error('Index observation altered an existing check');
      const sha = (s: string) => createHash('sha256').update(s).digest('hex');
      identities.push({ path, source: sha(source), observed: sha(observed), anchors });
      return observed;
    },
  });
  return mergeConfig(application(environment), {
    worker: { plugins: () => [observer()] },
    build: {
      rollupOptions: {
        input: {
          app: 'index.html',
          local: 'local.html',
          continuation: 'test/inbound-continuation/driver.html',
        },
      },
    },
    plugins: [
      {
        name: 'native-index-observation-identities',
        closeBundle() {
          for (const path of originals.keys())
            if (!identities.some((i) => i.path === path))
              throw Error('Missing actual index Worker observation');
          const out = process.env['INBOUND_CONTINUATION_BUILD_RECORD'];
          if (!out) throw Error('Expected declared index identity output');
          mkdirSync(resolve(out, '..'), { recursive: true });
          writeFileSync(out, JSON.stringify({ observationOnly: true, identities }, null, 2) + '\n');
        },
      },
    ],
  });
});
