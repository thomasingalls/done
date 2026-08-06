/**
 * The relay's authorization decisions (TRD §7.2), tested from the app.
 *
 * The relay is a separate package with its own toolchain, and a rule enforced
 * only over there is a rule nobody here runs. `relay/src/auth.ts` is
 * dependency-free and side-effect-free precisely so that it can be imported
 * and checked from this side; the end-to-end version — a real process, a real
 * socket, a real refusal — lives in `relay/test/`.
 *
 * Note what is *not* being tested, because it cannot be: the relay treats
 * updates as opaque binary and has no validation point (TRD §10.6). This says
 * whether a socket may open. It says nothing about what is written through one.
 */

import { describe, expect, it } from 'vitest';
import {
  CLOSE_BAD_REQUEST,
  CLOSE_UNAUTHORIZED,
  CLOSE_UNKNOWN_ROOM,
  authorize,
  redactUrl,
  roomFrom,
  secretsMatch,
  tokenFrom,
} from '../relay/src/auth';
import { normalizeRoom } from '../src/crdt';

const policy = { token: 'a-shared-secret', rooms: [] as readonly string[] };
const request = (url: string) => ({ url, headers: {} });

describe('the room', () => {
  it('is the single path segment the provider appends', () => {
    expect(roomFrom('/done')).toBe('done');
    expect(roomFrom('/done?token=x')).toBe('done');
    expect(roomFrom('/my-notes.2026')).toBe('my-notes.2026');
  });

  it('is refused where it is not one', () => {
    expect(roomFrom(undefined)).toBeNull();
    expect(roomFrom('/')).toBeNull();
    expect(roomFrom('/one/two')).toBeNull();
    expect(roomFrom('/%2e%2e%2fetc')).toBeNull();
    expect(roomFrom('/a room')).toBeNull();
    expect(roomFrom(`/${'x'.repeat(65)}`)).toBeNull();
  });

  /**
   * The client refuses to *store* a room name the relay would refuse to serve.
   * Two rules in two packages that have to agree; if they drift, the symptom is
   * a device that connects and silently never syncs.
   */
  it('agrees with the room names the client is willing to store', () => {
    for (const name of ['done', 'work', 'a', 'my-notes.2026', 'A_B']) {
      expect(normalizeRoom(name)).toBe(name);
      expect(roomFrom(`/${name}`)).toBe(name);
    }
    for (const name of ['my notes', '../etc', '-leading', '']) {
      expect(normalizeRoom(name)).not.toBe(name);
      expect(roomFrom(`/${name}`)).toBeNull();
    }
  });
});

describe('the token', () => {
  it('comes from the query string, which is all a browser has', () => {
    expect(tokenFrom(request('/done?token=abc'))).toBe('abc');
  });

  it('comes from a bearer header for anything that can set one', () => {
    expect(tokenFrom({ url: '/done', headers: { authorization: 'Bearer abc' } })).toBe('abc');
    expect(tokenFrom({ url: '/done', headers: { authorization: 'bearer abc' } })).toBe('abc');
  });

  it('is empty rather than undefined when absent', () => {
    expect(tokenFrom(request('/done'))).toBe('');
    expect(tokenFrom({ url: '/done', headers: { authorization: 'Basic abc' } })).toBe('');
  });

  it('compares equal only to itself, whatever the lengths', () => {
    expect(secretsMatch('abc', 'abc')).toBe(true);
    expect(secretsMatch('abc', 'abd')).toBe(false);
    expect(secretsMatch('abc', 'abcdefghijklmnop')).toBe(false);
    expect(secretsMatch('', '')).toBe(true);
  });
});

describe('authorization', () => {
  it('admits the right token to a well-formed room', () => {
    expect(authorize(request('/done?token=a-shared-secret'), policy)).toEqual({
      ok: true,
      room: 'done',
    });
  });

  it('refuses a wrong or missing token with a code the client can read', () => {
    expect(authorize(request('/done?token=wrong'), policy)).toMatchObject({
      ok: false,
      code: CLOSE_UNAUTHORIZED,
    });
    expect(authorize(request('/done'), policy)).toMatchObject({
      ok: false,
      code: CLOSE_UNAUTHORIZED,
    });
  });

  it('refuses a malformed request before it considers the token', () => {
    expect(authorize(request('/one/two?token=a-shared-secret'), policy)).toMatchObject({
      ok: false,
      code: CLOSE_BAD_REQUEST,
    });
  });

  it('refuses a room outside the allowlist, where there is one', () => {
    const pinned = { token: 'a-shared-secret', rooms: ['done'] };
    expect(authorize(request('/done?token=a-shared-secret'), pinned)).toMatchObject({ ok: true });
    expect(authorize(request('/other?token=a-shared-secret'), pinned)).toMatchObject({
      ok: false,
      code: CLOSE_UNKNOWN_ROOM,
    });
  });

  it('admits anyone where the relay is deliberately open', () => {
    expect(authorize(request('/done'), { token: '', rooms: [] })).toMatchObject({ ok: true });
  });
});

describe('logging', () => {
  /**
   * The token is in the query string because a browser cannot put it anywhere
   * else. TLS keeps it off the wire; this keeps it out of the relay's own logs,
   * which is the other half and the half that outlives the connection.
   */
  it('never writes the token out', () => {
    expect(redactUrl('/done?token=a-shared-secret')).toBe('/done?token=redacted');
    expect(redactUrl('/done')).toBe('/done');
    expect(redactUrl(undefined)).toBe('/');
    expect(redactUrl('/done?token=a&other=b')).not.toContain('token=a&');
  });
});
