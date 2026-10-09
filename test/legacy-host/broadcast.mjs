// The absence switch is set before the dependency module graph is evaluated.
if (new URL(location.href).searchParams.has('fallback')) globalThis.BroadcastChannel = undefined;
const [{ WebsocketProvider }, Y, decoding, sync] = await Promise.all([
  import('y-websocket'),
  import('yjs'),
  import('lib0/decoding'),
  import('y-protocols/sync'),
]);
window.broadcastFixture = {
  run(text) {
    const doc = new Y.Doc(),
      url = 'ws://127.0.0.1:1',
      room = 'preflight-synthetic';
    const provider = new WebsocketProvider(url, room, doc, { connect: false });
    provider.connectBc();
    doc.getText('master').insert(0, text);
    const key = url + '/' + room,
      encoded = localStorage.getItem(key);
    let recovered = null;
    if (encoded) {
      const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0)),
        decoder = decoding.createDecoder(bytes);
      if (
        decoding.readVarUint(decoder) === 0 &&
        decoding.readVarUint(decoder) === sync.messageYjsUpdate
      ) {
        const cold = new Y.Doc();
        Y.applyUpdate(cold, decoding.readVarUint8Array(decoder));
        recovered = cold.getText('master').toString();
        cold.destroy();
      }
    }
    provider.destroy();
    doc.destroy();
    return {
      key,
      present: encoded !== null,
      recovered,
      retainedAfterClose: localStorage.getItem(key) !== null,
    };
  },
};
