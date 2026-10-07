import { useSyncExternalStore } from 'react';
import { readUpdateReady, subscribeToUpdate } from '../appUpdate';

export const AppUpdateNotice = ({ setup = false }: { setup?: boolean } = {}) => {
  const ready = useSyncExternalStore(subscribeToUpdate, readUpdateReady, () => false);
  if (!ready) return null;
  return (
    <p className="app-update-notice menu-note" role="status">
      <strong>Update ready.</strong>{' '}
      {setup
        ? 'When you’re ready, finish saving and confirming any codes, close all done tabs and app windows, then reopen. Your saved setup progress will be available.'
        : 'When you’re ready, lock your workspace, close all done tabs and app windows, then reopen. You can keep writing until then.'}
    </p>
  );
};
