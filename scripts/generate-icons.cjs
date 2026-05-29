const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const iconsDir = path.join(__dirname, '..', 'src', 'assets', 'icons');

function createChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const tb = Buffer.from(type, 'ascii');
  const crc = crc32(Buffer.concat([tb, data]));
  const cb = Buffer.alloc(4);
  cb.writeUInt32BE(crc, 0);
  return Buffer.concat([len, tb, data, cb]);
}
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let j = 0; j < 8; j++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function createWaveformPNG(size) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = createChunk(
    'IHDR',
    (() => {
      const d = Buffer.alloc(13);
      d.writeUInt32BE(size, 0);
      d.writeUInt32BE(size, 4);
      d.writeUInt8(8, 8);
      d.writeUInt8(6, 9);
      return d;
    })(),
  );

  const raw = Buffer.alloc(size * (1 + size * 4));

  // 7 waveform bars matching SVG logo proportions
  // SVG: x=[0,2.5,5,7.5,10,12.5,15], w=1.5 each, total=18
  // Heights relative to full: [2/14, 8/14, 12/14, 14/14, 10/14, 6/14, 4/14]
  const barCount = 7;
  const totalBarsW = 18;
  const barW = 1.5;
  const barHeights = [2, 8, 12, 14, 10, 6, 4]; // out of 14
  const maxH = 14;

  // Padding: 15% on each side
  const pad = Math.round(size * 0.12);
  const availW = size - pad * 2;
  const availH = size - pad * 2;
  const scaleW = availW / totalBarsW;
  const scaleH = availH / maxH;
  const baseY = pad + availH; // bottom of bars

  const purple = [0x6e, 0x40, 0xc9];
  const blue = [0x58, 0xa6, 0xff];

  for (let y = 0; y < size; y++) {
    const ro = y * (1 + size * 4);
    raw[ro] = 0;
    for (let x = 0; x < size; x++) {
      const po = ro + 1 + x * 4;
      let hit = false;
      let cr = 0,
        cg = 0,
        cb = 0;

      for (let i = 0; i < barCount; i++) {
        const bx = pad + (i * 2.5 + 0.25) * scaleW;
        const bw = barW * scaleW;
        if (x >= bx && x < bx + bw) {
          const h = barHeights[i] * scaleH;
          const by = baseY - h;
          if (y >= by && y <= baseY) {
            hit = true;
            const t = i / (barCount - 1);
            cr = Math.round(purple[0] + (blue[0] - purple[0]) * t);
            cg = Math.round(purple[1] + (blue[1] - purple[1]) * t);
            cb = Math.round(purple[2] + (blue[2] - purple[2]) * t);
          }
          break;
        }
      }

      if (hit) {
        raw[po] = cr;
        raw[po + 1] = cg;
        raw[po + 2] = cb;
        raw[po + 3] = 255;
      } else {
        raw[po] = 0;
        raw[po + 1] = 0;
        raw[po + 2] = 0;
        raw[po + 3] = 0;
      }
    }
  }

  const idat = createChunk('IDAT', zlib.deflateSync(raw));
  const iend = createChunk('IEND', Buffer.alloc(0));
  return Buffer.concat([sig, ihdr, idat, iend]);
}

const sizes = {
  'icon-16-32x32.png': 32,
  'icon-32x32.png': 32,
  'icon-48x48.png': 48,
  'icon-128x128.png': 128,
  'icon-256x256.png': 256,
};
for (const [fn, sz] of Object.entries(sizes)) {
  fs.writeFileSync(path.join(iconsDir, fn), createWaveformPNG(sz));
  console.log('Created: ' + fn + ' (' + sz + 'x' + sz + ')');
}
console.log('Done.');
