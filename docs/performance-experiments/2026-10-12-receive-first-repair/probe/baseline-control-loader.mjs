// Read-only runtime override for the single pre-existing adversarial-control investigation.
import { registerHooks } from 'node:module';
import { execFileSync } from 'node:child_process';
const reference = 'ee234d06521400e9d938b1874799e82f7fcac0e3';
const source = Object.fromEntries(
  ['src/crdt/accountReceive.ts', 'src/crdt/receiveSelection.ts'].map((path) => [
    path,
    execFileSync('git', ['show', reference + ':' + path], { encoding: 'utf8' }),
  ]),
);
registerHooks({
  load(url, context, next) {
    const result = next(url, context);
    if (
      !url.endsWith('/test/account-sync/fixtures.mjs') &&
      !url.endsWith('/test/account-sync/native-controls.test.mjs')
    )
      return result;
    let code =
      typeof result.source === 'string' ? result.source : Buffer.from(result.source).toString();
    if (url.endsWith('/fixtures.mjs')) {
      const before = '    plugins: control\n      ? [';
      const after = '      : [],\n    build: {';
      if (!code.includes(before) || !code.includes(after))
        throw Error('Fixture override anchors changed');
      code = code
        .replace(
          before,
          `    plugins: [{ name: 'pinned-baseline', enforce: 'pre', transform(code, id) {
        const sources = ${JSON.stringify(source)};
        for (const [path, text] of Object.entries(sources)) if (id.endsWith('/' + path)) { console.log('Pinned baseline source: ' + path); return text; }
      } }, ...(control ? [`,
        )
        .replace(after, '      : [])],\n    build: {');
    } else {
      code = code.replace(
        "opened.sync.status.receive.reason === 'operation-failed' ||",
        "opened.sync.status.receive.reason === 'operation-failed' || opened.sync.status.receive.reason === 'integrity' ||",
      );
      code = code.replace(
        'const advanced = status.receive.receivedThrough === 1;',
        "console.log(JSON.stringify({ reference: 'ee234d06', mode, receive: status.receive })); const advanced = status.receive.receivedThrough === 1;",
      );
    }
    return { ...result, source: code };
  },
});
