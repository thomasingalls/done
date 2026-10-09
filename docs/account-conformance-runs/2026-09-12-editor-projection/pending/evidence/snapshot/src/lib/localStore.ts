/**
 * The unsynced half of the storage split (TRD §4.8).
 *
 * Which actor this client is, which device it runs on, and where — if anywhere
 * — it syncs to are all local facts. They never enter the document, so they
 * never travel to another device, which is the point: a token belongs to the
 * browser it was typed into, and a device name that synced would stop being
 * about the device.
 *
 * Every access is guarded. Private mode and disabled storage throw on `getItem`
 * as readily as on `setItem`, and none of this is worth failing to start over —
 * a session with a generated actor id and no sync configured still works.
 */

export const readLocal = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

export const writeLocal = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* see readLocal */
  }
};

export const removeLocal = (key: string): void => {
  try {
    localStorage.removeItem(key);
  } catch {
    /* see readLocal */
  }
};

/** Parsed, or null where the value is absent, unparseable, or not an object. */
export const readLocalJson = (key: string): Record<string, unknown> | null => {
  const stored = readLocal(key);
  if (stored === null) return null;
  try {
    const parsed: unknown = JSON.parse(stored);
    return parsed !== null && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};

export const writeLocalJson = (key: string, value: unknown): void =>
  writeLocal(key, JSON.stringify(value));
