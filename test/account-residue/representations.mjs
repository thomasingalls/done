export function variants(text) {
  const b = Buffer.from(text),
    prefix = (n) => Buffer.concat([Buffer.alloc(n, 0xee), b]);
  return {
    plain: b,
    utf16le: Buffer.from(text, 'utf16le'),
    utf16be: Buffer.from(text, 'utf16le').swap16(),
    json: Buffer.from(JSON.stringify({ unexpected: [text] })),
    escaped: Buffer.from(
      JSON.stringify(
        text
          .split('')
          .map((s) => '\\u' + s.charCodeAt(0).toString(16).padStart(4, '0'))
          .join(''),
      ),
    ),
    hex: Buffer.from(b.toString('hex')),
    HEX: Buffer.from(b.toString('hex').toUpperCase()),
    base64: Buffer.from(b.toString('base64')),
    base64url: Buffer.from(prefix(1).toString('base64url')),
    unpadded: Buffer.from(b.toString('base64').replace(/=+$/, '')),
    offset1: Buffer.from(prefix(1).toString('base64')),
    offset2: Buffer.from(prefix(2).toString('base64')),
    framed: Buffer.from('2:' + prefix(2).toString('base64')),
    byteArray: Buffer.from(JSON.stringify([...b])),
    nested: Buffer.from(JSON.stringify({ unexpected: prefix(1).toString('base64') })),
  };
}
