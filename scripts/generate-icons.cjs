const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const iconsDir = path.join(__dirname, '..', 'src', 'assets', 'icons');

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crcData = Buffer.concat([typeBuffer, data]);
  const crc = crc32(crcData);
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc, 0);
  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createMinimalPNG(size) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData.writeUInt8(8, 8);
  ihdrData.writeUInt8(2, 9);
  ihdrData.writeUInt8(0, 10);
  ihdrData.writeUInt8(0, 11);
  ihdrData.writeUInt8(0, 12);
  const ihdr = createChunk('IHDR', ihdrData);

  const rawData = Buffer.alloc(size * (1 + size * 3));
  for (let y = 0; y < size; y++) {
    const rowOffset = y * (1 + size * 3);
    rawData[rowOffset] = 0;
    for (let x = 0; x < size; x++) {
      const pixelOffset = rowOffset + 1 + x * 3;
      const t = x / (size - 1 || 1);
      // Gradient: #6e40c9 (purple) to #58a6ff (blue)
      const r = Math.round(0x6e - (0x6e - 0x58) * t);
      const g = Math.round(0x40 + (0xa6 - 0x40) * t);
      const b = Math.round(0xc9 + (0xff - 0xc9) * t);
      rawData[pixelOffset] = r;
      rawData[pixelOffset + 1] = g;
      rawData[pixelOffset + 2] = b;
    }
  }

  const compressed = zlib.deflateSync(rawData);
  const idat = createChunk('IDAT', compressed);
  const iend = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

const sizes = {
  'icon-16-32x32.png': 16,
  'icon-32x32.png': 32,
  'icon-48x48.png': 48,
  'icon-128x128.png': 128,
  'icon-256x256.png': 256,
};

for (const [filename, size] of Object.entries(sizes)) {
  const filepath = path.join(iconsDir, filename);
  const backupPath = filepath + '.backup';
  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(filepath, backupPath);
  }
  const png = createMinimalPNG(size);
  fs.writeFileSync(filepath, png);
  console.log('Created: ' + filename + ' (' + size + 'x' + size + ')');
}
console.log('Done. Old icons backed up as .backup');
