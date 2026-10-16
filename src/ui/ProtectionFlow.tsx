import { useRef, useState } from 'react';
import { beginLocalProtection } from '../crdt/localProtection';
import { normalizeDeviceCode } from '../crdt/custodyCrypto';

export function ProtectionFlow({
  onCancel,
  onConfirm,
  forSync = false,
}: {
  onCancel: () => void;
  onConfirm: (code: string) => Promise<void>;
  forSync?: boolean;
}) {
  const [step, setStep] = useState<'intro' | 'save' | 'confirm' | 'working'>('intro');
  const ceremony = useRef<ReturnType<typeof beginLocalProtection> | null>(null);
  const [typed, setTyped] = useState(''),
    [error, setError] = useState('');
  const pending = useRef(false);
  const code = ceremony.current?.displayCode;
  return (
    <main className="local-startup workspace-gate">
      <section className="local-startup-panel workspace-gate-panel" aria-labelledby="protect-title">
        <span className="local-brand">done</span>
        <h1 id="protect-title">
          {step === 'intro'
            ? 'Protect on this device'
            : step === 'save'
              ? 'Save your unlock code'
              : step === 'confirm'
                ? 'Check your saved copy'
                : 'Applying protection…'}
        </h1>
        {step === 'intro' && (
          <>
            <p>
              Require an unlock code to open your list in this browser. Your writing is already
              stored encrypted; this adds protection against someone opening a copied browser
              profile. Copies made before protection was enabled may still be readable.
            </p>
            {forSync && (
              <p>
                Sync requires local protection. First save an unlock code, then set up your account
                and recovery.
              </p>
            )}
            <p>
              If you lose the code and have no other readable copy, your writing may be lost
              permanently. Keep the code outside this browser.
            </p>
            <button
              onClick={() => {
                ceremony.current = beginLocalProtection('local');
                setStep('save');
              }}
            >
              Continue
            </button>
            <button className="local-secondary" onClick={onCancel}>
              Keep opening automatically
            </button>
          </>
        )}
        {step === 'save' && (
          <>
            <p>
              Save this code in your password manager or another safe place outside this browser.
              You’ll need it when you return.
            </p>
            <code className="local-generated-code" aria-label="Generated unlock code">
              {code}
            </code>
            <button onClick={() => setStep('confirm')}>I saved my unlock code</button>
            <button
              className="local-secondary"
              onClick={() => {
                ceremony.current?.cancel();
                onCancel();
              }}
            >
              Cancel
            </button>
          </>
        )}
        {step === 'confirm' && (
          <form
            className="local-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (pending.current) return;
              setError('');
              try {
                if (!code || normalizeDeviceCode(typed) !== normalizeDeviceCode(code))
                  throw Error();
              } catch {
                setError('That code does not match. Enter the code from your saved copy.');
                return;
              }
              pending.current = true;
              const value = typed;
              setTyped('');
              ceremony.current?.cancel();
              setStep('working');
              void onConfirm(value).catch(() =>
                setError('Protection could not finish. Resume with your saved code.'),
              );
            }}
          >
            <p>Enter the code from your saved copy. Your existing list and notes will be kept.</p>
            <label htmlFor="protect-code">Unlock code</label>
            <input
              id="protect-code"
              type="password"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              required
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
            <button>Confirm and protect</button>
            <button type="button" className="local-secondary" onClick={() => setStep('save')}>
              Show my code again
            </button>
            <button
              type="button"
              className="local-secondary"
              onClick={() => {
                ceremony.current?.cancel();
                onCancel();
              }}
            >
              Cancel
            </button>
          </form>
        )}
        {step === 'working' && (
          <p role="status">Keeping your list and verifying its protected copy…</p>
        )}
        {error && <p role="alert">{error}</p>}
      </section>
    </main>
  );
}
