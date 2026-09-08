/** Goals text commands prepared privately, with history published only after admission. */
import { EditorSelection, EditorState, Transaction, Annotation } from '@codemirror/state';
import { history, undoDepth, redoDepth } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { indentUnit } from '@codemirror/language';
import { textCommands as commands } from './admittedCommands';
import { Y, createDoc, applyUpdate } from '../crdt/yjs';
import {
  openAdmissionSession,
  type AdmissionOptions,
  type AdmissionSession,
  type AdmissionStatus,
  type AdmissionTicket,
} from '../crdt/admission';
import type { CustodyAuthority } from '../crdt/custody';
import type { Bytes } from '../crdt/custodyCrypto';
import { exportEntries, exportArchive } from '../crdt/export';

export type TextAction =
  | { readonly name: 'insert'; readonly text: string }
  | {
      readonly name:
        | 'backspace'
        | 'delete'
        | 'enter'
        | 'indent'
        | 'outdent'
        | 'bold'
        | 'italic'
        | 'code'
        | 'strike'
        | 'task'
        | 'undo'
        | 'redo';
    };
export type TextSelection = ReturnType<EditorSelection['toJSON']>;
export interface TextSnapshot {
  readonly editable?: boolean;
  readonly text: string;
  readonly selection: TextSelection;
  readonly undo: number;
  readonly redo: number;
}
export interface AdmittedText {
  readonly status: AdmissionStatus;
  read(): TextSnapshot;
  /** Omit selection to follow the preceding accepted command's caret, even while queued. */
  input(action: TextAction, selection?: TextSelection): AdmissionTicket;
  receive(bytes: Bytes): AdmissionTicket;
  subscribe(listener: () => void): () => void;
  onStatus(listener: (status: AdmissionStatus) => void): () => void;
  /** Only locally accepted updates; remote receives are never echoed. */
  outgoing(listener: (bytes: Bytes) => void): () => void;
  exportEntries(): ReturnType<typeof exportEntries>;
  exportArchive(): Bytes;
  whenDurable(): Promise<void>;
  retry(): void;
  discardPending(): void;
  close(): Promise<void>;
}
/** A mounted text surface shares its owner's lifetime, transport and export. */
export type AdmittedTextSurface = Pick<
  AdmittedText,
  'status' | 'read' | 'input' | 'subscribe' | 'onStatus' | 'retry' | 'discardPending'
>;
const group = Annotation.define<number>();
const encoder = new TextEncoder(),
  decoder = new TextDecoder('utf-8', { fatal: true });
const encode = (value: unknown): Bytes => new Uint8Array(encoder.encode(JSON.stringify(value)));
type Anchor = ReturnType<typeof Y.createRelativePositionFromTypeIndex>;
type Intent = {
  action: TextAction;
  group: number;
  selection?: { ranges: { anchor: Anchor; head: Anchor }[]; main: number };
};
export interface AdmittedTextOptions {
  readonly validateReceive: AdmissionOptions['validateReceive'];
  readonly signal?: AbortSignal;
}
export const openAdmittedText = (
  authority: CustodyAuthority,
  code: string,
  options: AdmittedTextOptions,
): Promise<AdmittedText> =>
  createAdmittedText(
    (config) =>
      openAdmissionSession(authority, code, {
        ...config,
        ...(options.signal ? { signal: options.signal } : {}),
      }),
    options.validateReceive,
  );

