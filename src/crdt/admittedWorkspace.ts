/** One admission owner and one human undo history for every workspace mutation surface. */
import { EditorSelection } from '@codemirror/state';
import {
  Y,
  applyUpdate,
  createHistoryDoc,
  workspaceUndo,
  forkWorkspaceHistory,
  type YUndoManager,
} from './yjs';
import {
  openAdmissionSession,
  type AdmissionOptions,
  type AdmissionSession,
  type AdmissionReceipt,
  type AdmissionStatus,
} from './admission';
import { type CustodyAuthority } from './custody';
import { type Bytes } from './custodyCrypto';
import { type WorkspaceActorIdentity, type Origin, listActors } from './actors';
import { readSettings } from './doc';
import {
  cardAt,
  cardBody,
  cardAuthor,
  cardOrigin,
  cardLocation,
  cardMembershipIssues,
  listDays,
  cardsIn,
} from './days';
import { currentDate, plainDate, type ISODate } from '../lib/date';
import { exportArchive, exportEntries } from './export';
import {
  runWorkspaceCommand,
  relativeSelection,
  resolveSelection,
  targetText,
  targetKey,
  editableTarget,
  type WorkspaceCommand,
  type WorkspaceIntent,
  type RelativeSelection,
  type TextTarget,
  type CommandValue,
} from './workspaceCommands';
import type { AdmittedTextSurface, TextAction, TextSelection } from '../editor/admittedText';

export type { WorkspaceCommand, TextTarget } from './workspaceCommands';
export interface WorkspaceTicket {
  readonly id: number;
  readonly accepted: Promise<AdmissionReceipt & { readonly value: CommandValue }>;
}
export interface WorkspaceSnapshot {
  readonly master: string;
  readonly cards: readonly {
    id: string;
    text: string;
    author: string;
    origin: string | null;
    location: ReturnType<typeof cardLocation>;
  }[];
  readonly days: readonly {
    date: ISODate;
    next: readonly string[];
    scheduled: readonly string[];
    done: readonly string[];
  }[];
  readonly actors: ReturnType<typeof listActors>;
  readonly settings: ReturnType<typeof readSettings>;
  readonly undo: number;
  readonly redo: number;
}
export interface AdmittedWorkspace {
  readonly status: AdmissionStatus;
  read(): WorkspaceSnapshot;
  command(command: WorkspaceCommand): WorkspaceTicket;
  text(target: TextTarget): AdmittedTextSurface;
  receive(bytes: Bytes): ReturnType<AdmissionSession['receive']>;
  snapshot(): Bytes;
  outgoing(listener: (bytes: Bytes) => void): () => void;
  subscribe(listener: () => void): () => void;
  onStatus: AdmissionSession['onStatus'];
  whenDurable: AdmissionSession['whenDurable'];
  retry: AdmissionSession['retry'];
  discardPending(): void;
  exportEntries(): ReturnType<typeof exportEntries>;
  exportArchive(): Bytes;
  close(): Promise<void>;
}
export interface WorkspaceOptions {
  readonly identity: WorkspaceActorIdentity;
  readonly validateReceive: AdmissionOptions['validateReceive'];
  readonly today?: () => ISODate;
  readonly signal?: AbortSignal;
}
export const openAdmittedWorkspace = (
  authority: CustodyAuthority,
  code: string,
  options: WorkspaceOptions,
) =>
  createAdmittedWorkspace(
    (config) =>
      openAdmissionSession(authority, code, {
        ...config,
        ...(options.signal ? { signal: options.signal } : {}),
      }),
    options,
  );
