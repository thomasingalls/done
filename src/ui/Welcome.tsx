import { useRef, useState } from 'react';
import { AppUpdateNotice } from './AppUpdateNotice';
import { WorkspaceBackdrop } from './WorkspaceBackdrop';

export const Welcome = ({
  onCreateLocal,
  onCreateWorkspace,
  onChooseAccount,
  hasLocalWorkspace = false,
  checkingLocalWorkspace = false,
}: {
  onCreateLocal: () => void;
  onCreateWorkspace?: () => Promise<void>;
  onChooseAccount?: () => void;
  hasLocalWorkspace?: boolean;
  checkingLocalWorkspace?: boolean;
}): React.ReactElement => {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const create = async () => {
    if (!onCreateWorkspace || pending.current) return;
    pending.current = true;
    setCreating(true);
    setError('');
    try {
      await onCreateWorkspace();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Workspace setup could not start. Try again.',
      );
    } finally {
      pending.current = false;
      setCreating(false);
    }
  };
  return (
    <main className="local-startup workspace-gate welcome" data-state="fresh">
      <WorkspaceBackdrop />
      <section
        className="local-startup-panel workspace-gate-panel welcome-panel"
        aria-labelledby="welcome-title"
      >
        <AppUpdateNotice />
        <span className="local-brand">done</span>
        <h1 id="welcome-title">Your Workspace</h1>
        <p className="welcome-tagline">Everything on your mind. One thing at a time.</p>
        <div className="welcome-actions">
          {onCreateWorkspace && (
            <button
              type="button"
              className="welcome-primary"
              disabled={creating}
              onClick={() => void create()}
            >
              {creating ? 'Preparing workspace…' : 'Create a workspace'}
            </button>
          )}
          <button
            type="button"
            onClick={onCreateLocal}
            disabled={creating || checkingLocalWorkspace}
          >
            {checkingLocalWorkspace
              ? 'Checking local workspace…'
              : hasLocalWorkspace
                ? 'Open local-only workspace'
                : 'Create a local-only workspace'}
          </button>
        </div>
        {error && <p role="alert">{error}</p>}
        <button
          type="button"
          className="local-secondary welcome-existing"
          onClick={onChooseAccount}
          disabled={creating || !onChooseAccount}
        >
          I already have a workspace
        </button>
      </section>
    </main>
  );
};
