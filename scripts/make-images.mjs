// Renders favicons, app icons and the social-share (Open Graph) images with Playwright.
// Run after changing the course title/dates:  npm run images
// Needs Playwright available (npx playwright install chromium) — the PNGs are committed, so this is optional.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { heroArt } from '../src/templates/scribble.mjs';
import { fmt, activeTier } from '../src/templates/helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IMG = path.join(ROOT, 'src/assets/img');
const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/config/site.json'), 'utf8'));
const course = JSON.parse(fs.readFileSync(path.join(ROOT, `src/content/courses/${site.featuredCourse}.json`), 'utf8'));
const i18n = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/content/i18n.json'), 'utf8'));

let chromium;
try { ({ chromium } = await import('playwright')); }
catch { ({ chromium } = await import(process.env.PLAYWRIGHT_CORE || '/opt/npm-tools/node_modules/playwright-core/index.mjs')); }

const FONTS = `<link href="https://fonts.googleapis.com/css2?family=Baloo+Bhaijaan+2:wght@600;800&family=IBM+Plex+Sans+Arabic:wght@500;600;700&display=block" rel="stylesheet">`;
const favicon = fs.readFileSync(path.join(IMG, 'favicon.svg'), 'utf8');

function og(lang) {
  const c = course.content[lang];
  const t = i18n[lang];
  const s = course.schedule.sessions;
  const tier = activeTier(course.pricing);
  return `<!doctype html><html lang="${lang}" dir="${t.dir}"><head><meta charset="utf-8">${FONTS}<style>
  *{box-sizing:border-box;margin:0}
  body{width:1200px;height:630px;background:#F1F5EE;font-family:"IBM Plex Sans Arabic",sans-serif;color:#1F2D35;display:grid;grid-template-columns:1.15fr .85fr;align-items:center;padding:56px 64px;gap:24px;overflow:hidden}
  .copy{display:grid;gap:18px}
  .brand{display:flex;align-items:center;gap:12px;font:600 26px/1 "Baloo Bhaijaan 2";direction:ltr;justify-content:${lang === 'ar' ? 'flex-end' : 'flex-start'}}
  .brand b{color:#1D6F66;font-weight:800} .brand svg{width:44px;height:44px}
  .k{font-weight:600;color:#1D6F66;font-size:28px}
  h1{font:800 ${lang === 'ar' ? 92 : 78}px/1.02 "Baloo Bhaijaan 2";letter-spacing:-.02em}
  .meta{display:flex;gap:12px;flex-wrap:wrap}
  .meta span{background:#fff;border:1px solid #D5DFD3;border-radius:999px;padding:8px 18px;font-weight:600;font-size:24px}
  .price{display:inline-flex;gap:14px;align-items:baseline;background:#FFC94A;border-radius:18px;padding:10px 22px;width:fit-content;font:800 40px/1 "Baloo Bhaijaan 2"}
  .price small{font:600 22px "IBM Plex Sans Arabic"}
  .price s{font:600 24px "IBM Plex Sans Arabic";opacity:.7;text-decoration-color:#E2453A;text-decoration-thickness:3px}
  .art svg{width:100%;height:auto}
  .art-sun{fill:#FFF0C4}.art-scribble{fill:none;stroke:#E2453A;stroke-width:3.4;stroke-linecap:round}.art-calm{fill:none;stroke:#1D6F66;stroke-width:7;stroke-linecap:round}.art-dot{fill:#1D6F66}.art-word{font-family:"Baloo Bhaijaan 2";font-weight:800;fill:#E2453A}
  </style></head><body>
  <div class="copy">
    <div class="brand">${favicon}<span>Real Life <b>Parents</b></span></div>
    <p class="k">${c.kicker}</p>
    <h1>${c.name}</h1>
    <div class="meta"><span>${fmt.dayList(s.map((x) => x.start), lang)}</span><span>Zoom Live</span></div>
    <div class="price">${fmt.num(tier.amount, lang)} <small>${t.currency}</small>${tier.id === 'early' ? ` <s>${fmt.num(course.pricing.tiers.at(-1).amount, lang)}</s>` : ''}</div>
  </div>
  <div class="art">${heroArt({ words: c.hero_words, dir: t.dir })}</div>
  </body></html>`;
}

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const page = await browser.newPage();
async function shot(html, file, w, h) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(IMG, file), type: 'png' });
  console.log('✓', file);
}
const iconHtml = (px, pad) => `<!doctype html><body style="margin:0;width:${px}px;height:${px}px;background:#1D6F66;display:grid;place-items:center">${favicon.replace('<svg ', `<svg width="${px - pad * 2}" height="${px - pad * 2}" `)}</body>`;
await shot(iconHtml(32, 0), 'favicon-32.png', 32, 32);
await shot(iconHtml(180, 18), 'apple-touch-icon.png', 180, 180);
await shot(iconHtml(192, 18), 'logo-192.png', 192, 192);
await shot(iconHtml(512, 48), 'logo-512.png', 512, 512);
for (const lang of site.languages) await shot(og(lang), `og-${lang}.png`, 1200, 630);
await browser.close();
