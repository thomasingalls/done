import { browserBooleanValue, readBrowserBoolean, useBrowserBoolean } from './useBrowserBoolean';

export const GENTLE_CONTEXT_KEY = 'done.ui.gentle-context';
export const gentleContextValue = browserBooleanValue;
export const readGentleContext = (storage?: Pick<Storage, 'getItem'>): boolean =>
  readBrowserBoolean(GENTLE_CONTEXT_KEY, storage);
export const useGentleContext = () => useBrowserBoolean(GENTLE_CONTEXT_KEY);
