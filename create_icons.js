/**
 * create_icons.js
 * Generates PNG icon files for the extension using pure node zlib and png chunks (no npm dependencies needed).
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function createPng(size, colorHex = '#00A878', accentHex = '#5EEAD4') {
  // Parse colors
  const r1 = parseInt(colorHex.slice(1, 3), 16);
  const g1 = parseInt(colorHex.slice(3, 5), 16);
  const b1 = parseInt(colorHex.slice(5, 7), 16);

  const r2 = parseInt(accentHex.slice(1, 3), 16);
  const g2 = parseInt(accentHex.slice(3, 5), 16);
  const b2 = parseInt(accentHex.slice(5, 7), 16);

  const width = size;
  const height = size;
  const rawData = Buffer.alloc((width * 4 + 1) * height);

  const centerX = width / 2;
  const centerY = height / 2;
  const radius = width * 0.45;
  const innerRadius = width * 0.25;

  let offset = 0;
  for (let y = 0; y < height; y++) {
    rawData[offset++] = 0; // Filter type 0 (None)
    for (let x = 0; x < width; x++) {
      const dx = x - centerX;
      const dy = y - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Draw rounded icon with radar concentric rings & target dot
      if (dist <= radius) {
        if (dist <= innerRadius) {
          // Center target dot (accent mint)
          rawData[offset++] = r2;
          rawData[offset++] = g2;
          rawData[offset++] = b2;
          rawData[offset++] = 255;
        } else if (Math.abs(dist - radius * 0.7) < Math.max(1, size * 0.08)) {
          // Ring
          rawData[offset++] = r2;
          rawData[offset++] = g2;
          rawData[offset++] = b2;
          rawData[offset++] = 240;
        } else {
          // Primary background emerald
          rawData[offset++] = r1;
          rawData[offset++] = g1;
          rawData[offset++] = b1;
          rawData[offset++] = 255;
        }
      } else {
        // Transparent
        rawData[offset++] = 0;
        rawData[offset++] = 0;
        rawData[offset++] = 0;
        rawData[offset++] = 0;
      }
    }
  }

  const compressed = zlib.deflateSync(rawData);

  // PNG Signature
  const pngSig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR Chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8);  // bit depth
  ihdr.writeUInt8(6, 9);  // RGBA
  ihdr.writeUInt8(0, 10); // compression
  ihdr.writeUInt8(0, 11); // filter
  ihdr.writeUInt8(0, 12); // interlace

  const ihdrChunk = createChunk('IHDR', ihdr);
  const idatChunk = createChunk('IDAT', compressed);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([pngSig, ihdrChunk, idatChunk, iendChunk]);
}

function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ -1) >>> 0;
}

const crcTable = new Int32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[i] = c;
}

function createChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = data.length;
  const chunk = Buffer.alloc(4 + 4 + len + 4);
  chunk.writeUInt32BE(len, 0);
  typeBuf.copy(chunk, 4);
  data.copy(chunk, 8);
  const crcVal = crc32(Buffer.concat([typeBuf, data]));
  chunk.writeUInt32BE(crcVal, 8 + len);
  return chunk;
}

const iconsDir = path.resolve('./icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

[16, 48, 128].forEach(size => {
  const pngBuf = createPng(size, '#00A878', '#5EEAD4');
  const filePath = path.join(iconsDir, `icon-${size}.png`);
  fs.writeFileSync(filePath, pngBuf);
  console.log(`Generated ${filePath} (${size}x${size})`);
});
