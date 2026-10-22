/** B2 Native API: explicit version IDs, restricted application key, ciphertext-only transfer. */
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import { privateJson, type BackupConfig } from './config.ts';
import { parseBackupName, parseMaintenanceName, type BackupVersion } from './retention.ts';
import type { fileDigest } from './snapshot.ts';

type Digest = Awaited<ReturnType<typeof fileDigest>>;
type Auth = { token: string; api: string; download: string };
function url(input: string) {
  const u = new URL(input);
  if (
    u.protocol !== 'https:' ||
    u.port ||
    u.username ||
    u.password ||
    u.hash ||
    !(/\.backblazeb2\.com$/.test(u.hostname) || /\.backblaze\.com$/.test(u.hostname))
  )
    throw Error('Unexpected B2 endpoint');
  return input;
}
async function json(response: Response) {
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw Error('B2 request refused');
  }
  const parts: Uint8Array[] = [];
  let bytes = 0;
  for await (const p of response.body) {
    bytes += p.length;
    if (bytes > 2 * 1024 ** 2) throw Error('Oversized B2 reply');
    parts.push(p);
  }
  return JSON.parse(Buffer.concat(parts).toString());
}
export class B2Store {
  private config: BackupConfig;
  readonly prefix: string;
  private fetcher: typeof fetch;
  private auth?: Auth;
  constructor(config: BackupConfig, namespace: string, fetcher: typeof fetch = fetch) {
    this.config = config;
    this.prefix = namespace;
    this.fetcher = fetcher;
  }
  reset() {
    this.auth = undefined;
  }
  private async request(endpoint: string, options: RequestInit, signal: AbortSignal) {
    return this.fetcher(url(endpoint), {
      ...options,
      redirect: 'error',
      signal: AbortSignal.any([signal, AbortSignal.timeout(120000)]),
    });
  }
  private async authorize(signal: AbortSignal): Promise<Auth> {
    if (this.auth) return this.auth;
    const key = privateJson(this.config.credentialsFile, true);
    if (
      Object.keys(key).sort().join() !== 'applicationKey,keyId' ||
      typeof key.keyId !== 'string' ||
      !/^[a-zA-Z0-9]{6,128}$/.test(key.keyId) ||
      typeof key.applicationKey !== 'string' ||
      !/^[a-zA-Z0-9/+=]{16,256}$/.test(key.applicationKey)
    )
      throw Error('Invalid B2 key file');
    const result = await json(
      await this.request(
        'https://api.backblazeb2.com/b2api/v4/b2_authorize_account',
        {
          headers: {
            Authorization:
              'Basic ' + Buffer.from(key.keyId + ':' + key.applicationKey).toString('base64'),
          },
        },
        signal,
      ),
    );
    const storage = result.apiInfo?.storageApi,
      allowed = storage?.allowed;
    if (
      !allowed ||
      !Array.isArray(allowed.buckets) ||
      allowed.buckets.length !== 1 ||
      allowed.buckets[0].id !== this.config.bucketId ||
      allowed.namePrefix !== this.config.prefix ||
      !['listFiles', 'readFiles', 'writeFiles', 'deleteFiles'].every((c) =>
        allowed.capabilities?.includes(c),
      ) ||
      typeof result.authorizationToken !== 'string'
    )
      throw Error('B2 key must be restricted to this backup bucket and prefix');
    this.auth = {
      token: result.authorizationToken,
      api: url(storage.apiUrl),
      download: url(storage.downloadUrl),
    };
    return this.auth;
  }
  private async call(method: string, body: unknown, signal: AbortSignal) {
    const auth = await this.authorize(signal);
    return json(
      await this.request(
        auth.api + '/b2api/v4/' + method,
        {
          method: 'POST',
          headers: { Authorization: auth.token, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
        signal,
      ),
    );
  }
  async upload(
    path: string,
    name: string,
    digest: Digest,
    signal: AbortSignal,
  ): Promise<BackupVersion> {
    const parsed = parseBackupName(this.prefix, name) ?? parseMaintenanceName(this.prefix, name);
    if (!parsed || parsed.sha256 !== digest.sha256) throw Error('Unscoped backup upload');
    const target = await this.call('b2_get_upload_url', { bucketId: this.config.bucketId }, signal);
    if (target.bucketId !== this.config.bucketId || typeof target.authorizationToken !== 'string')
      throw Error('B2 upload target mismatch');
    const stream = createReadStream(path);
    try {
      const options: RequestInit = {
        method: 'POST',
        duplex: 'half',
        body: Readable.toWeb(stream) as RequestInit['body'],
        headers: {
          Authorization: target.authorizationToken,
          'X-Bz-File-Name': encodeURIComponent(name),
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(digest.bytes),
          'X-Bz-Content-Sha1': digest.sha1,
        },
      };
      const value = await json(await this.request(target.uploadUrl, options, signal));
      if (
        value.fileName !== name ||
        value.bucketId !== this.config.bucketId ||
        value.contentLength !== digest.bytes ||
        value.contentSha1 !== digest.sha1 ||
        typeof value.fileId !== 'string' ||
        !value.fileId
      )
        throw Error('B2 upload receipt mismatch');
      const version = { fileId: value.fileId, fileName: name, ...parsed, bytes: digest.bytes };
      await this.verify(version, signal); // Read back this exact version, not a mutable filename.
      return version;
    } finally {
      stream.destroy();
    }
  }
  async verify(v: BackupVersion, signal: AbortSignal) {
    const parsed =
      parseBackupName(this.prefix, v.fileName) ?? parseMaintenanceName(this.prefix, v.fileName);
    if (
      !parsed ||
      parsed.sha256 !== v.sha256 ||
      parsed.capturedAt !== v.capturedAt ||
      !Number.isSafeInteger(v.bytes) ||
      v.bytes <= 0
    )
      throw Error('Unscoped backup read');
    const auth = await this.authorize(signal);
    const response = await this.request(
      auth.download + '/b2api/v4/b2_download_file_by_id?fileId=' + encodeURIComponent(v.fileId),
      { headers: { Authorization: auth.token } },
      signal,
    );
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      throw Error('B2 backup readback failed');
    }
    const hash = createHash('sha256');
    let bytes = 0;
    for await (const part of response.body) {
      bytes += part.length;
      if (bytes > v.bytes) throw Error('B2 backup readback too large');
      hash.update(part);
    }
    if (bytes !== v.bytes || hash.digest('hex') !== v.sha256)
      throw Error('B2 backup readback mismatch');
  }
  async list(signal: AbortSignal): Promise<BackupVersion[]> {
    return this.listScoped(this.prefix, (name) => parseBackupName(this.prefix, name), signal);
  }
  async listMaintenance(id: string, signal: AbortSignal): Promise<BackupVersion[]> {
    if (!/^[0-9a-f]{32}$/.test(id)) throw Error('Invalid maintenance ID');
    return this.listScoped(
      this.prefix + 'maintenance/' + id + '/',
      (name) => parseMaintenanceName(this.prefix, name, id),
      signal,
    );
  }
  private async listScoped(
    prefix: string,
    parse: (name: string) => ReturnType<typeof parseBackupName>,
    signal: AbortSignal,
  ): Promise<BackupVersion[]> {
    const result: BackupVersion[] = [],
      cursors = new Set<string>();
    let cursor = {};
    for (let page = 0; page < 100; page++) {
      const value = await this.call(
        'b2_list_file_versions',
        { bucketId: this.config.bucketId, prefix, maxFileCount: 1000, ...cursor },
        signal,
      );
      if (!Array.isArray(value.files) || value.files.length > 1000)
        throw Error('Invalid B2 version listing');
      for (const file of value.files) {
        if (typeof file.fileName !== 'string') throw Error('Invalid B2 version name');
        const name = parse(file.fileName);
        // Unknown files and maintenance backup names are never retention candidates.
        if (!name || file.action !== 'upload' || file.bucketId !== this.config.bucketId) continue;
        if (
          typeof file.fileId !== 'string' ||
          !file.fileId ||
          !Number.isSafeInteger(file.contentLength) ||
          file.contentLength <= 0
        )
          throw Error('Invalid B2 version metadata');
        result.push({
          fileId: file.fileId,
          fileName: file.fileName,
          bytes: file.contentLength,
          ...name,
        });
      }
      if (!value.nextFileName && !value.nextFileId) return result;
      if (
        typeof value.nextFileName !== 'string' ||
        !value.nextFileName.startsWith(prefix) ||
        typeof value.nextFileId !== 'string'
      )
        throw Error('Invalid B2 pagination');
      const next = JSON.stringify([value.nextFileName, value.nextFileId]);
      if (cursors.has(next)) throw Error('Repeated B2 listing cursor');
      cursors.add(next);
      cursor = { startFileName: value.nextFileName, startFileId: value.nextFileId };
    }
    throw Error('B2 retention listing limit exceeded');
  }
  async delete(v: BackupVersion, signal: AbortSignal) {
    if (!parseBackupName(this.prefix, v.fileName)) throw Error('Unscoped backup deletion');
    return this.deleteVersion(v, signal);
  }
  async deleteMaintenance(v: BackupVersion, id: string, signal: AbortSignal) {
    if (!/^[0-9a-f]{32}$/.test(id) || !parseMaintenanceName(this.prefix, v.fileName, id))
      throw Error('Unscoped maintenance deletion');
    return this.deleteVersion(v, signal);
  }
  private async deleteVersion(v: BackupVersion, signal: AbortSignal) {
    const result = await this.call(
      'b2_delete_file_version',
      { fileName: v.fileName, fileId: v.fileId },
      signal,
    );
    if (result.fileName !== v.fileName || result.fileId !== v.fileId)
      throw Error('B2 deletion receipt mismatch');
  }
}
