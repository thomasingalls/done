/**
 * Who is allowed to connect (TRD §7.2).
 *
 * "Auth is a shared bearer token over TLS — unsophisticated, but the threat
 * model is one person's task list." That is the whole policy, and this module
 * is the whole implementation of it.
 *
 * It is deliberately dependency-free and side-effect-free: it decides, it does
 * not connect, log, or read the environment. That is what lets the app's test
 * suite import it directly and check the decisions without standing a server up
 * — the relay has its own package and its own toolchain, so a rule enforced
 * only over there is a rule nobody in the app repository runs.
 *
 * The relay is still a dumb pipe (TRD §2, §10.6). This says whether a socket
 * may open; it does not and cannot say anything about what is written through
 * it once it has.
 */

import { createHash, timingSafeEqual } from 'node:crypto';

/** Matches the client's `normalizeRoom`. A room name goes into a URL path. */
export const ROOM_PATTERN = /^[a-z\d][a-z\d._-]{0,63}$/iu;

export interface RelayPolicy {
  /** The shared bearer token. Empty means the relay is deliberately open. */
  token: string;
  /** Rooms this relay serves. Empty means any well-formed name. */
  rooms: readonly string[];
}

export interface UpgradeRequest {
  url: string | undefined;
  headers: Record<string, string | string[] | undefined>;
}

/**
 * Close codes rather than HTTP statuses, because a browser cannot see the
 * status of a failed websocket upgrade — `WebSocket` reports a generic error
 * and the provider retries forever. A code in the 4000–4999 range survives to
 * the client, where the app turns it into a sentence ("The relay refused the
 * token") instead of a device that silently never syncs.
 */
export const CLOSE_BAD_REQUEST = 4400;
export const CLOSE_UNAUTHORIZED = 4401;
export const CLOSE_UNKNOWN_ROOM = 4404;

export type Authorization =
  | { ok: true; room: string }
  | { ok: false; code: number; reason: string };

/** `/done?token=…` → `done`. Null where there is no usable room name. */
export const roomFrom = (rawUrl: string | undefined): string | null => {
  if (!rawUrl) return null;
  const path = rawUrl.split('?')[0] ?? '';
  const segments = path.split('/').filter((segment) => segment.length > 0);
  if (segments.length !== 1) return null;

  let room: string;
  try {
    room = decodeURIComponent(segments[0] as string);
  } catch {
    return null;
  }
  return ROOM_PATTERN.test(room) ? room : null;
};

/**
 * The query string first, because that is the only channel a browser has: the
 * `WebSocket` constructor takes a URL and nothing else. The `Authorization`
 * header is accepted as well for anything that can set one — a script, a health
 * check, a second implementation later.
 */
export const tokenFrom = (request: UpgradeRequest): string => {
  const query = request.url?.split('?')[1];
  if (query) {
    const value = new URLSearchParams(query).get('token');
    if (value) return value;
  }

  const header = request.headers['authorization'];
  const authorization = Array.isArray(header) ? header[0] : header;
  if (authorization?.toLowerCase().startsWith('bearer ')) return authorization.slice(7).trim();
  return '';
};

/**
 * Constant-time comparison over digests rather than over the strings, so the
 * lengths are equal whatever was sent and a mismatched length is not a shortcut
 * past the comparison.
 */
export const secretsMatch = (a: string, b: string): boolean => {
  const digest = (value: string): Buffer => createHash('sha256').update(value, 'utf8').digest();
  return timingSafeEqual(digest(a), digest(b));
};

export const authorize = (request: UpgradeRequest, policy: RelayPolicy): Authorization => {
  const room = roomFrom(request.url);
  if (room === null) {
    return { ok: false, code: CLOSE_BAD_REQUEST, reason: 'expected a single room path segment' };
  }

  if (policy.token.length > 0 && !secretsMatch(tokenFrom(request), policy.token)) {
    return { ok: false, code: CLOSE_UNAUTHORIZED, reason: 'unauthorized' };
  }

  if (policy.rooms.length > 0 && !policy.rooms.includes(room)) {
    return { ok: false, code: CLOSE_UNKNOWN_ROOM, reason: 'unknown room' };
  }

  return { ok: true, room };
};

/**
 * A URL fit to log. The token travels in the query string, so anything that
 * writes a request line — access logs, error reports, a stack trace with the
 * request in it — has to go through here first. TLS protects the token in
 * flight; it does not protect it from the relay's own logs.
 */
export const redactUrl = (rawUrl: string | undefined): string => {
  if (!rawUrl) return '/';
  const [path = '/', query] = rawUrl.split('?');
  if (!query) return path;
  const parameters = new URLSearchParams(query);
  if (parameters.has('token')) parameters.set('token', 'redacted');
  return `${path}?${parameters.toString()}`;
};
