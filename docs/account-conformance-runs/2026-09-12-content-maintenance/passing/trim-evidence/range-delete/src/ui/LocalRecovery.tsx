import { useEffect, useRef, useState } from 'react';
import { recoverLocalWriting } from '../crdt/localRecovery';
import { LOCAL_APP_SLOT } from './localStartup';

/** Explicit plaintext disclosure, separate from the still-refused editor. No automatic storage repair. */
export const LocalRecovery = () => {
  const [code, setCode] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const lifetime = useRef<AbortController | null>(null);
  useEffect(() => () => lifetime.current?.abort(), []);
  return (
    <details className="local-recovery">
      <summary>Recover readable writing</summary>
      <p>
        With your saved device-lock code, try a read-only partial export. It may omit writing and
        does not repair or reopen this workspace. Keep your browser data and existing backups.
      </p>
      <p>The downloaded ZIP contains plaintext writing. Keep it private.</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (busy) return;
          const input = code;
          setCode('');
          setBusy(true);
          setMessage('Reading retained encrypted records…');
          const controller = new AbortController();
          lifetime.current = controller;
          void recoverLocalWriting(LOCAL_APP_SLOT, input, { signal: controller.signal })
            .then((result) => {
              try {
                if (controller.signal.aborted) return;
                const url = URL.createObjectURL(
                  new Blob([result.archive], { type: 'application/zip' }),
                );
                try {
                  const link = document.createElement('a');
                  link.href = url;
                  link.download = 'done-partial-recovery.zip';
                  link.click();
                } finally {
                  URL.revokeObjectURL(url);
                }
                setMessage(
                  `Saved partial recovery: ${result.report.recoveredFiles} writing files; ${result.report.unreadableRecords} unreadable records. Completeness is not verified.`,
                );
              } finally {
                result.archive.fill(0);
              }
            })
            .catch(() => {
              if (!controller.signal.aborted)
                setMessage(
                  'Recovery could not complete. Check the code. Missing or damaged custody, an unsupported format, or unavailable storage may require your existing backup. Saved data was kept.',
                );
            })
            .finally(() => {
              if (!controller.signal.aborted) setBusy(false);
            });
        }}
      >
        <label>
          Recovery device-lock code
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            required
            disabled={busy}
          />
        </label>
        <button type="submit" disabled={busy}>
          Save partial recovery
        </button>
        {busy && (
          <button
            type="button"
            onClick={() => {
              lifetime.current?.abort();
              setBusy(false);
              setMessage('Recovery cancelled. Saved data was kept.');
            }}
          >
            Cancel recovery
          </button>
        )}
      </form>
      {message && <p role="status">{message}</p>}
    </details>
  );
};