type State = {
  history: YUndoManager;
  selections: Map<string, RelativeSelection>;
  group: number;
  value: CommandValue;
};
const encode = (v: unknown): Bytes => new Uint8Array(new TextEncoder().encode(JSON.stringify(v)));
const dispose = (s: State | undefined) => {
  s?.history.destroy();
  s?.history.doc.destroy();
};
/** Internal seam for controlled carriers. Production always enters through the factor-unlocked factory. */
export const createAdmittedWorkspace = async (
  open: (options: AdmissionOptions) => Promise<AdmissionSession>,
  options: WorkspaceOptions,
): Promise<AdmittedWorkspace> => {
  const identity = structuredClone(options.identity);
  const human: Origin = Object.freeze({
    actor: identity.id,
    kind: 'human',
    device: identity.device.id,
  });
  const system: Origin = Object.freeze({
    actor: 'system',
    kind: 'system',
    device: identity.device.id,
  });
  const listeners = new Set<() => void>(),
    senders = new Set<(b: Bytes) => void>(),
    outcomes = new Map<number, CommandValue>();
  let accepted: State | undefined,
    pending: State | undefined,
    nextGroup = 0,
    closed = false,
    failure: unknown;
  const today = () => {
    const date =
      options.today?.() ??
      currentDate(accepted ? readSettings(accepted.history.doc.getMap('meta')).rolloverHour : 0);
    plainDate(date);
    return date;
  };
  const session = await open({
    validateReceive: options.validateReceive,
    prepare(draft, input) {
      if (!accepted) throw Error('Workspace recovery is not complete.');
      dispose(pending);
      pending = undefined;
      const intent = JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(input),
      ) as WorkspaceIntent;
      const history = forkWorkspaceHistory(accepted.history, human),
        doc = history.doc;
      doc.clientID = draft.clientID;
      const selections = structuredClone(accepted.selections);
      if (intent.group !== accepted.group) history.stopCapturing();
      const updates: Bytes[] = [];
      const capture = (bytes: Uint8Array) => updates.push(new Uint8Array(bytes));
      doc.on('update', capture);
      let humanItem: (typeof history.undoStack)[number] | undefined,
        popped: (typeof history.undoStack)[number] | undefined;
      const captureItem = (e: {
        origin: unknown;
        stackItem: (typeof history.undoStack)[number];
      }) => {
        if (e.origin === human) humanItem = e.stackItem;
      };
      history.on('stack-item-added', captureItem);
      history.on('stack-item-updated', captureItem);
      const capturePopped = (e: { stackItem: (typeof history.undoStack)[number] }) => {
        popped = e.stackItem;
      };
      history.on('stack-item-popped', capturePopped);
      try {
        const result = runWorkspaceCommand(
          history,
          intent,
          { identity, human, system, today: today() },
          selections,
        );
        if (humanItem) {
          if (!humanItem.meta.has('before'))
            humanItem.meta.set('before', structuredClone(accepted.selections));
          humanItem.meta.set('after', structuredClone(selections));
        }
        if (popped) {
          const undoing = intent.command.kind === 'undo';
          const target = (undoing ? history.redoStack : history.undoStack).at(-1);
          if (target) target.meta = structuredClone(popped.meta);
          const restore = popped.meta.get(undoing ? 'before' : 'after') as
            | Map<string, RelativeSelection>
            | undefined;
          if (restore) {
            selections.clear();
            for (const [key, value] of restore) selections.set(key, structuredClone(value));
          }
        }
        const update = new Uint8Array(updates.length ? Y.mergeUpdates(updates) : [0, 0]);
        try {
          applyUpdate(draft, update);
        } finally {
          update.fill(0);
        }
        pending = { history, selections, group: intent.group, value: result.value };
        return result.remaining ? { remaining: encode(result.remaining) } : undefined;
      } catch (error) {
        history.destroy();
        doc.destroy();
        throw error;
      } finally {
        doc.off('update', capture);
        history.off('stack-item-added', captureItem);
        history.off('stack-item-updated', captureItem);
        history.off('stack-item-popped', capturePopped);
        for (const b of updates) b.fill(0);
      }
    },
  });
  const live = () => {
    if (failure) throw failure;
    if (closed || !['active', 'blocked'].includes(session.status.state))
      throw Error('Workspace admission is closed.');
    if (session.status.pressure?.code === 'repair-required')
      throw Error('Workspace repair is required.');
  };
  const emit = () => {
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch {
        /* observer owned */
      }
    }
  };
  let closing: Promise<void> | undefined,
    repairQueued = false;
  const teardown = () => {
    dispose(pending);
    dispose(accepted);
    pending = accepted = undefined;
    outcomes.clear();
    listeners.clear();
    senders.clear();
  };
  const close = (): Promise<void> => {
    if (closing) return closing;
    let resolve!: () => void, reject!: (e: unknown) => void;
    closing = new Promise<void>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    closed = true;
    emit();
    void session.close().then(
      () => {
        teardown();
        resolve();
      },
      (e) => {
        teardown();
        reject(e);
      },
    );
    return closing;
  };
  const submit = (
    command: WorkspaceIntent['command'],
    split?: WorkspaceIntent['split'],
  ): WorkspaceTicket => {
    live();
    const group = ++nextGroup,
      bytes = encode({ command, group, ...(split ? { split } : {}) });
    try {
      const ticket = session.submit(bytes);
      const completed = ticket.accepted
        .then((receipt) => ({
          ...receipt,
          value: outcomes.has(group) ? outcomes.get(group)! : false,
        }))
        .finally(() => {
          outcomes.delete(group);
        });
      void completed.catch(() => {});
      return Object.freeze({ id: ticket.id, accepted: completed });
    } finally {
      bytes.fill(0);
    }
  };
  try {
    const doc = createHistoryDoc(),
      bytes = session.snapshot();
    try {
      applyUpdate(doc, bytes);
      accepted = {
        history: workspaceUndo(doc, human),
        selections: new Map(),
        group: 0,
        value: false,
      };
    } catch (error) {
      doc.destroy();
      throw error;
    } finally {
      bytes.fill(0);
    }
    session.subscribe((event) => {
      try {
        live();
        if (event.source === 'local') {
          if (!pending) throw Error('Accepted workspace command has no prepared history.');
          const previous = accepted;
          accepted = pending;
          pending = undefined;
          dispose(previous);
          outcomes.set(accepted.group, accepted.value);
        } else applyUpdate(accepted!.history.doc, event.update, 'received');
        emit();
        if (event.source === 'local')
          for (const send of [...senders]) {
            try {
              live();
              send(event.update.slice());
            } catch {
              /* sender owns retransmission */
            }
          }
        if (
          event.source === 'remote' &&
          !repairQueued &&
          cardMembershipIssues(accepted!.history.doc).length
        ) {
          repairQueued = true;
          queueMicrotask(() => {
            try {
              if (!closed)
                void submit({ kind: 'repair' })
                  .accepted.finally(() => {
                    repairQueued = false;
                  })
                  .catch(() => {});
            } catch (error) {
              repairQueued = false;
              failure = error;
              void close().catch(() => {});
            }
          });
        }
      } catch (error) {
        failure = error;
        void close().catch(() => {});
      }
    });
    session.onStatus((status) => {
      if (
        !['active', 'blocked'].includes(status.state) ||
        status.pressure?.code === 'repair-required'
      )
        emit();
      if (['closed', 'failed'].includes(status.state)) teardown();
    });
    const initialization = submit({ kind: 'initialize' });
    // A blocked initialization rejects this barrier instead of leaving an inaccessible pending ticket.
    await session.whenDurable();
    await initialization.accepted;
    live();
  } catch (error) {
    await close();
    throw error;
  }
  const read = (): WorkspaceSnapshot => {
    live();
    const history = accepted!.history,
      doc = history.doc;
    return {
      master: doc.getText('master').toString(),
      cards: [...doc.getMap('cards').keys()].sort().map((id) => {
        const c = cardAt(doc, id)!;
        return {
          id,
          text: cardBody(c),
          author: cardAuthor(c),
          origin: cardOrigin(c),
          location: cardLocation(doc, id),
        };
      }),
      days: listDays(doc).map((date) => ({
        date,
        next: cardsIn(doc, date, 'next').map((c) => c.get('id') as string),
        scheduled: cardsIn(doc, date, 'scheduled').map((c) => c.get('id') as string),
        done: cardsIn(doc, date, 'done').map((c) => c.get('id') as string),
      })),
      actors: structuredClone(listActors(doc)),
      settings: readSettings(doc.getMap('meta')),
      undo: history.undoStack.length,
      redo: history.redoStack.length,
    };
  };
  const api: AdmittedWorkspace = {
    get status() {
      return session.status;
    },
    read,
    command(command) {
      live();
      const captured = structuredClone(command);
      if (captured.kind === 'split') {
        const text = targetText(accepted!.history.doc, { kind: 'card', id: captured.id });
        const range = relativeSelection(
          text,
          EditorSelection.single(captured.at, captured.tailFrom ?? captured.at).toJSON(),
        ).ranges[0]!;
        return submit(captured, { at: range.anchor, tail: range.head });
      }
      return submit(captured);
    },
    receive: (bytes) => {
      live();
      return session.receive(bytes);
    },
    snapshot: () => {
      live();
      return session.snapshot();
    },
    subscribe: (listener) => {
      live();
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    outgoing: (listener) => {
      live();
      senders.add(listener);
      return () => {
        senders.delete(listener);
      };
    },
    onStatus: session.onStatus,
    whenDurable: session.whenDurable,
    retry: session.retry,
    discardPending: () => {
      session.discardPending();
      dispose(pending);
      pending = undefined;
    },
    exportEntries: () => {
      live();
      const doc = accepted!.history.doc;
      return exportEntries(doc, doc.getText('master').toString());
    },
    exportArchive: () => {
      live();
      const doc = accepted!.history.doc;
      return new Uint8Array(exportArchive(doc, doc.getText('master').toString()));
    },
    close,
    text(target) {
      const captured = structuredClone(target);
      return Object.freeze({
        get status() {
          return session.status;
        },
        read: () => {
          live();
          const doc = accepted!.history.doc,
            text = targetText(doc, captured);
          let selection: TextSelection;
          try {
            selection = resolveSelection(
              doc,
              text,
              accepted!.selections.get(targetKey(captured)),
            ).toJSON();
          } catch {
            selection = EditorSelection.single(0).toJSON();
          }
          return {
            text: text.toString(),
            selection,
            undo: accepted!.history.undoStack.length,
            redo: accepted!.history.redoStack.length,
            editable: editableTarget(doc, captured, today()),
          };
        },
        input(action: TextAction, selection?: TextSelection) {
          live();
          if (action.name === 'undo' || action.name === 'redo')
            return submit({ kind: action.name });
          const doc = accepted!.history.doc;
          if (!editableTarget(doc, captured, today()))
            throw Error('This card is frozen or no longer editable.');
          if (action.name === 'insert' && action.text.length > 1024 * 1024)
            throw Error('Split the input source before admission.');
          return submit({
            kind: 'text',
            target: captured,
            action: structuredClone(action),
            ...(selection
              ? { selection: relativeSelection(targetText(doc, captured), selection) }
              : {}),
          });
        },
        subscribe: api.subscribe,
        onStatus: api.onStatus,
        retry: api.retry,
        discardPending: api.discardPending,
      });
    },
  };
  return Object.freeze(api);
};
