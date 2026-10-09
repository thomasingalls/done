import { createServer } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';

/** Disposable loopback B2 protocol fixture; no environment credentials or external requests. */
export async function b2Fixture(config) {
  const files = new Map(),
    events = [];
  const controls = {
    broadKey: false,
    badUploadHost: false,
    corruptDownload: false,
    loseUploadReply: false,
    repeatedCursor: false,
    failDelete: false,
  };
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost'),
        method = url.pathname.split('/').at(-1);
      const parts = [];
      for await (const part of req) parts.push(part);
      const bytes = Buffer.concat(parts);
      const body = method === 'b2_upload_file' ? undefined : bytes.length ? JSON.parse(bytes) : {};
      events.push({ method, body });
      const reply = (value) =>
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(value));
      if (method === 'b2_authorize_account') {
        if (
          req.headers.authorization !==
          'Basic ' + Buffer.from('fixtureKey:fixtureSecret00000000').toString('base64')
        )
          throw Error('wrong fixture credential');
        return reply({
          authorizationToken: 'fixture-token',
          apiInfo: {
            storageApi: {
              apiUrl: 'https://api001.backblazeb2.com',
              downloadUrl: 'https://f001.backblazeb2.com',
              allowed: {
                buckets: controls.broadKey ? null : [{ id: config.bucketId }],
                namePrefix: config.prefix,
                capabilities: ['listFiles', 'readFiles', 'writeFiles', 'deleteFiles'],
              },
            },
          },
        });
      }
      if (method === 'b2_upload_file') {
        if (
          req.headers.authorization !== 'upload-token' ||
          Number(req.headers['content-length']) !== bytes.length ||
          req.headers['x-bz-content-sha1'] !== createHash('sha1').update(bytes).digest('hex') ||
          !bytes.subarray(0, 22).toString().startsWith('age-encryption.org/v1')
        )
          throw Error('invalid encrypted fixture upload');
        const fileId = randomUUID();
        const record = {
          action: 'upload',
          fileId,
          fileName: decodeURIComponent(req.headers['x-bz-file-name']),
          bucketId: config.bucketId,
          contentLength: bytes.length,
          contentSha1: req.headers['x-bz-content-sha1'],
          bytes,
        };
        files.set(fileId, record);
        if (controls.loseUploadReply) {
          controls.loseUploadReply = false;
          res.destroy();
          return;
        }
        const { bytes: _ignored, ...metadata } = record;
        return reply(metadata);
      }
      if (req.headers.authorization !== 'fixture-token') throw Error('wrong fixture token');
      if (method === 'b2_get_upload_url')
        return reply({
          bucketId: config.bucketId,
          authorizationToken: 'upload-token',
          uploadUrl: controls.badUploadHost
            ? 'https://attacker.example/upload'
            : 'https://pod-001.backblaze.com/b2api/v4/b2_upload_file',
        });
      if (method === 'b2_download_file_by_id') {
        const file = files.get(url.searchParams.get('fileId'));
        if (!file) {
          res.writeHead(404).end();
          return;
        }
        const bytes = Buffer.from(file.bytes);
        if (controls.corruptDownload) bytes[bytes.length - 1] ^= 1;
        res.writeHead(200).end(bytes);
        return;
      }
      if (method === 'b2_list_file_versions') {
        const values = [...files.values()]
          .filter((f) => f.fileName.startsWith(body.prefix))
          .sort((a, b) => a.fileName.localeCompare(b.fileName) || a.fileId.localeCompare(b.fileId));
        const start = body.startFileId ? values.findIndex((f) => f.fileId === body.startFileId) : 0;
        if (start < 0) throw Error('wrong cursor');
        // Two records per page ensures the implementation must actually follow version cursors.
        const next = controls.repeatedCursor ? values[0] : values[start + 2];
        return reply({
          files: values.slice(start, start + 2).map(({ bytes: _bytes, ...r }) => r),
          nextFileName: next?.fileName ?? null,
          nextFileId: next?.fileId ?? null,
        });
      }
      if (method === 'b2_delete_file_version') {
        if (controls.failDelete) {
          res.writeHead(503).end();
          return;
        }
        const f = files.get(body.fileId);
        if (!f || f.fileName !== body.fileName) throw Error('wrong version deletion');
        files.delete(body.fileId);
        return reply(body);
      }
      throw Error('unsupported fixture API');
    } catch {
      if (!res.destroyed) res.writeHead(400).end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  return {
    origin: base,
    files,
    controls,
    events,
    fetcher: (url, options) => {
      const u = new URL(url);
      return fetch(base + u.pathname + u.search, options);
    },
    close: () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  };
}
