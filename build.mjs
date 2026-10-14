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
import { coursePage } from './src/templates/page.mjs';
import { sessionPage } from './src/templates/session.mjs';
import { adminPage } from './src/templates/admin.mjs';
import { activeTier } from './src/templates/helpers.mjs';
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
const langPrefix = (lang) => (lang === site.defaultLang ? '' : `${lang}/`);
const sessionRoute = (s, lang) => `${langPrefix(lang)}${s.slug}/`;
const mainSession = sessions[0];

// ---------- URL scheme ----------
const routeFor = (course, lang) => {
  const featured = course.slug === site.featuredCourse;
  const langPrefix = lang === site.defaultLang ? '' : `${lang}/`;
  return featured ? langPrefix : `${langPrefix}courses/${course.slug}/`;
};
const abs = (route) => `${site.siteUrl}/${route}`;
const depth = (route) => route.split('/').filter(Boolean).length;
// Relative link from one route to another (works on any host and in local previews)
const relLink = (from, to) => {
  const up = '../'.repeat(depth(from));
  const target = to + (PREVIEW ? 'index.html' : '');
  return (up + target) || './';
};

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

// ---------- pages ----------
const sitemap = [];
const now = new Date();
const listed = courses.filter((c) => c.status === 'open' || c.status === 'soon');

for (const course of courses) {
  const instructor = instructors[course.instructor];
  const routes = Object.fromEntries(site.languages.map((l) => [l, routeFor(course, l)]));
  const homeRoutes = Object.fromEntries(site.languages.map((l) => [l, l === site.defaultLang ? '' : `${l}/`]));

  for (const lang of site.languages) {
    const route = routes[lang];
    const t = i18n[lang];
    const isHome = course.slug === site.featuredCourse;
    const ctx = {
      site, t, lang, course, instructor,
      c: course.content[lang],
      ins: instructor.content[lang],
      url: abs(route),
      alternates: Object.fromEntries(site.languages.map((l) => [l, abs(routes[l])])),
      rel: '../'.repeat(depth(route)),
      qrSrc: qrPath ? '../'.repeat(depth(route)) + qrPath : '',
      buildTier: activeTier(course.pricing, now),
      links: {
        home: Object.fromEntries(site.languages.map((l) => [l, relLink(route, homeRoutes[l])])),
        self: Object.fromEntries(site.languages.map((l) => [l, relLink(route, routes[l])])),
        session: Object.fromEntries(site.languages.map((l) => [l, mainSession ? relLink(route, sessionRoute(mainSession, l)) : '#'])),
      },
      otherCourses: isHome
        ? listed.filter((x) => x.slug !== course.slug).map((x) => ({ ...x, href: relLink(route, routeFor(x, lang)) }))
        : [],
      preview: false,
    };
    write(path.join(OUT, route, 'index.html'), coursePage(ctx));
    if (PREVIEW && lang === site.defaultLang && isHome) {
      write(path.join(ROOT, 'preview/index.html'), coursePage({ ...ctx, preview: true }));
    }
    sitemap.push({ loc: ctx.url, alternates: ctx.alternates, priority: isHome ? '1.0' : '0.8' });
  }
}

// ---------- 1-to-1 session booking pages ----------
const featured = courses.find((c) => c.slug === site.featuredCourse) || courses[0];
for (const session of sessions) {
  const instructor = instructors[session.instructor];
  const routes = Object.fromEntries(site.languages.map((l) => [l, sessionRoute(session, l)]));
  for (const lang of site.languages) {
    const route = routes[lang];
    const t = i18n[lang];
    const home = relLink(route, langPrefix(lang));
    const ctx = {
      site, t, lang, session, instructor,
      course: featured, c: featured.content[lang],
      ins: instructor.content[lang],
      url: abs(route),
      alternates: Object.fromEntries(site.languages.map((l) => [l, abs(routes[l])])),
      rel: '../'.repeat(depth(route)),
      qrSrc: qrPath ? '../'.repeat(depth(route)) + qrPath : '',
      links: {
        home: Object.fromEntries(site.languages.map((l) => [l, relLink(route, langPrefix(l))])),
        self: Object.fromEntries(site.languages.map((l) => [l, relLink(route, routes[l])])),
        session: Object.fromEntries(site.languages.map((l) => [l, relLink(route, routes[l])])),
      },
      navBase: home,
      isSessionPage: true,
      headerCta: `<a class="btn btn-primary btn-sm" href="${home}#details">${t.bookShort}</a>`,
      preview: false,
    };
    write(path.join(OUT, route, 'index.html'), sessionPage(ctx));
    sitemap.push({ loc: ctx.url, alternates: ctx.alternates, priority: '0.9' });
  }
}

// ---------- admin dashboard (data loads from /api/admin with the password) ----------
write(path.join(OUT, 'admin/index.html'), adminPage({ site }));

// ---------- catalog for the booking API (worker/) ----------
// Prices, schedules and availability come from the same content files as the pages,
// so the server always charges what the page shows.
write(path.join(ROOT, 'worker/catalog.generated.json'), JSON.stringify({
  currency: site.currency,
  courses: courses.map((c) => ({ id: c.id, slug: c.slug, name: { ar: c.content.ar.name, en: c.content.en.name }, pricing: c.pricing, schedule: c.schedule })),
  sessions: sessions.map(({ _note, content, ...s }) => ({ ...s, name: { ar: i18n.ar.session.productName, en: i18n.en.session.productName } })),
}, null, 2));

// ---------- SEO files ----------
const today = now.toISOString().slice(0, 10);
write(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${sitemap.map((u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${u.priority}</priority>
${Object.entries(u.alternates).map(([l, h]) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${h}"/>`).join('\n')}
    <xhtml:link rel="alternate" hreflang="x-default" href="${u.alternates[site.defaultLang]}"/>
  </url>`).join('\n')}
</urlset>
`);

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

// cache-busting: version every CSS/JS URL with a hash of the asset contents, so browsers
// always load the newest code after a deploy (and keep using the cache when nothing changed).
const { createHash } = await import('node:crypto');
const assetFiles = walk(path.join(OUT, 'assets')).filter((f) => /\.(js|css)$/.test(f)).sort();
const hash = createHash('sha1');
for (const f of assetFiles) hash.update(fs.readFileSync(f));
const stamp = hash.digest('hex').slice(0, 10);
// 1) every relative import inside the JS modules: './x.js' → './x.js?v=…'
for (const f of assetFiles.filter((f) => f.endsWith('.js'))) {
  const js = fs.readFileSync(f, 'utf8').replace(/((?:from|import)\s*\(?\s*)(['"])(\.{1,2}\/[^'"?]+\.js)\2/g, `$1$2$3?v=${stamp}$2`);
  fs.writeFileSync(f, js);
}
// 2) the stylesheet and entry script referenced from the pages
for (const f of walk(OUT).filter((f) => f.endsWith('.html'))) {
  const html = fs.readFileSync(f, 'utf8').replace(/(assets\/(?:css|js)\/main\.(?:css|js))"/g, `$1?v=${stamp}"`);
  fs.writeFileSync(f, html);
}
if (PREVIEW) {
  // preview copies dist assets next to the preview page
  copyDir(path.join(OUT, 'assets'), path.join(ROOT, 'preview/assets'));
  copyDir(path.join(OUT, 'en'), path.join(ROOT, 'preview/en'));
  for (const s of sessions) copyDir(path.join(OUT, s.slug), path.join(ROOT, 'preview', s.slug));
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]));
}

console.log(`✓ Built ${sitemap.length} pages → dist/${PREVIEW ? ' (+ preview/)' : ''}`);
