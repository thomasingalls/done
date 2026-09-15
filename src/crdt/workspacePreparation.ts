/** Private composition capability. Never exported by an application workspace. */
import { Y, type YUndoManager } from './yjs';
import type { Bytes } from './custodyCrypto';
import type { SourceUpdate } from './sourceCapture';
import type { CommandValue, RelativeSelection } from './workspaceCommands';

export interface PreparationHead {
  readonly kind: 'local' | 'remote';
  readonly job: object;
  readonly slice: number;
  readonly revision: number;
  readonly writer: number;
}
declare const contextBrand: unique symbol;
export interface PreparationContext {
  readonly [contextBrand]: true;
  readonly slice: number;
  readonly revision: number;
  readonly writer: number;
}
export interface PreparedWorkspaceState {
  readonly history: YUndoManager;
  readonly selections: Map<string, RelativeSelection>;
  readonly group: number;
  readonly value: CommandValue;
}
export interface PreparationBytes {
  readonly update: Bytes;
  readonly remaining?: Bytes;
  readonly sources?: readonly SourceUpdate[];
}
export interface PreparedWorkspace extends PreparationBytes {
  readonly state: PreparedWorkspaceState;
  readonly carrierBytes?: Bytes;
}
export interface PreparationScope {
  /** Transfer a fresh, detached history immediately after construction, before running commands. */
  ownState(state: PreparedWorkspaceState): void;
  /** Register temporary buffers as they are created, so a thrown command cannot leak them. */
  ownBytes(bytes: Bytes): Bytes;
}
/** Explicit internal constructor registration; absent from application/transport workspace APIs. */
export const localWorkspacePreparation: unique symbol = Symbol('localWorkspacePreparation');
export interface LocalWorkspacePreparation {
  verifiedRevision(): number;
  command(context: PreparationContext, input: Bytes, scope: PreparationScope): PreparationBytes;
  accept(state: PreparedWorkspaceState, revision: number): void;
  fail(cause: unknown): void;
}
type Phase = 'issued' | 'preparing' | 'prepared' | 'adopting' | 'adopted';
type Slot = {
  readonly context: PreparationContext;
  readonly head: PreparationHead;
  readonly buffers: Set<Bytes>;
  phase: Phase;
  users: number;
  invalid: boolean;
  state?: PreparedWorkspaceState;
  prepared?: PreparedWorkspace;
};
const synchronous = <T>(value: T, late?: (value: T) => void): T => {
  if (value && (typeof value === 'object' || typeof value === 'function') && 'then' in value) {
    void Promise.resolve(value)
      .then(late)
      .catch(() => {});
    throw Error('Preparation callbacks must be synchronous');
  }
  return value;
};
const returnedBuffers = (value: PreparationBytes): Bytes[] =>
  [
    value?.update,
    value?.remaining,
    ...(Array.isArray(value?.sources) ? value.sources.map((s) => s?.bytes) : []),
  ].filter((bytes): bytes is Bytes => bytes instanceof Uint8Array);

/** The queue owns head(); the workspace owns verifiedRevision(). Both must be synchronous reads.
 * Callbacks are trusted internal composition code, not a sandbox for arbitrary JavaScript.
 * A successful verification callback must perform the complete canonical-state comparison. */
