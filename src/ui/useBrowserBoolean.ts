import { useCallback, useEffect, useState } from 'react';

/** Presentation switches only. Never store writing, identities or unlock material. */
export const browserBooleanValue = (stored: string | null): boolean => stored !== '0';
export const readBrowserBoolean = (key: string, storage?: Pick<Storage, 'getItem'>): boolean => {
  try {
    return browserBooleanValue((storage ?? localStorage).getItem(key));
  } catch {
    return true;
  }
};
export const useBrowserBoolean = (key: string) => {
  const [enabled, setEnabled] = useState(() => readBrowserBoolean(key));
  const [stored, setStored] = useState(true);
  const change = useCallback(
    (value: boolean) => {
      setEnabled(value);
      try {
        localStorage.setItem(key, value ? '1' : '0');
        setStored(true);
      } catch {
        setStored(false);
      }
    },
    [key],
  );
  useEffect(() => {
    const receive = (event: StorageEvent) => {
      try {
        if (event.storageArea !== localStorage) return;
      } catch {
        return;
      }
      if (event.key === key || event.key === null) {
        setEnabled(browserBooleanValue(event.newValue));
        setStored(true);
      }
    };
    window.addEventListener('storage', receive);
    return () => window.removeEventListener('storage', receive);
  }, [key]);
  return { enabled, change, stored };
};
