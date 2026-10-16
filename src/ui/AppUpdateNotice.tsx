import { useRef, useState, useSyncExternalStore } from 'react';
import { readUpdateReady, reloadToUpdate, subscribeToUpdate } from '../appUpdate';

export const AppUpdateNotice = ({
  setup = false,
  beforeReload,
}: {
  setup?: boolean;
  beforeReload?: () => Promise<void>;
} = {}) => {
  const ready = useSyncExternalStore(subscribeToUpdate, readUpdateReady, () => false);
  const applying = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  if (!ready) return null;
  const apply = () => {
    if (!beforeReload || applying.current) return;
    applying.current = true;
    setPending(true);
    setError('');
    void reloadToUpdate(beforeReload)
      .catch(() => {
        setError('The app could not update. Check that your writing is saved, then try again.');
      })
      .finally(() => {
        applying.current = false;
        setPending(false);
      });
  };
  return (
    <div className="app-update-notice">
      <p className="menu-note" role="status">
        <strong>Update ready.</strong>{' '}
        {beforeReload
          ? 'Reload when you’re ready. Saved writing stays available; unlock your workspace again after reloading.'
          : setup
            ? 'Finish saving and confirming any codes, close all done tabs and app windows, then reopen. Your saved setup progress will be available.'
            : 'Close all done tabs and app windows, then reopen when you’re ready to update.'}
      </p>
      {beforeReload && (
        <button type="button" className="menu-button" disabled={pending} onClick={apply}>
          {pending ? 'Saving and updating…' : 'Reload to update'}
        </button>
      )}
      {error && (
        <p className="menu-note" role="alert">
          {error}
        </p>
      )}
    </div>
  );
};
