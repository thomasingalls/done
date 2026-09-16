import { AppUpdateNotice } from './AppUpdateNotice';
import { useBreakpoint } from './useBreakpoint';

/** Public sample content only: the welcome never opens a workspace or mounts an editor. */
const WorkspacePreview = (): React.ReactElement => {
  const breakpoint = useBreakpoint();
  return (
    <div className="welcome-preview" data-breakpoint={breakpoint} aria-hidden="true" inert>
      <aside className="welcome-preview-menu">
        <span className="welcome-preview-brand">done</span>
        <span className="welcome-preview-current">Today</span>
        <span>Yesterday</span>
        <span>Tomorrow</span>
        <span className="welcome-preview-menu-label">Your space, at your pace.</span>
      </aside>
      <section className="welcome-preview-day">
        <header className="panel-header">
          <span className="panel-title">Today</span>
        </header>
        <div className="day-body">
          <section className="collection">
            <div className="collection-heading">
              Next <span>2 / 3</span>
            </div>
            <div className="card-list">
              {['Make a little room for the big idea', 'Take the long way home'].map((text) => (
                <div className="card" key={text}>
                  <div className="card-surface">{text}</div>
                  <div className="welcome-preview-card-actions">
                    Done <span>Later</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
          <section className="collection">
            <div className="collection-heading">Done</div>
            <div className="card-list">
              {[
                'Got the idea out of my head',
                'Sent the message I was putting off',
                'Made time for a walk',
              ].map((text) => (
                <div className="card" data-section="done" key={text}>
                  <div className="card-surface">{text}</div>
                </div>
              ))}
            </div>
            <div className="welcome-preview-compose">
              What got done? <span>+</span>
            </div>
          </section>
        </div>
      </section>
      <aside className="welcome-preview-goals">
        <header className="panel-header">
          <span className="panel-title">Goals</span>
        </header>
        <div className="welcome-preview-notes">
          <strong>A little space for everything</strong>
          <span>Ideas, plans, loose ends.</span>
          <span>Things to come back to.</span>
          <strong>Make something of my own</strong>
          <span>Write down the spark</span>
          <span>Find one small place to start</span>
          <span>Share a first draft</span>
          <strong>Outside of work</strong>
          <span>Learn to make really good bread</span>
          <span>Plan a weekend with no plans</span>
          <span>More dinners with friends</span>
        </div>
      </aside>
    </div>
  );
};

export const Welcome = ({ onCreateLocal }: { onCreateLocal: () => void }): React.ReactElement => (
  <main className="local-startup welcome" data-state="fresh">
    <WorkspacePreview />
    <div className="welcome-veil" />
    <section className="local-startup-panel welcome-panel" aria-labelledby="welcome-title">
      <AppUpdateNotice />
      <span className="local-brand">done</span>
      <h1 id="welcome-title">Your Workspace</h1>
      <p className="welcome-tagline">Everything on your mind. One thing at a time.</p>
      <div className="welcome-actions">
        {/* Account entry points are intentionally inactive until their flows are implemented. */}
        <button type="button" className="welcome-primary" disabled>
          Create a workspace
        </button>
        <button type="button" onClick={onCreateLocal}>
          Create a local-only workspace
        </button>
      </div>
      <button type="button" className="local-secondary welcome-existing" disabled>
        I already have a workspace
      </button>
    </section>
  </main>
);
