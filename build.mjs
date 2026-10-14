#!/usr/bin/env node
/**
 * Real Life Parents — static site builder (no framework).
 *
 *   node build.mjs            → production build into ./dist
 *   node build.mjs --preview  → same, plus ./preview (host-wrapped page for quick previews)
 *
 * Content lives in src/content (one JSON per course / instructor), settings in src/config/site.json.
 * The featured course renders at "/" (Arabic) and "/en/". Every other course renders at
 * "/courses/<slug>/" and "/en/courses/<slug>/" and is listed on the home page.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRenderer } from './src/render/site.mjs';
import { adminPage } from './src/templates/admin.mjs';
import { qrSvg } from './scripts/qr.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'dist');
const PREVIEW = process.argv.includes('--preview');

const readJSON = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const write = (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };
const copyDir = (from, to) => fs.cpSync(from, to, { recursive: true });

const site = readJSON(path.join(SRC, 'config/site.json'));
const i18n = readJSON(path.join(SRC, 'content/i18n.json'));
const loadAll = (dir) => fs.readdirSync(path.join(SRC, dir)).filter((f) => f.endsWith('.json')).map((f) => readJSON(path.join(SRC, dir, f)));
const courses = loadAll('content/courses').filter((c) => c.status !== 'draft');
const instructors = Object.fromEntries(loadAll('content/instructors').map((x) => [x.id, x]));
const sessions = loadAll('content/sessions');

// ---------- reset output ----------
fs.rmSync(OUT, { recursive: true, force: true });
copyDir(path.join(SRC, 'assets'), path.join(OUT, 'assets'));

// ---------- InstaPay QR ----------
let qrPath = site.payments.instapay?.qrImage?.replace(/^\//, '');
if (site.payments.instapay?.enabled && !qrPath) {
  try {
    write(path.join(OUT, 'assets/img/instapay-qr.svg'), qrSvg(site.payments.instapay.link));
    qrPath = 'assets/img/instapay-qr.svg';
  } catch (e) {
    console.warn('⚠ Could not generate the InstaPay QR. The QR block will be hidden.', e.message);
  }
}

// ---------- cache-busting version: hash of all CSS/JS ----------
// Every CSS/JS URL gets ?v=<hash>, so browsers load the newest code after a deploy
// (and keep using their cache when nothing changed).
const { createHash } = await import('node:crypto');
const assetFiles = walk(path.join(OUT, 'assets')).filter((f) => /\.(js|css)$/.test(f)).sort();
const hash = createHash('sha1');
for (const f of assetFiles) hash.update(fs.readFileSync(f));
const stamp = hash.digest('hex').slice(0, 10);
for (const f of assetFiles.filter((f) => f.endsWith('.js'))) {
  const js = fs.readFileSync(f, 'utf8').replace(/((?:from|import)\s*\(?\s*)(['"])(\.{1,2}\/[^'"?]+\.js)\2/g, `$1$2$3?v=${stamp}$2`);
  fs.writeFileSync(f, js);
}

// ---------- pages ----------
// The JSON files are the starting content. Once the database is connected, courses and
// 1-to-1 settings are edited in /admin/ and the live pages are rendered by worker/index.js.
const seedCourses = courses.map((c, i) => ({ ...c, visible: c.status !== 'hidden', featured: c.slug === site.featuredCourse, sort: i }));
const seedSession = sessions[0] || null;
const content = { courses: seedCourses, session: seedSession };
const now = new Date();
const renderer = createRenderer({ site, i18n, instructors, qrPath, assetVersion: stamp, linkIndex: PREVIEW });
const pages = renderer.routes(content);
for (const pg of pages) {
  write(path.join(OUT, pg.route, 'index.html'), renderer.render(pg.route, content, now));
}
// preview/: the home page without the html/head wrapper (the preview host adds its own)
if (PREVIEW) write(path.join(ROOT, 'preview/index.html'), renderer.render('', content, now, { bare: true }));
const sitemapCount = pages.filter((p) => p.kind !== 'empty').length;

// ---------- admin dashboard (data loads from /api/admin with the password) ----------
write(path.join(OUT, 'admin/index.html'), adminPage({ site }));

// ---------- content for the live site + booking API (worker/) ----------
// Starting content for the database, plus everything the server needs to render pages.
write(path.join(ROOT, 'worker/content.generated.json'), JSON.stringify({
  site, i18n, instructors, qrPath, assetVersion: stamp,
  seed: { courses: seedCourses, session: seedSession },
}));

// ---------- SEO files ----------
write(path.join(OUT, 'sitemap.xml'), renderer.sitemap(content, now));

write(path.join(OUT, 'robots.txt'), `User-agent: *
Allow: /
Disallow: /admin/
Disallow: /api/

Sitemap: ${site.siteUrl}/sitemap.xml
`);

write(path.join(OUT, 'site.webmanifest'), JSON.stringify({
  name: site.brand, short_name: 'RLP', lang: site.defaultLang, dir: 'rtl', start_url: '/', display: 'standalone',
  background_color: '#F1F5EE', theme_color: site.themeColor,
  icons: [{ src: '/assets/img/logo-192.png', sizes: '192x192', type: 'image/png' }, { src: '/assets/img/logo-512.png', sizes: '512x512', type: 'image/png' }],
}, null, 2));

// Cloudflare Pages / Netlify: headers & redirects
write(path.join(OUT, '_headers'), `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: SAMEORIGIN
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Strict-Transport-Security: max-age=31536000; includeSubDomains

/assets/img/*
  Cache-Control: public, max-age=2592000

/assets/css/*
  Cache-Control: public, max-age=0, must-revalidate

/assets/js/*
  Cache-Control: public, max-age=0, must-revalidate

/*.html
  Cache-Control: public, max-age=0, must-revalidate

/assets/admin/*
  Cache-Control: no-store

/admin/*
  X-Robots-Tag: noindex, nofollow
  Cache-Control: no-store
`);
write(path.join(OUT, '_redirects'), [
  `/courses/${site.featuredCourse}/  /  301`,
  `/en/courses/${site.featuredCourse}/  /en/  301`,
  '/ar/*  /:splat  301',
].join('\n') + '\n');

// 404
const t404 = i18n.ar;
write(path.join(OUT, '404.html'), `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>الصفحة مش موجودة | ${site.brand}</title><meta name="robots" content="noindex"><link rel="stylesheet" href="/assets/css/main.css"></head>
<body><div class="page"><main class="wrap notfound"><h1 class="h2">الصفحة دي مش موجودة</h1><p>Page not found.</p><p><a class="btn btn-primary" href="/">${t404.book}</a> <a class="btn btn-ghost" href="/en/">English</a></p></main></div></body></html>`);

// admin page gets the same asset version
for (const f of walk(OUT).filter((f) => f.endsWith('.html'))) {
  const html = fs.readFileSync(f, 'utf8').replace(/(assets\/(?:css|js|admin)\/(?:main|admin)\.(?:css|js))"/g, `$1?v=${stamp}"`);
  fs.writeFileSync(f, html);
}
if (PREVIEW) {
  // preview copies dist assets next to the preview page
  copyDir(path.join(OUT, 'assets'), path.join(ROOT, 'preview/assets'));
  copyDir(path.join(OUT, 'en'), path.join(ROOT, 'preview/en'));
  if (seedSession) { copyDir(path.join(OUT, seedSession.slug), path.join(ROOT, 'preview', seedSession.slug)); copyDir(path.join(OUT, 'en', seedSession.slug), path.join(ROOT, 'preview/en', seedSession.slug)); }
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]));
}

console.log(`✓ Built ${sitemapCount} pages → dist/${PREVIEW ? ' (+ preview/)' : ''}`);
