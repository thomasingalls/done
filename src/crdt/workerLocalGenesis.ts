/** Fixed Local enrollment protocol. Original genesis owns every native/crypto/creation effect. */
import { beginLocalGenesis, type LocalGenesisEnrollment } from './localGenesis';
import { CustodyError } from './custody';
export function createWorkerLocalGenesis(slotId: string, signal: AbortSignal) {
  let sequence = 0,
    closed = false,
    current: { id: number; ceremony: LocalGenesisEnrollment } | undefined;
  const live = () => {
    if (closed || signal.aborted)
      throw new CustodyError('enrollment-closed', 'Local enrollment closed');
  };
  const close = () => {
    closed = true;
    current?.ceremony.cancel();
    current = undefined;
  };
  signal.addEventListener('abort', close, { once: true });
  return Object.freeze({
    begin(input: { id: number; automatic: boolean }) {
      live();
      if (
        current ||
        !Number.isSafeInteger(input.id) ||
        input.id !== sequence + 1 ||
        typeof input.automatic !== 'boolean'
      )
        throw new CustodyError('enrollment-closed', 'Local enrollment order changed');
      const ceremony = beginLocalGenesis(slotId, { signal, automatic: input.automatic });
      current = { id: input.id, ceremony };
      if (!ceremony.displayCode) {
        close();
        throw new CustodyError('enrollment-closed', 'Local enrollment did not issue a code');
      }
      sequence = input.id;
      return { code: ceremony.displayCode };
    },
    async confirm(input: { id: number; code: string }) {
      live();
      const flight = current;
      if (!flight || input.id !== flight.id || typeof input.code !== 'string')
        throw new CustodyError('enrollment-closed', 'Local enrollment changed');
      try {
        const receipt = await flight.ceremony.confirm(input.code);
        live();
        return receipt;
      } catch (cause) {
        if (cause instanceof Error && 'code' in cause && cause.code === 'confirmation-required')
          throw cause;
        flight.ceremony.cancel();
        if (current === flight) current = undefined;
        throw cause;
      } finally {
        if (current === flight && !flight.ceremony.displayCode) current = undefined;
      }
    },
    cancel(input: { id: number }) {
      live();
      if (!Number.isSafeInteger(input.id) || input.id < 1 || input.id > sequence)
        throw new CustodyError('enrollment-closed', 'Local cancellation order changed');
      if (current?.id === input.id) {
        current.ceremony.cancel();
        current = undefined;
      }
    },
    close() {
      close();
      signal.removeEventListener('abort', close);
    },
  });
}
