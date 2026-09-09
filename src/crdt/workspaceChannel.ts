/** Participating same-origin tabs exchange accepted state through the receive carrier. */
import type { AdmittedWorkspace } from './admittedWorkspace';
export interface WorkspaceChannelScope {
  readonly slotId: string;
  readonly principalId: string;
  readonly workspaceId: string;
}
export const connectWorkspaceChannel = (
  workspace: AdmittedWorkspace,
  scope: WorkspaceChannelScope,
  onReceiveError: (error: unknown) => void,
): { close(): void } => {
  if (
    [scope.slotId, scope.principalId, scope.workspaceId].some(
      (value) => typeof value !== 'string' || !value,
    )
  )
    throw Error('A complete workspace channel scope is required.');
  // Validate the owner's lifetime before allocating a channel or retaining listeners.
  // State updates include unresolved structs and deletion sets. The pinned Yjs wake-up repair
  // lets a receiver finish this handoff from later original basis without another donor snapshot.
  const initial = workspace.snapshot();
  const channel = new BroadcastChannel(
    'done/accepted-workspace/v1/' +
      JSON.stringify([scope.slotId, scope.principalId, scope.workspaceId]),
  );
  let closed = false;
  const send = (bytes: Uint8Array) => {
    if (!closed) channel.postMessage({ kind: 'update', bytes });
  };
  const unsubscribe = workspace.outgoing(send);
  channel.onmessage = (event: MessageEvent<unknown>) => {
    if (closed) return;
    try {
      const value = event.data as { kind?: unknown; bytes?: unknown } | null;
      if (value?.kind === 'hello') {
        // Bootstrap can precede channel creation. Its structs may be dependencies of later edits.
        const bytes = workspace.snapshot();
        try {
          send(bytes);
        } finally {
          bytes.fill(0);
        }
      } else if (
        value?.kind === 'update' &&
        value.bytes instanceof Uint8Array &&
        value.bytes.buffer instanceof ArrayBuffer &&
        value.bytes.length
      ) {
        // The owner checks its queue budget before making its private copy.
        const bytes = new Uint8Array(
          value.bytes.buffer,
          value.bytes.byteOffset,
          value.bytes.byteLength,
        );
        void workspace.receive(bytes).accepted.catch(onReceiveError);
      } else throw Error('Invalid workspace-channel message.');
    } catch (error) {
      onReceiveError(error);
    }
  };
  channel.onmessageerror = onReceiveError;
  const stopStatus = workspace.onStatus((status) => {
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
  // Send both ways: older peers need this tab's initialization, too.
  try {
    send(initial);
    channel.postMessage({ kind: 'hello' });
  } catch (error) {
    close();
    throw error;
  } finally {
    initial.fill(0);
  }
  return { close };
};
