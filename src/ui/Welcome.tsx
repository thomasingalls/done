import { AppUpdateNotice } from './AppUpdateNotice';
import { WorkspaceBackdrop } from './WorkspaceBackdrop';

export const Welcome = ({
  onCreateLocal,
  onChooseAccount,
}: {
  onCreateLocal: () => void;
  onChooseAccount?: () => void;
}): React.ReactElement => (
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
        {/* Direct account creation is still reached through the account chooser. */}
        <button type="button" className="welcome-primary" disabled>
          Create a workspace
        </button>
        <button type="button" onClick={onCreateLocal}>
          Create a local-only workspace
        </button>
      </div>
      <button
        type="button"
        className="local-secondary welcome-existing"
        onClick={onChooseAccount}
        disabled={!onChooseAccount}
      >
        I already have a workspace
      </button>
    </section>
  </main>
);
