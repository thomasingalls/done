/**
 * The relay's copy of a document, on disk.
 *
 * **This is not a backup** (TRD §7.2). Every device holds a full replica and
 * the export is the backup story; deleting this directory loses nothing that
 * isn't on a phone or a laptop already.
 *
 * What it buys is that a restart is invisible. The relay's job is to hold what
 * one device sent until the other connects, and that window is measured in
 * hours — long enough to contain a deploy or a reboot. Without a file, a
 * restart in that window means the phone's morning edits wait for the phone to
 * come back before the laptop can see them. Nothing is lost either way; the
 * file is the difference between "eventually" and "when you open the laptop".
 *
 * `@y/websocket-server` drops a document from memory when its last connection
 * closes, so writes happen at exactly the moment the state would otherwise be
 * discarded, plus a debounce while connections are live.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as Y from 'yjs';

/** Matches `@y/websocket-server`'s `setPersistence` argument. */
export interface Persistence {
  bindState: (docName: string, doc: Y.Doc) => void;
  writeState: (docName: string, doc: Y.Doc) => Promise<void>;
  provider: null;
}

const WRITE_DEBOUNCE_MS = 2_000;

export const filePersistence = (directory: string): Persistence => {
  mkdirSync(directory, { recursive: true });

  const pending = new Map<string, NodeJS.Timeout>();
  const fileFor = (docName: string): string => join(directory, `${docName}.ydoc`);

  const write = (docName: string, doc: Y.Doc): void => {
    const timer = pending.get(docName);
    if (timer) {
      clearTimeout(timer);
      pending.delete(docName);
    }

    const file = fileFor(docName);
    const temporary = `${file}.tmp`;
    // Written whole and renamed into place: a relay killed mid-write leaves the
    // previous state rather than a truncated one, and the doc's own history is
    // the thing being written — a partial file would not merge, it would fail
    // to decode.
    writeFileSync(temporary, Y.encodeStateAsUpdate(doc));
    renameSync(temporary, file);
  };

  return {
    /**
     * Read synchronously, before the caller sends its first sync step. Async
     * would work — a late load reaches the client as an ordinary update — but
     * it would make the relay's first message depend on disk timing, which is
     * a hard thing to reason about and a harder thing to reproduce.
     */
    bindState: (docName, doc) => {
      try {
        Y.applyUpdate(doc, readFileSync(fileFor(docName)), 'persistence');
      } catch (cause) {
        const code = (cause as NodeJS.ErrnoException).code;
        // A room nobody has synced yet has no file. Anything else is worth
        // saying out loud, and is still not fatal: the connecting client holds
        // a full replica and will hand it over in a moment.
        if (code !== 'ENOENT') console.error(`relay: could not read ${docName}:`, cause);
      }

      doc.on('update', () => {
        if (pending.has(docName)) return;
        pending.set(
          docName,
          setTimeout(() => write(docName, doc), WRITE_DEBOUNCE_MS),
        );
      });
    },

    writeState: (docName, doc) => {
      write(docName, doc);
      return Promise.resolve();
    },

    provider: null,
  };
};

/** Flushes every pending write. Used on shutdown, where a debounce is a loss. */
export const flush = (persistence: Persistence, documents: Map<string, Y.Doc>): void => {
  for (const [name, doc] of documents) void persistence.writeState(name, doc);
};
