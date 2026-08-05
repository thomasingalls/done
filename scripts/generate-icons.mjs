/**
 * Generates the PWA icons.
 *
 * A dependency-free PNG encoder, because pulling in an image library to draw a
 * tick on a square is not a trade worth making. Run `node scripts/generate-icons.mjs`
 * after changing the mark; the output is committed.
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

const BACKGROUND = [0x16, 0x16, 0x1a];
const MARK = [0xe0, 0x78, 0x3f];

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

const crc32 = (buffer) => {
  let c = 0xffffffff;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const chunk = (type, data) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
};

/** @param {Uint8Array} rgba RGBA rows, top to bottom. */
const encodePng = (width, height, rgba) => {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

/** Distance from p to the segment ab, used to draw the tick with soft edges. */
const distanceToSegment = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};

const mix = (a, b, t) => a + (b - a) * t;

const draw = (size, { bleed }) => {
  const pixels = new Uint8Array(size * size * 4);

  // `bleed` is the maskable variant: the background fills the whole canvas and
  // the mark shrinks into the safe zone, so a circular mask cannot clip it.
  const inset = bleed ? 0 : size * 0.06;
  const radius = bleed ? 0 : size * 0.22;
  const scale = bleed ? 0.62 : 0.78;

  const cx = size / 2;
  const cy = size / 2;
  const s = size * scale;
  // A tick: down-right, then up-right.
  const ax = cx - s * 0.3;
  const ay = cy + s * 0.02;
  const bx = cx - s * 0.08;
  const by = cy + s * 0.24;
  const dx = cx + s * 0.32;
  const dy = cy - s * 0.26;
  const stroke = size * (bleed ? 0.055 : 0.07);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x + 0.5;
      const py = y + 0.5;

      // Rounded-square coverage.
      const qx = Math.abs(px - cx) - (size / 2 - inset - radius);
      const qy = Math.abs(py - cy) - (size / 2 - inset - radius);
      const outside =
        Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
      const background = Math.max(0, Math.min(1, 0.5 - outside));

      const distance = Math.min(
        distanceToSegment(px, py, ax, ay, bx, by),
        distanceToSegment(px, py, bx, by, dx, dy),
      );
      const mark = Math.max(0, Math.min(1, stroke / 2 - distance + 0.5));

      const offset = (y * size + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        pixels[offset + channel] = Math.round(mix(BACKGROUND[channel], MARK[channel], mark));
      }
      pixels[offset + 3] = Math.round(255 * background);
    }
  }

  return encodePng(size, size, pixels);
};

writeFileSync(join(OUT, 'icon-192.png'), draw(192, { bleed: false }));
writeFileSync(join(OUT, 'icon-512.png'), draw(512, { bleed: false }));
writeFileSync(join(OUT, 'icon-maskable-512.png'), draw(512, { bleed: true }));

writeFileSync(
  join(OUT, 'favicon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect x="6" y="6" width="88" height="88" rx="22" fill="#16161a"/>
  <path d="M27 51 L44 69 L74 31" fill="none" stroke="#e0783f" stroke-width="9"
        stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`,
);

console.log('icons written to public/');
