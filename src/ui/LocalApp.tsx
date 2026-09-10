import { useEffect, useState } from 'react';
import { createLocalStartup, type LocalStartup, type LocalStartupState } from './localStartup';
import type { StartupKind } from '../crdt/startupState';

const messages: Record<StartupKind, { title: string; detail: string }> = {
  fresh: {
    title: 'Your Local workspace',
    detail: 'Keep your writing encrypted in this browser. A device-lock code unlocks it.',
  },
  'unlock-required': {
    title: 'Unlock your workspace',
    detail: 'Enter your device-lock code to open the writing saved in this browser.',
  },
  'creation-pending': {
    title: 'Finish creating your workspace',
    detail: 'Enter the code you saved to continue the interrupted setup.',
  },
  'unlock-failed': {
    title: 'Could not unlock',
    detail:
      'Check your device-lock code and try again. If it is correct, the saved workspace may need repair.',
  },
  'migration-required': {
    title: 'Your existing writing needs migration',
    detail:
      'Keep your existing installation and verified export available. Migration must finish before this workspace can open here.',
  },
  clearing: {
    title: 'Workspace removal is unfinished',
    detail: 'Resume the existing removal procedure before opening this workspace.',
  },
  cleared: {
    title: 'This workspace was removed',
    detail: 'Its saved removal record prevents accidental recreation.',
  },
  'repair-required': {
    title: 'Your workspace needs attention',
    detail: 'Saved data is incomplete or unreadable. Keep your backups available for recovery.',
  },
  'slot-closed': {
    title: 'This workspace is closed',
    detail: 'It cannot be opened from this Local slot.',
  },
  'identity-required': {
    title: 'Workspace identity unavailable',
    detail:
      'The saved workspace could not be identified. Keep your backups available for recovery.',
  },
  busy: {
    title: 'Your workspace is busy',
    detail: 'Another operation is using this workspace. Try again after it finishes.',
  },
  unavailable: {
    title: 'Could not open your workspace',
    detail:
      'Browser storage is unavailable or setup did not finish. Try again when it is available.',
  },
  unsupported: {
    title: 'Required browser storage is unavailable',
    detail: 'Use a browser with secure storage, WebCrypto and Web Locks enabled.',
  },
  cancelled: { title: 'Workspace opening stopped', detail: 'Try again when you are ready.' },
};

const CodeForm = ({
  confirm,
  onSubmit,
}: {
  confirm: boolean;
  onSubmit: (code: string) => void;
}) => {
  const [code, setCode] = useState('');
  return (
    <form
      className="local-form"
      onSubmit={(event) => {
        event.preventDefault();
        const input = code;
        setCode('');
        onSubmit(input);
      }}
    >
      <label htmlFor="local-code">Device-lock code</label>
      <input
        id="local-code"
        type="password"
        value={code}
        autoComplete="off"
        spellCheck={false}
        autoCapitalize="none"
        onChange={(event) => setCode(event.target.value)}
        required
      />
      <button type="submit">{confirm ? 'Confirm and create' : 'Unlock'}</button>
    </form>
  );
};

/** Startup and read-only handoff. Editors are connected to the admitted workspace in the next phase. */
export const LocalApp = (): React.ReactElement => {
  const [epoch, setEpoch] = useState(0);
  const [owner, setOwner] = useState<LocalStartup | null>(null);
  const [state, setState] = useState<LocalStartupState>({ kind: 'checking' });
  useEffect(() => {
    const current = createLocalStartup();
    setOwner(current);
    setState(current.getSnapshot());
    const unsubscribe = current.subscribe(() => setState(current.getSnapshot()));
    void current.inspect();
    const retire = () => {
      void current.close().catch(() => {});
    };
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted)
        void current.close().then(
          () => setEpoch((value) => value + 1),
          () => setState({ kind: 'unavailable', reason: 'local-close-failed' }),
        );
    };
    window.addEventListener('pagehide', retire);
    window.addEventListener('pageshow', restore);
    return () => {
      unsubscribe();
      window.removeEventListener('pagehide', retire);
      window.removeEventListener('pageshow', restore);
      retire();
    };
  }, [epoch]);
  const restart = () => {
    if (!owner) return;
    void owner.close().then(
      () => setEpoch((value) => value + 1),
      () => setState({ kind: 'unavailable', reason: 'local-close-failed' }),
    );
  };
  let content: React.ReactNode;
  if (state.kind === 'checking' || state.kind === 'working' || state.kind === 'closing') {
    content = (
      <>
        <h1>{state.kind === 'closing' ? 'Locking your workspace…' : 'Opening your workspace…'}</h1>
        <p role="status">
          {state.kind === 'closing'
            ? 'Waiting for storage operations to finish.'
            : 'Checking encrypted storage.'}
        </p>
        {state.kind !== 'closing' && <button onClick={restart}>Cancel</button>}
      </>
    );
  } else if (state.kind === 'save-code') {
    content = (
      <>
        <h1>Save your device-lock code</h1>
        <p>
          Store this code somewhere safe outside this browser. You need it to reopen your workspace.
          Losing it can mean losing access to your writing.
        </p>
        <code className="local-generated-code" aria-label="Generated device-lock code">
          {state.code}
        </code>
        <button onClick={() => owner?.saved()}>I saved my code</button>
        <button className="local-secondary" onClick={restart}>
          Cancel
        </button>
      </>
    );
  } else if (state.kind === 'confirm-code') {
    content = (
      <>
        <h1>Confirm your saved code</h1>
        <p>Enter it from the copy you saved to create your encrypted workspace.</p>
        {state.error && <p role="alert">{state.error}</p>}
        <CodeForm
          confirm
          onSubmit={(code) => {
            void owner?.confirm(code);
          }}
        />
        <button className="local-secondary" onClick={restart}>
          Cancel
        </button>
      </>
    );
  } else if (state.kind === 'ready') {
    content = (
      <>
        <div className="local-preview-header">
          <h1>Your Local workspace</h1>
          <button onClick={restart}>Lock</button>
        </div>
        <p role="status">Unlocked · Read-only preview</p>
        {state.entries.every((entry) => !entry.content) && <p>Your workspace is empty.</p>}
        {state.entries
          .filter((entry) => entry.content)
          .map((entry) => (
            <section className="local-preview" key={entry.path}>
              <h2>
                {entry.path === 'master.md'
                  ? 'Goals'
                  : entry.path === 'unfiled.md'
                    ? 'Unfiled'
                    : entry.path.slice(5, -3)}
              </h2>
              <pre>{entry.content}</pre>
            </section>
          ))}
      </>
    );
  } else {
    const message = messages[state.kind];
    content = (
      <>
        <h1>{message.title}</h1>
        <p>{message.detail}</p>
        {state.kind === 'fresh' ? (
          <button onClick={() => owner?.begin()}>Create Local workspace</button>
        ) : ['unlock-required', 'creation-pending', 'unlock-failed'].includes(state.kind) ? (
          <CodeForm
            confirm={false}
            onSubmit={(code) => {
              void owner?.unlock(code);
            }}
          />
        ) : (
          <button onClick={restart}>Check again</button>
        )}
      </>
    );
  }
  return (
    <main className="local-startup" data-state={state.kind}>
      <div className="local-startup-panel">
        <span className="local-brand">done</span>
        {content}
      </div>
    </main>
  );
};
