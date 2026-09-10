/** Private same-service HTTP adapter; no device keys or membership decisions. */
import type { AuthorityPin } from '../../account-protocol/authority';
import type { Bytes } from '../../account-protocol/positionDecision';
export async function privateDeliveryPost(
  pin: AuthorityPin,
  token: string,
  path: 'submit' | 'read',
  body: Bytes,
  limit: number,
  signal: AbortSignal,
): Promise<Bytes | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  try {
    const response = await fetch(new URL('/account/delivery/' + path, pin.origin), {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream', Authorization: 'Bearer ' + token },
      body,
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
    });
    if (
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
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > limit) {
          await reader.cancel();
          return null;
        }
        chunks.push(new Uint8Array(value));
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(length);
    let at = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, at);
      at += chunk.length;
    }
    return bytes;
  } catch {
    return null;
  }
}