export const createWorkspacePreparation = (options: {
  head(): PreparationHead | undefined;
  verifiedRevision(): number;
}) => {
  let slot: Slot | undefined,
    closed = false,
    disposing = false,
    cleanupError: unknown,
    closing: Promise<void> | undefined,
    resolveClose: (() => void) | undefined,
    rejectClose: ((error: unknown) => void) | undefined;
  // Remember transferred histories too: a late callback must not destroy accepted state.
  const knownDocs = new WeakSet<Y.Doc>();
  const destroy = (state: PreparedWorkspaceState) => {
    try {
      state.history.destroy();
    } finally {
      state.history.doc.destroy();
    }
  };
  const drain = () => {
    if (disposing) return;
    if (slot?.invalid && !slot.users) {
      const old = slot;
      slot = undefined;
      disposing = true;
      try {
        const errors: unknown[] = [];
        for (const bytes of old.buffers) {
          try {
            bytes.fill(0);
          } catch (error) {
            errors.push(error);
          }
        }
        try {
          if (old.state) destroy(old.state);
        } catch (error) {
          errors.push(error);
        }
        if (errors.length) throw new AggregateError(errors, 'Preparation cleanup failed');
      } catch (error) {
        cleanupError = error;
        closed = true;
      } finally {
        old.buffers.clear();
        delete old.state;
        delete old.prepared;
        disposing = false;
      }
    }
    if (closed && !slot) {
      if (cleanupError) rejectClose?.(cleanupError);
      else resolveClose?.();
    }
  };
  const live = () => {
    if (closed || disposing) throw Error('Preparation owner is closed');
  };
  const current = (context: PreparationContext, phase: Phase): Slot => {
    live();
    if (!slot || slot.context !== context || slot.invalid || slot.phase !== phase)
      throw Error('Unknown, consumed or busy preparation context');
    return slot;
  };
  const basis = (entry: Slot, promoted = false) => {
    live();
    const head = options.head();
    if (
      entry.invalid ||
      !head ||
      head.kind !== 'local' ||
      head.job !== entry.head.job ||
      head.slice !== entry.head.slice ||
      head.writer !== entry.head.writer ||
      head.revision !== entry.head.revision + (promoted ? 1 : 0) ||
      options.verifiedRevision() !== entry.head.revision
    )
      throw Error('Preparation basis is stale or mismatched');
  };
  const abandon = (entry: Slot) => {
    entry.invalid = true;
    drain();
  };
  const issue = (): PreparationContext => {
    live();
    if (slot) throw Error('A preparation already owns the head');
    const head = options.head();
    if (
      !head ||
      head.kind !== 'local' ||
      !head.job ||
      typeof head.job !== 'object' ||
      ![head.slice, head.revision, head.writer].every(Number.isSafeInteger) ||
      head.slice < 0 ||
      head.revision < 0 ||
      head.revision >= Number.MAX_SAFE_INTEGER ||
      head.writer < 0 ||
      head.writer > 0xffffffff ||
      head.revision !== options.verifiedRevision()
    )
      throw Error('No verified local preparation head');
    const context = Object.freeze({
      slice: head.slice,
      revision: head.revision,
      writer: head.writer,
    }) as PreparationContext;
    slot = {
      context,
      head: { ...head },
      buffers: new Set(),
      phase: 'issued',
      users: 0,
      invalid: false,
    };
    return context;
  };
  const prepare = (
    context: PreparationContext,
    intent: Bytes,
    limit: number,
    command: (
      context: PreparationContext,
      input: Bytes,
      scope: PreparationScope,
    ) => PreparationBytes,
    verify: (prepared: PreparedWorkspace) => boolean,
    capture?: (prepared: PreparedWorkspace) => Bytes,
  ): void => {
    const entry = current(context, 'issued');
    entry.phase = 'preparing';
    entry.users++;
    let input: Bytes | undefined;
    const scope: PreparationScope = Object.freeze({
      ownState(state: PreparedWorkspaceState) {
        if (!(state.history instanceof Y.UndoManager)) throw Error('Invalid prepared history');
        if (knownDocs.has(state.history.doc)) throw Error('History was already owned');
        knownDocs.add(state.history.doc);
        if (entry.invalid || entry.phase !== 'preparing' || closed || entry.state) {
          destroy(state);
          throw Error('Preparation cannot acquire a history now');
        }
        entry.state = state;
      },
      ownBytes(bytes: Bytes): Bytes {
        if (!(bytes instanceof Uint8Array)) throw Error('Invalid preparation bytes');
        if (input && bytes.buffer === input.buffer)
          throw Error('Prepared bytes alias borrowed input');
        if (entry.invalid || entry.phase !== 'preparing' || closed) {
          if (!entry.buffers.has(bytes)) bytes.fill(0);
          throw Error('Preparation cannot acquire bytes now');
        }
        entry.buffers.add(bytes);
        return bytes;
      },
    });
    try {
      basis(entry);
      if (
        !(intent instanceof Uint8Array) ||
        !intent.length ||
        !Number.isSafeInteger(limit) ||
        limit < 2
      )
        throw Error('Invalid preparation input or limit');
      input = intent.slice();
      const result = synchronous(command(context, input, scope), (late) => {
        for (const bytes of returnedBuffers(late)) bytes.fill(0);
      });
      // Acquire the entire returned set before any validation can throw or observe cancellation.
      for (const bytes of returnedBuffers(result)) entry.buffers.add(bytes);
      const update = scope.ownBytes(result.update),
        remaining = result.remaining === undefined ? undefined : scope.ownBytes(result.remaining),
        sources = result.sources?.map((source) =>
          Object.freeze({ ...source, bytes: scope.ownBytes(source.bytes) }),
        );
      basis(entry);
      if (
        !entry.state ||
        entry.state.history.doc.isDestroyed ||
        entry.state.history.doc.clientID !== context.writer
      )
        throw Error('Missing, destroyed or wrong-writer prepared history');
      if (
        update.length < 2 ||
        update.length > limit ||
        (remaining && (!remaining.length || remaining.length >= intent.length)) ||
        (sources && sources.length > 64)
      )
        throw Error('Prepared update, remainder or source count exceeds its bound');
      const prepared = Object.freeze({
        state: entry.state,
        update,
        ...(remaining ? { remaining } : {}),
        ...(sources ? { sources: Object.freeze(sources) } : {}),
      });
      if (synchronous(verify(prepared)) !== true) throw Error('Prepared state verification failed');
      basis(entry);
      const carrierBytes = capture
        ? scope.ownBytes(
            synchronous(capture(prepared), (late) => {
              if (late instanceof Uint8Array) late.fill(0);
            }),
          )
        : undefined;
      basis(entry);
      input.fill(0);
      entry.prepared = Object.freeze({ ...prepared, ...(carrierBytes ? { carrierBytes } : {}) });
      entry.phase = 'prepared';
    } catch (error) {
      abandon(entry);
      throw error;
    } finally {
      try {
        input?.fill(0);
      } catch (error) {
        cleanupError = error;
        closed = true;
        entry.invalid = true;
      } finally {
        entry.users--;
        drain();
      }
    }
  };
  /** Borrow through one synchronous journal append or awaited content write. Release in finally.
   * Cancellation revokes authority immediately, but cannot wipe an in-flight write's references. */
  const borrow = (context: PreparationContext) => {
    const entry = current(context, 'prepared');
    try {
      basis(entry);
    } catch (error) {
      abandon(entry);
      throw error;
    }
    if (entry.users) throw Error('Preparation is already borrowed');
    entry.users++;
    let released = false;
    return Object.freeze({
      prepared: entry.prepared!,
      release() {
        if (released) return;
        released = true;
        entry.users--;
        drain();
      },
    });
  };
  /** Called only after durable canonical promotion, before any UI/transport publication. The head
   * must still name this job/slice at exactly the next revision. Failed verification is terminal. */
  const adopt = (context: PreparationContext, verify: (prepared: PreparedWorkspace) => boolean) => {
    const entry = current(context, 'prepared');
    if (entry.users) throw Error('Release the write before adopting preparation');
    entry.users++;
    entry.phase = 'adopting';
    try {
      basis(entry, true);
      if (synchronous(verify(entry.prepared!)) !== true)
        throw Error('Promoted state verification failed');
      basis(entry, true);
      const state = entry.state!;
      delete entry.state;
      entry.phase = 'adopted';
      return state;
    } catch (error) {
      closed = true;
      abandon(entry);
      throw error;
    } finally {
      entry.users--;
      drain();
    }
  };
  return Object.freeze({
    issue,
    prepare,
    borrow,
    adopt,
    /** Copy any remaining intent before finishing. The adopted history belongs to the workspace. */
    finish(context: PreparationContext) {
      abandon(current(context, 'adopted'));
    },
    discard(context: PreparationContext) {
      live();
      if (!slot || slot.context !== context) throw Error('Unknown preparation context');
      abandon(slot);
    },
    close(): Promise<void> {
      if (!closing) {
        closing = new Promise<void>((resolve, reject) => {
          resolveClose = resolve;
          rejectClose = reject;
        });
        void closing.catch(() => {});
        closed = true;
        if (slot) abandon(slot);
        drain();
      }
      return closing;
    },
  });
};
