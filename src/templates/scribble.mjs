// Builds the hero illustration: a tangled crayon scribble (the daily battle)
// whose thread runs out into one steady line (the calm response).
// Deterministic (seeded) so every build produces the same drawing.

function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// Catmull-Rom -> cubic Bezier for a smooth hand-drawn path
function smooth(points) {
  let d = `M${points[0][0].toFixed(1)} ${points[0][1].toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

export function heroArt({ words = [], dir = 'rtl' }) {
  const r = rng(1109);
  const W = 560, H = 440;
  const cx = 300, cy = 175;
  const pts = [];
  let a = 0;
  for (let i = 0; i < 46; i++) {
    a += 0.75 + r() * 0.9;
    const rad = 38 + r() * 92;
    const ox = Math.sin(i * 0.37) * 26, oy = Math.cos(i * 0.23) * 14;
    pts.push([cx + ox + Math.cos(a) * rad * 1.25, cy + oy + Math.sin(a) * rad * 0.85]);
  }
  // thread leaves the knot and settles into a calm line
  const last = pts[pts.length - 1];
  const exit = [[last[0] - 30, 300], [230, 336]];
  const scribble = smooth([...pts, ...exit]);
  const calm = 'M230 336 C 290 352, 340 352, 400 344 S 490 332, 540 336';

  const wordPos = [
    { x: 92, y: 92, rot: -9, size: 34 },
    { x: 452, y: 62, rot: 7, size: 26 },
    { x: 486, y: 232, rot: -5, size: 30 },
  ];
  const wordEls = words.slice(0, 3).map((w, i) => {
    const p = wordPos[i];
    return `<text class="art-word art-word-${i + 1}" x="${p.x}" y="${p.y}" font-size="${p.size}" transform="rotate(${p.rot} ${p.x} ${p.y})" text-anchor="middle">${w}</text>`;
  }).join('');

  // In RTL the drawing is mirrored so the thread "reads" in the language direction,
  // while the words stay un-mirrored.
  const flip = dir === 'rtl' ? `transform="translate(${W} 0) scale(-1 1)"` : '';
  return `<svg class="hero-art" viewBox="0 0 ${W} ${H}" role="img" aria-hidden="true" focusable="false" preserveAspectRatio="xMidYMid meet">
  <circle class="art-sun" cx="${dir === 'rtl' ? W - 300 : 300}" cy="182" r="150"/>
  <g ${flip}>
    <path class="art-scribble" d="${scribble}" pathLength="1"/>
    <path class="art-calm" d="${calm}" pathLength="1"/>
    <circle class="art-dot" cx="540" cy="336" r="7"/>
  </g>
  ${wordEls}
</svg>`;
}
