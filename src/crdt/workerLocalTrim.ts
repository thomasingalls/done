/** Actual Local native compactor owns verification/coverage; this only moves its audited ciphertext. */
import { viewStoredRecord, recordStore } from './contentRecord';
import { createWorkerFrameStream } from './workerFrameStream';
import { MaintenanceInterrupted } from './contentMaintenance';
import { WorkerChannelError, type WorkerChannel } from './workerChannel';
import type { DiskState, ContentCompactionReceipt } from './contentCompaction';
import type { StoredRecord } from './contentRecord';
export type LocalMaintenanceReply =
  | { kind: 'interrupted' }
  | { kind: 'complete'; receipt: ContentCompactionReceipt };
export function createWorkerLocalMaintenance(
  compact: (
    interrupt: AbortSignal,
    commit: (audit: DiskState, covered: StoredRecord[], observation: number) => Promise<boolean>,
  ) => Promise<ContentCompactionReceipt>,
  channel: Pick<WorkerChannel, 'request'>,
  live: () => void,
) {
  let sequence = 0,
    active: { id: number; stop: AbortController } | undefined,
    closed = false;
  const current = () => {
    live();
    if (closed) throw Error('Local maintenance closed');
  };
  return Object.freeze({
    async run(input: { id: number }): Promise<LocalMaintenanceReply> {
      current();
      if (!Number.isSafeInteger(input.id) || input.id !== sequence + 1 || active)
        throw Error('Local maintenance order changed');
      sequence = input.id;
      const flight = { id: sequence, stop: new AbortController() };
      active = flight;
      const check = () => {
        current();
        if (flight.stop.signal.aborted) throw new MaintenanceInterrupted();
      };
      const send = async <T>(method: string, value?: unknown): Promise<T> => {
        check();
        try {
          const result = await channel.request<T>(method, value);
          check();
          return result;
        } catch (cause) {
          // A Window foreground interrupt aborts its final native transaction before its reply.
          // Known storage/integrity codes retain priority over concurrent discretionary cancellation.
          if (
            flight.stop.signal.aborted &&
            cause instanceof WorkerChannelError &&
            cause.code === 'operation-refused'
          )
            throw new MaintenanceInterrupted();
          throw cause;
        }
      };
      try {
        const receipt = await compact(flight.stop.signal, async (audit, covered, observation) => {
          if (!audit.counter) throw Error('Authenticated Local counter missing');
          await send('trimBegin', { counter: audit.counter, rows: audit.rows.length });
          const coverage = new Set(covered.map((r) => r.seq));
          for (const row of audit.rows) {
            check();
            const record = viewStoredRecord(row.value);
            if (row.key !== record.seq || row.store !== recordStore(record.kind))
              throw Error('Authenticated Local row scope changed');
            const { ct, ...header } = record;
            await send('trimRow', {
              ...header,
              store: row.store,
              key: row.key,
              total: ct.length,
              covered: row.store === 'content' && coverage.has(record.seq),
            });
            // Ownership of this audited ciphertext transfers after verification/coverage comparison.
            // The native compactor never reads this audit again, even if the final census changed.
            const stream = createWorkerFrameStream([ct], ct.length);
            try {
              for (;;) {
                const part = stream.next();
                try {
                  await send('trimPart', part);
                } finally {
                  part.bytes.fill(0);
                }
                if (part.done) break;
              }
            } finally {
              stream.close();
            }
          }
          return send<boolean>('trimCommit', { observation });
        });
        check();
        return { kind: 'complete', receipt };
      } catch (cause) {
        if (cause instanceof MaintenanceInterrupted) return { kind: 'interrupted' };
        throw cause;
      } finally {
        if (active === flight) active = undefined;
      }
    },
    cancel(input: { id: number }) {
      current();
      if (!Number.isSafeInteger(input.id) || input.id < 1 || input.id > sequence)
        throw Error('Local cancellation order changed');
      if (active?.id === input.id) active.stop.abort();
    },
    close() {
      closed = true;
      active?.stop.abort();
    },
  });
}
