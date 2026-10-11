/** Advisory, bounded process-local subscriptions. Durable reads remain the source of truth. */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ScopedGrants } from './grants.ts';
import type { AuthorityPin } from '../account-protocol/authority.ts';
import type { GrantScope } from '../account-protocol/scopedGrant.ts';
import { AuthorizationRefused } from './authorization.ts';
export const NOTIFICATION_PATH = '/account/notifications/v1/subscribe';
export const NOTIFICATION_LIMITS = Object.freeze({
  streams: 128,
  perSession: 4,
  heartbeatMs: 10000,
  body: 4096,
});
type Watch = ReturnType<ScopedGrants['subscription']>;
type Connection = { watch: Watch; hint(): void; check(): void; close(): void };

export class AccountNotifications {
  #grants: ScopedGrants;
  #pin: AuthorityPin;
  #connections = new Set<Connection>();
  #closed = false;
  #pending = 0;
  #budget = 120;
  #last = performance.now();
  constructor(grants: ScopedGrants, pin: AuthorityPin) {
    this.#grants = grants;
    this.#pin = pin;
  }
  close() {
    this.#closed = true;
    for (const c of [...this.#connections]) c.close();
  }
  /** Called after operation settlement. It also closes invalidated parents without sending a hint. */
  reconcile() {
    for (const c of this.#connections) c.check();
  }
  /** The HTTP/domain composition supplies the target only after verified operation completion. */
  committed(scope: GrantScope, checkpoint = false, content = false) {
    for (const c of this.#connections) {
      const s = c.watch.scope;
      if (s.workspaceId !== scope.workspaceId) continue;
      // Content submit replies carry the writer's durable decision. Peer watchers still
      // need a hint; control changes must continue notifying the initiating device too.
      if (content && s.kind === 'workspace' && s.credentialId === scope.credentialId) continue;
      if (
        s.kind === 'workspace' ||
        checkpoint ||
        (scope.kind === 'enrollment' && s.kind === 'enrollment' && s.attemptId === scope.attemptId)
      )
        c.hint();
    }
  }
  async handle(request: IncomingMessage, response: ServerResponse) {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const fail = (status: number, refusal: string) => {
      if (!response.destroyed && !response.headersSent)
        response
          .writeHead(status, { 'Content-Type': 'application/json', Connection: 'close' })
          .end(JSON.stringify({ v: 1, kind: 'authorization-refused', refusal }));
    };
    if (this.#closed) return fail(503, 'storage-unavailable');
    if (
      request.url !== NOTIFICATION_PATH ||
      request.method !== 'POST' ||
      request.headers.host !== new URL(this.#pin.origin).host ||
      request.headers.origin !== this.#pin.origin ||
      request.headers['content-type'] !== 'application/json' ||
      request.headers['content-encoding']
    )
      return fail(403, 'malformed');
    const token = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.authorization ?? '')?.[1];
    if (!token) return fail(401, 'grant-required');
    const now = performance.now();
    this.#budget = Math.min(120, this.#budget + ((now - this.#last) * 2) / 1000);
    this.#last = now;
    if (this.#pending >= 16 || this.#budget < 1) return fail(429, 'capacity');
    this.#budget--;
    this.#pending++;
    const timer = setTimeout(() => {
      request.destroy();
      response.destroy();
    }, 10000);
    timer.unref();
    try {
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > NOTIFICATION_LIMITS.body) return fail(413, 'malformed');
        chunks.push(chunk);
      }
      if (this.#closed || response.destroyed) return fail(503, 'storage-unavailable');
      const watch = this.#grants.subscription(
        token,
        JSON.parse(Buffer.concat(chunks).toString('utf8')),
      );
      if (
        this.#connections.size >= NOTIFICATION_LIMITS.streams ||
        [...this.#connections].filter((c) => c.watch.sessionId === watch.sessionId).length >=
          NOTIFICATION_LIMITS.perSession
      )
        return fail(429, 'capacity');
      let closed = false,
        queued = false;
      let heartbeat: ReturnType<typeof setInterval> | undefined;
      let expiry: ReturnType<typeof setTimeout> | undefined;
      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        clearTimeout(expiry);
        this.#connections.delete(connection);
        response.off('close', close);
        response.off('error', close);
        // Drop buffered hints instead of holding a slow peer open during shutdown/retirement.
        response.destroy();
      };
      const check = () => {
        if (closed) return false;
        try {
          watch.check();
          return true;
        } catch {
          close();
          return false;
        }
      };
      const send = (frame: string) => {
        if (!check()) return;
        if (response.writableLength > 4096 || !response.write(frame)) close();
      };
      const connection: Connection = {
        watch,
        close,
        check,
        hint: () => {
          if (closed || queued) return;
          queued = true;
          queueMicrotask(() => {
            queued = false;
            send('event: hint\ndata: {}\n\n');
          });
        },
      };
      // Install before ready: a commit during the ensuing catch-up causes a subsequent hint.
      this.#connections.add(connection);
      response.once('close', close);
      response.once('error', close);
      response.writeHead(200, { 'Content-Type': 'text/event-stream', 'X-Accel-Buffering': 'no' });
      send('event: ready\ndata: {}\n\n');
      if (closed) return;
      expiry = setTimeout(close, Math.max(0, watch.expiresAt - Date.now()));
      expiry.unref();
      heartbeat = setInterval(() => send(': heartbeat\n\n'), NOTIFICATION_LIMITS.heartbeatMs);
      heartbeat.unref();
    } catch (cause) {
      fail(
        cause instanceof AuthorizationRefused ? 401 : 400,
        cause instanceof AuthorizationRefused ? cause.refusal : 'malformed',
      );
    } finally {
      clearTimeout(timer);
      this.#pending--;
    }
  }
}
