import { useCallback, useEffect, useState } from 'react';

/** Browser presentation only: never store headings, identifiers, writing or unlock material here. */
export const GENTLE_CONTEXT_KEY = 'done.ui.gentle-context';
export const gentleContextValue = (stored: string | null): boolean => stored !== '0';
export const readGentleContext = (storage?: Pick<Storage, 'getItem'>): boolean => {
  try {
    return gentleContextValue((storage ?? localStorage).getItem(GENTLE_CONTEXT_KEY));
  } catch {
    return true;
  }
};

export const useGentleContext = () => {
  const [enabled, setEnabled] = useState(() => {
    try {
      return readGentleContext();
    } catch {
      return true;
    }
  });
  const [stored, setStored] = useState(true);
  const change = useCallback((value: boolean) => {
    setEnabled(value);
    try {
      localStorage.setItem(GENTLE_CONTEXT_KEY, value ? '1' : '0');
      setStored(true);
    } catch {
      setStored(false);
    }
  }, []);
  useEffect(() => {
    const receive = (event: StorageEvent) => {
      try {
        if (event.storageArea !== localStorage) return;
      } catch {
        return;
      }
      if (event.key === GENTLE_CONTEXT_KEY || event.key === null) {
        setEnabled(gentleContextValue(event.newValue));
        setStored(true);
      }
    };
    window.addEventListener('storage', receive);
    return () => window.removeEventListener('storage', receive);
  }, []);
  return { enabled, change, stored };
};
