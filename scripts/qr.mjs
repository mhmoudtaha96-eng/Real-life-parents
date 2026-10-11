// Dependency-free QR → SVG (uses the vendored MIT encoder by Kazuhiko Arase).
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const QRCode = require('./vendor/qrcode/index.js');
const ECL = require('./vendor/qrcode/QRErrorCorrectLevel.js');

export function qrSvg(text, { dark = '#1F2D35', light = '#FFFFFF', margin = 2 } = {}) {
  const qr = new QRCode(-1, ECL.M);
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const size = n + margin * 2;
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + margin} ${r + margin}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="${light}"/><path d="${d}" fill="${dark}"/></svg>`;
}
