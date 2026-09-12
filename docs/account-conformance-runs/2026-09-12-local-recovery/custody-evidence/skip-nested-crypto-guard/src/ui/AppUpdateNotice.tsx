import { useSyncExternalStore } from 'react';
import { readUpdateReady, subscribeToUpdate } from '../appUpdate';

export const AppUpdateNotice = () => {
  const ready = useSyncExternalStore(subscribeToUpdate, readUpdateReady, () => false);
  if (!ready) return null;
  return (
    <p className="app-update-notice menu-note" role="status">
      <strong>Update ready.</strong> When you’re ready, lock your workspace, close all done tabs and
      app windows, then reopen. You can keep writing until then.
    </p>
  );
};
