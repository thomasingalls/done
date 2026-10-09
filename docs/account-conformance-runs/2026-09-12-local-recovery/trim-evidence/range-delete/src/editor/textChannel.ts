/** Participating same-origin tabs exchange accepted bytes, never writable documents. */
import type { AdmittedText } from './admittedText';
export interface TextChannelScope {
  readonly slotId: string;
  readonly principalId: string;
  readonly workspaceId: string;
}
export const connectTextChannel = (
  document: AdmittedText,
  scope: TextChannelScope,
  onReceiveError: (error: unknown) => void,
): { close(): void } => {
  if (
    [scope.slotId, scope.principalId, scope.workspaceId].some(
      (value) => typeof value !== 'string' || !value,
    )
  )
    throw Error('A complete text channel scope is required.');
  const channel = new BroadcastChannel(
    'done/accepted-text/v1/' + JSON.stringify([scope.slotId, scope.principalId, scope.workspaceId]),
  );
  let closed = false;
  const unsubscribe = document.outgoing((bytes) => {
    if (!closed) channel.postMessage(bytes);
  });
  channel.onmessage = (event: MessageEvent<unknown>) => {
    if (closed) return;
    try {
      if (
        !(event.data instanceof Uint8Array) ||
        !(event.data.buffer instanceof ArrayBuffer) ||
        !event.data.length
      )
        throw Error('Invalid text-channel update.');
      const bytes = new Uint8Array(event.data.buffer, event.data.byteOffset, event.data.byteLength);
      void document.receive(bytes).accepted.catch(onReceiveError);
    } catch (error) {
      onReceiveError(error);
    }
  };
  channel.onmessageerror = onReceiveError;
  const stopStatus = document.onStatus((status) => {
    if (
      !['active', 'blocked'].includes(status.state) ||
      status.pressure?.code === 'repair-required'
    )
      close();
  });
  function close() {
    if (closed) return;
    closed = true;
    unsubscribe();
    stopStatus();
    channel.close();
  }
  return { close };
};
