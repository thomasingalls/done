/**
 * Internal identities are UUIDs. They are opaque storage keys and never appear
 * in user-authored text; previously stored short ids remain valid.
 */
export const newId = (): string => crypto.randomUUID();
