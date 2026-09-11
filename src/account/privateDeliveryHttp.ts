/** Private same-service HTTP adapter; no device keys or membership decisions. */
import type { AuthorityPin } from '../../account-protocol/authority';
import type { Bytes } from '../../account-protocol/positionDecision';
export async function privateDeliveryPost(
  pin: AuthorityPin,
  token: string,
  path: 'submit' | 'read' | 'read-v2',
  body: Bytes,
  limit: number,
  signal: AbortSignal,
): Promise<Bytes | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const stopped = AbortSignal.any([signal, AbortSignal.timeout(10000)]);
  try {
    stopped.throwIfAborted();
    const response = await fetch(new URL('/account/delivery/' + path, pin.origin), {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream', Authorization: 'Bearer ' + token },
      body,
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      signal: stopped,
    });
    if (
      stopped.aborted ||
      response.status !== 200 ||
      response.headers.get('content-type') !== 'application/octet-stream' ||
      !response.body
    ) {
      await response.body?.cancel();
      return null;
    }
    const declared = response.headers.get('content-length');
    if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > limit)) {
      await response.body.cancel();
      return null;
    }
    const reader = response.body.getReader(),
      chunks: Bytes[] = [];
    let length = 0;
    let cancellation: Promise<void> | undefined;
    const cancel = () => {
      cancellation ??= reader.cancel().catch(() => {});
    };
    stopped.addEventListener('abort', cancel, { once: true });
    try {
      for (;;) {
        stopped.throwIfAborted();
        const { done, value } = await reader.read();
        stopped.throwIfAborted();
        if (done) break;
        length += value.length;
        if (length > limit) {
          cancel();
          return null;
        }
        chunks.push(new Uint8Array(value));
      }
      if (declared !== null && Number(declared) !== length) return null;
      const bytes = new Uint8Array(length);
      let at = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, at);
        at += chunk.length;
      }
      return bytes;
    } catch {
      cancel();
      return null;
    } finally {
      stopped.removeEventListener('abort', cancel);
      await cancellation;
      reader.releaseLock();
      for (const chunk of chunks) chunk.fill(0);
    }
  } catch {
    return null;
  }
}
