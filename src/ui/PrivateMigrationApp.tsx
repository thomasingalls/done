import { useEffect, useState } from 'react';
import {
  createPrivateMigration,
  type PrivateMigration,
  type PrivateMigrationState,
} from './privateMigration';

export const PrivateMigrationApp = () => {
  const [owner, setOwner] = useState<PrivateMigration | null>(null);
  const [state, setState] = useState<PrivateMigrationState | null>(null);
  const [ack, setAck] = useState(false);
  const [packet, setPacket] = useState<File | null>(null);
  const [binding, setBinding] = useState<File | null>(null);
  const [code, setCode] = useState('');
  useEffect(() => {
    const current = createPrivateMigration();
    setOwner(current);
    setState(current.getSnapshot());
    const off = current.subscribe(() => setState(current.getSnapshot()));
    const retire = () => {
      void current.close();
    };
    const restored = (event: PageTransitionEvent) => {
      if (event.persisted) location.reload();
    };
    window.addEventListener('pagehide', retire);
    window.addEventListener('pageshow', restored);
    return () => {
      off();
      retire();
      window.removeEventListener('pagehide', retire);
      window.removeEventListener('pageshow', restored);
    };
  }, []);
  if (!state || !owner) return null;
  const inspection = state.inspection;
  const retained = inspection?.kind === 'unlock-required';
  const selected = inspection?.kind === 'selected';
  const importing = inspection?.kind === 'import';
  const download = (kind: 'recovery' | 'binding' | 'markdown') => {
    const bytes = owner.download(kind);
    const url = URL.createObjectURL(
      new Blob([bytes], { type: kind === 'markdown' ? 'application/zip' : 'application/json' }),
    );
    bytes.fill(0);
    const link = document.createElement('a');
    link.href = url;
    link.download =
      kind === 'markdown' ? 'done-migration-preview.zip' : `done-migration-${kind}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  const leave = async (target: string) => {
    setCode('');
    setPacket(null);
    setBinding(null);
    await owner.close();
    location.assign(target);
  };
  const codeForm = (confirm: boolean) => (
    <form
      className="local-form"
      onSubmit={(event) => {
        event.preventDefault();
        const saved = code;
        setCode('');
        void (confirm ? owner.confirm(saved) : owner.unlock(saved));
      }}
    >
      <label htmlFor="migration-code">Device-lock code</label>
      <input
        id="migration-code"
        type="password"
        autoComplete="off"
        spellCheck={false}
        autoCapitalize="none"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        required
      />
      <button type="submit">{confirm ? 'Confirm and begin import' : 'Unlock migration'}</button>
    </form>
  );
  return (
    <main className="local-startup" data-migration-phase={state.phase}>
      <section className="local-startup-panel">
        <p className="local-brand">done · private development utility</p>
        <h1>Move this browser’s writing to Local</h1>
        <p>
          Import preserves Markdown content and order. Card identities and attribution are replaced;
          preferences and editing history are not restored. Source deletion is a later, separate
          step.
        </p>
        <fieldset disabled={state.busy} style={{ border: 0, padding: 0, minWidth: 0 }}>
          {state.phase === 'host' && (
            <>
              <p>
                Use the original source origin. Retire its old service worker without clearing site
                data. Keep the verified backups outside this browser.
              </p>
              <label>
                <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> I
                stopped editing, disconnected the relay, and closed all other done tabs and app
                windows.
              </label>
              <p>
                This is your operator confirmation. This page cannot establish that another old
                client will not return.
              </p>
              <button disabled={!ack} onClick={() => void owner.acknowledgeHost()}>
                Check this browser
              </button>
            </>
          )}
          {state.phase === 'files' && (
            <>
              {inspection?.kind === 'unused' && (
                <>
                  <h2>Capture the existing source</h2>
                  <button onClick={() => void owner.capture()}>Capture recovery files</button>
                </>
              )}
              {inspection?.kind === 'owner-required' ? (
                <p>
                  This slot belongs to {inspection.owner}. Resume that owner’s procedure; this
                  utility will not replace it.
                </p>
              ) : (
                <>
                  <h2>
                    {retained
                      ? 'Resume with the original saved files'
                      : 'Verify saved recovery files'}
                  </h2>
                  <form
                    className="local-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (packet && binding) {
                        void owner.load(packet, binding);
                        setPacket(null);
                        setBinding(null);
                        event.currentTarget.reset();
                      }
                    }}
                  >
                    <label>
                      Recovery packet
                      <input
                        type="file"
                        accept=".json"
                        required
                        onChange={(e) => setPacket(e.target.files?.[0] ?? null)}
                      />
                    </label>
                    <label>
                      Saved binding
                      <input
                        type="file"
                        accept=".json"
                        required
                        onChange={(e) => setBinding(e.target.files?.[0] ?? null)}
                      />
                    </label>
                    <button disabled={!packet || !binding}>Verify saved files</button>
                  </form>
                </>
              )}
            </>
          )}
          {state.phase === 'captured' && (
            <>
              <h2>Save both recovery files outside this browser</h2>
              <p>
                The recovery packet contains plaintext writing. Keep its separate binding file with
                it. After restarting this page, select the actual saved files for verification.
              </p>
              <div className="local-form">
                <button onClick={() => download('recovery')}>Save recovery packet</button>
                <button onClick={() => download('binding')}>Save binding file</button>
                <button onClick={() => download('markdown')}>Save Markdown preview</button>
                <button onClick={() => void leave('/private/migration.html')}>
                  Restart to verify saved files
                </button>
              </div>
            </>
          )}
          {state.phase === 'verified' && (
            <>
              <h2>Saved files verified</h2>
              <p>
                File replay succeeded. Source binding and retained state are checked again before
                import or selection.
              </p>
              {inspection?.kind === 'unused' ? (
                <button onClick={() => void owner.enroll()}>Generate device-lock code</button>
              ) : retained ? (
                codeForm(false)
              ) : (
                <p>This slot needs its existing owner before migration can continue.</p>
              )}
            </>
          )}
          {state.phase === 'save-code' && (
            <>
              <h2>Save your device-lock code</h2>
              <p>
                Store it outside this browser. You need the same code after any interruption and to
                open Local.
              </p>
              <code className="local-generated-code" aria-label="Generated device-lock code">
                {state.code}
              </code>
              <button onClick={() => owner.savedCode()}>I saved my code</button>
            </>
          )}
          {state.phase === 'confirm-code' && (
            <>
              <h2>Enter the code you saved</h2>
              {codeForm(true)}
            </>
          )}
          {state.phase === 'authenticated' && (
            <>
              <h2>{selected ? 'Destination selected' : 'Resume the import'}</h2>
              <p role="status">
                {selected
                  ? 'Open Local and verify your writing. The original source is still retained.'
                  : `Authenticated stage: ${importing ? inspection.stage : 'unavailable'}.`}
              </p>
              {importing && !['imported', 'selecting'].includes(inspection.stage) && (
                <button onClick={() => void owner.advance('import')}>Continue import</button>
              )}
              {importing && ['imported', 'selecting'].includes(inspection.stage) && (
                <button onClick={() => void owner.advance('select')}>
                  Select imported workspace
                </button>
              )}
              {selected && <button onClick={() => void leave('/')}>Open Local editor</button>}
            </>
          )}
        </fieldset>
        {state.busy && <p role="status">Waiting for the current storage operation…</p>}
        {state.error && <p role="alert">{state.error}</p>}
        {state.phase !== 'closed' && (
          <button className="local-secondary" onClick={() => void leave('/private/migration.html')}>
            Close and restart
          </button>
        )}
        {state.entries.length > 0 && (
          <details>
            <summary>Verified preview · {state.entries.length} files</summary>
            {state.entries.map((entry) => (
              <article className="local-preview" key={entry.path}>
                <h2>{entry.path}</h2>
                <pre>{entry.content}</pre>
              </article>
            ))}
          </details>
        )}
      </section>
    </main>
  );
};
