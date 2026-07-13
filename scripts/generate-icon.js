const { mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { deflateSync } = require('node:zlib');

const size = 256;
const scale = 3;
const workSize = size * scale;
const pixels = Buffer.alloc(workSize * workSize * 4);

function blendPixel(x, y, color) {
  if (x < 0 || y < 0 || x >= workSize || y >= workSize) return;
  const offset = (Math.floor(y) * workSize + Math.floor(x)) * 4;
  const alpha = color[3] / 255;
  const inverse = 1 - alpha;
  pixels[offset] = Math.round(color[0] * alpha + pixels[offset] * inverse);
  pixels[offset + 1] = Math.round(color[1] * alpha + pixels[offset + 1] * inverse);
  pixels[offset + 2] = Math.round(color[2] * alpha + pixels[offset + 2] * inverse);
  pixels[offset + 3] = Math.round((alpha + (pixels[offset + 3] / 255) * inverse) * 255);
}

function fillCircle(cx, cy, radius, color) {
  cx *= scale;
  cy *= scale;
  radius *= scale;
  const minX = Math.floor(cx - radius);
  const maxX = Math.ceil(cx + radius);
  const minY = Math.floor(cy - radius);
  const maxY = Math.ceil(cy + radius);
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2) blendPixel(x, y, color);
    }
  }
}

function drawLine(x1, y1, x2, y2, width, color) {
  x1 *= scale;
  y1 *= scale;
  x2 *= scale;
  y2 *= scale;
  width *= scale;
  const minX = Math.floor(Math.min(x1, x2) - width);
  const maxX = Math.ceil(Math.max(x1, x2) + width);
  const minY = Math.floor(Math.min(y1, y2) - width);
  const maxY = Math.ceil(Math.max(y1, y2) + width);
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const projection = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / lengthSquared));
      const nearestX = x1 + projection * dx;
      const nearestY = y1 + projection * dy;
      if ((x - nearestX) ** 2 + (y - nearestY) ** 2 <= (width / 2) ** 2) {
        blendPixel(x, y, color);
      }
    }
  }
}

function insideRoundedSquare(x, y, inset, radius) {
  const left = inset;
  const top = inset;
  const right = size - inset;
  const bottom = size - inset;
  const nearestX = Math.max(left + radius, Math.min(right - radius, x));
  const nearestY = Math.max(top + radius, Math.min(bottom - radius, y));
  return (x - nearestX) ** 2 + (y - nearestY) ** 2 <= radius ** 2;
}

for (let y = 0; y < workSize; y += 1) {
  for (let x = 0; x < workSize; x += 1) {
    const logicalX = (x + 0.5) / scale;
    const logicalY = (y + 0.5) / scale;
    if (!insideRoundedSquare(logicalX, logicalY, 12, 48)) continue;
    const mix = (logicalX + logicalY) / (size * 2);
    blendPixel(x, y, [
      Math.round(28 + 18 * mix),
      Math.round(28 + 22 * mix),
      Math.round(46 + 42 * mix),
      255
    ]);
  }
}

const nodes = [
  [70, 70, [166, 227, 161, 255]],
  [186, 70, [249, 226, 175, 255]],
  [70, 186, [243, 139, 168, 255]],
  [186, 186, [203, 166, 247, 255]]
];

for (const [x, y, color] of nodes) {
  drawLine(128, 128, x, y, 8, [137, 180, 250, 105]);
  fillCircle(x, y, 18, [24, 24, 37, 255]);
  fillCircle(x, y, 12, color);
}

fillCircle(128, 128, 51, [116, 199, 236, 255]);
fillCircle(128, 128, 40, [137, 180, 250, 255]);
drawLine(103, 128, 153, 128, 9, [30, 30, 46, 235]);
drawLine(128, 103, 128, 153, 9, [30, 30, 46, 235]);
fillCircle(128, 128, 9, [249, 226, 175, 255]);

const output = Buffer.alloc(size * size * 4);
for (let y = 0; y < size; y += 1) {
  for (let x = 0; x < size; x += 1) {
    const totals = [0, 0, 0, 0];
    for (let sampleY = 0; sampleY < scale; sampleY += 1) {
      for (let sampleX = 0; sampleX < scale; sampleX += 1) {
        const source = (((y * scale + sampleY) * workSize) + x * scale + sampleX) * 4;
        for (let channel = 0; channel < 4; channel += 1) totals[channel] += pixels[source + channel];
      }
    }
    const target = (y * size + x) * 4;
    const samples = scale * scale;
    for (let channel = 0; channel < 4; channel += 1) output[target + channel] = Math.round(totals[channel] / samples);
  }
}

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let current = value;
  for (let bit = 0; bit < 8; bit += 1) {
    current = (current & 1) ? 0xedb88320 ^ (current >>> 1) : current >>> 1;
  }
  return current >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBuffer.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return chunk;
}

const raw = Buffer.alloc((size * 4 + 1) * size);
for (let y = 0; y < size; y += 1) {
  const rowOffset = y * (size * 4 + 1);
  raw[rowOffset] = 0;
  output.copy(raw, rowOffset + 1, y * size * 4, (y + 1) * size * 4);
}

const header = Buffer.alloc(13);
header.writeUInt32BE(size, 0);
header.writeUInt32BE(size, 4);
header[8] = 8;
header[9] = 6;
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  pngChunk('IHDR', header),
  pngChunk('IDAT', deflateSync(raw, { level: 9 })),
  pngChunk('IEND', Buffer.alloc(0))
]);

const icoHeader = Buffer.alloc(22);
icoHeader.writeUInt16LE(0, 0);
icoHeader.writeUInt16LE(1, 2);
icoHeader.writeUInt16LE(1, 4);
icoHeader[6] = 0;
icoHeader[7] = 0;
icoHeader.writeUInt16LE(1, 10);
icoHeader.writeUInt16LE(32, 12);
icoHeader.writeUInt32LE(png.length, 14);
icoHeader.writeUInt32LE(22, 18);

const buildDirectory = join(process.cwd(), 'build');
mkdirSync(buildDirectory, { recursive: true });
const pngPath = join(buildDirectory, 'icon.png');
writeFileSync(pngPath, png);
const iconPath = join(buildDirectory, 'icon.ico');
writeFileSync(iconPath, Buffer.concat([icoHeader, png]));
console.log(`Generated ${iconPath} and ${pngPath}`);