/** Internal construction seam. The exported production factory always opens the real carriers. */
export const createAdmittedText = async (
  open: (options: AdmissionOptions) => Promise<AdmissionSession>,
  validateReceive: AdmissionOptions['validateReceive'],
): Promise<AdmittedText> => {
  const projection = createDoc(),
    text = projection.getText('master');
  const listeners = new Set<() => void>(),
    senders = new Set<(b: Bytes) => void>();
  let accepted!: EditorState,
    candidate: EditorState | undefined,
    preparing = 0,
    lastGroup = -1,
    nextGroup = 0;
  let failure: unknown,
    closed = false;
  const session = await open({
    validateReceive,
    prepare(draft, bytes) {
      const intent = JSON.parse(decoder.decode(bytes)) as Intent;
      const target = draft.getText('master');
      if (!accepted || target.toString() !== accepted.doc.toString())
        throw Error('Text projection is out of step with admission.');
      preparing = intent.group;
      let state = accepted;
      if (intent.selection) {
        const position = (anchor: Anchor) => {
          const resolved = Y.createAbsolutePositionFromRelativePosition(anchor, draft);
          if (!resolved || resolved.type !== target)
            throw Error('Text selection no longer resolves.');
          return resolved.index;
        };
        state = state.update({
          selection: EditorSelection.create(
            intent.selection.ranges.map((r) =>
              EditorSelection.range(position(r.anchor), position(r.head)),
            ),
            intent.selection.main,
          ),
        }).state;
      }
      let transaction: Transaction | undefined, remaining: Bytes | undefined;
      if (intent.action.name === 'insert') {
        // Bound ordinary paste slices without cutting a surrogate pair or a Yjs update.
        let end = Math.min(1000, intent.action.text.length);
        if (
          end < intent.action.text.length &&
          /[\uD800-\uDBFF]/u.test(intent.action.text[end - 1]!)
        )
          end--;
        transaction = state.update(state.replaceSelection(intent.action.text.slice(0, end)), {
          userEvent: 'input.type',
        });
        if (end < intent.action.text.length)
          remaining = encode({
            action: { name: 'insert', text: intent.action.text.slice(end) },
            group: intent.group,
          });
      } else {
        const command = commands[intent.action.name];
        if (!command) throw Error('Unknown text command.');
        command({
          state,
          dispatch: (tr) => {
            if (transaction) throw Error('A command dispatched twice.');
            transaction = tr;
          },
        });
      }
      candidate = transaction?.state ?? state;
      const edits: { from: number; to: number; insert: string }[] = [];
      transaction?.changes.iterChanges((from, to, _a, _b, insert) =>
        edits.push({ from, to, insert: insert.toString() }),
      );
      for (const edit of edits.reverse()) {
        // Reverse application preserves the command's original coordinates.
        if (edit.to > edit.from) target.delete(edit.from, edit.to - edit.from);
        if (edit.insert) target.insert(edit.from, edit.insert);
      }
      return remaining ? { remaining } : undefined;
    },
  }).catch((error) => {
    projection.destroy();
    throw error;
  });
  const live = () => {
    if (failure) throw failure;
    if (closed || !['active', 'blocked'].includes(session.status.state))
      throw Error('The text session is closed.');
    if (session.status.pressure?.code === 'repair-required')
      throw Error('Repair is required before ordinary text access.');
  };
  try {
    const recovered = session.snapshot();
    try {
      applyUpdate(projection, recovered);
    } finally {
      recovered.fill(0);
    }
    accepted = EditorState.create({
      doc: text.toString(),
      extensions: [
        markdown({ base: markdownLanguage, addKeymap: false }),
        indentUnit.of('  '),
        EditorState.allowMultipleSelections.of(true),
        history({
          newGroupDelay: Infinity,
          joinToEvent: (tr) => tr.annotation(group) === lastGroup,
        }),
        EditorState.transactionExtender.of(() => ({ annotations: group.of(preparing) })),
      ],
    });
  } catch (error) {
    await session.close();
    projection.destroy();
    throw error;
  }
  const emit = () => {
    for (const fn of [...listeners]) {
      try {
        fn();
      } catch {
        /* observer owned */
      }
    }
  };
  const stop = session.subscribe((event) => {
    try {
      const edits: { from: number; to: number; insert: string }[] = [];
      const observe = (event: Y.YTextEvent) => {
        let at = 0;
        for (const part of event.delta) {
          if (part.retain) at += part.retain;
          if (part.delete) {
            edits.push({ from: at, to: at + part.delete, insert: '' });
            at += part.delete;
          }
          if (part.insert !== undefined) {
            if (typeof part.insert !== 'string')
              throw Error('Goals text contains a non-text embed.');
            edits.push({ from: at, to: at, insert: part.insert });
          }
        }
      };
      text.observe(observe);
      try {
        applyUpdate(projection, event.update);
      } finally {
        text.unobserve(observe);
      }
      if (event.source === 'local') {
        if (!candidate || candidate.doc.toString() !== text.toString())
          throw Error('Accepted command projection mismatch.');
        accepted = candidate;
        candidate = undefined;
        lastGroup = preparing;
      } else
        accepted = accepted.update({
          changes: edits,
          annotations: Transaction.addToHistory.of(false),
        }).state;
      if (accepted.doc.toString() !== text.toString())
        throw Error('Accepted receive projection mismatch.');
      emit();
      if (event.source === 'local')
        for (const send of [...senders]) {
          try {
            live();
            send(event.update.slice());
          } catch {
            /* sender owns retry */
          }
        }
    } catch (error) {
      failure = error;
      candidate = undefined;
      void session.close().catch(() => {});
      emit();
    }
  });
  let closing: Promise<void> | undefined;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    projection.destroy();
    accepted = EditorState.create();
    candidate = undefined;
    listeners.clear();
    senders.clear();
  };
  const stopStatus = session.onStatus(() => {
    if (
      !['active', 'blocked'].includes(session.status.state) ||
      session.status.pressure?.code === 'repair-required'
    ) {
      candidate = undefined;
      emit();
    }
    if (['closed', 'failed'].includes(session.status.state)) dispose();
  });
  return Object.freeze({
    get status() {
      return session.status;
    },
    read: () => {
      live();
      return {
        text: accepted.doc.toString(),
        selection: accepted.selection.toJSON(),
        undo: undoDepth(accepted),
        redo: redoDepth(accepted),
      };
    },
    input(action: TextAction, selection?: TextSelection) {
      live();
      if (!action || (action.name !== 'insert' && !Object.hasOwn(commands, action.name)))
        throw Error('Unknown text command.');
      if (
        action.name === 'insert' &&
        (typeof action.text !== 'string' || action.text.length > 1024 * 1024)
      )
        throw Error('Input is too large; split the source before submitting.');
      const intent: Intent = { action, group: ++nextGroup };
      if (selection) {
        const selected = EditorSelection.fromJSON(selection);
        selected.ranges.forEach((r) => {
          if (r.from < 0 || r.to > text.length) throw Error('Invalid text selection.');
        });
        const anchor = (index: number) => Y.createRelativePositionFromTypeIndex(text, index);
        intent.selection = {
          ranges: selected.ranges.map((r) => ({ anchor: anchor(r.anchor), head: anchor(r.head) })),
          main: selected.mainIndex,
        };
      }
      const bytes = encode(intent);
      try {
        return session.submit(bytes);
      } finally {
        bytes.fill(0);
      }
    },
    receive: (bytes: Bytes) => {
      live();
      return session.receive(bytes);
    },
    subscribe: (fn: () => void) => {
      live();
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    onStatus: session.onStatus,
    outgoing: (fn: (bytes: Bytes) => void) => {
      live();
      senders.add(fn);
      return () => {
        senders.delete(fn);
      };
    },
    exportEntries: () => {
      live();
      return exportEntries(projection, text.toString());
    },
    exportArchive: () => {
      live();
      return new Uint8Array(exportArchive(projection, text.toString()));
    },
    whenDurable: session.whenDurable,
    retry: session.retry,
    discardPending: () => {
      session.discardPending();
      candidate = undefined;
    },
    close: () => {
      if (closing) return closing;
      let resolve!: () => void, reject!: (error: unknown) => void;
      closing = new Promise<void>((yes, no) => {
        resolve = yes;
        reject = no;
      });
      closed = true;
      candidate = undefined;
      stop();
      stopStatus();
      emit();
      listeners.clear();
      senders.clear();
      void session.close().then(
        () => {
          dispose();
          resolve();
        },
        (error) => {
          dispose();
          reject(error);
        },
      );
      return closing;
    },
  });
};
