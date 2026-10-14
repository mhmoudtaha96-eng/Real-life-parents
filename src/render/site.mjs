/**
 * Shared page renderer. Used by:
 *   - build.mjs        → static fallback pages in dist/ (from the JSON files)
 *   - worker/index.js  → live pages built from the database (courses edited in /admin/)
 *
 * content = {
 *   courses: [course, …]   course JSON objects (same shape as src/content/courses/*.json),
 *                           plus `visible` (shown on the site) and `featured` (the home page course)
 *   session: {…}            1-to-1 settings (same shape as src/content/sessions/one-to-one.json)
 * }
 */
import { coursePage, layout, header, footer } from '../templates/page.mjs';
import { sessionPage } from '../templates/session.mjs';
import { activeTier, esc } from '../templates/helpers.mjs';

export function createRenderer({ site, i18n, instructors, qrPath = '', assetVersion = '', linkIndex = false }) {
  const langPrefix = (lang) => (lang === site.defaultLang ? '' : `${lang}/`);
  const abs = (route) => `${site.siteUrl}/${route}`;
  const depth = (route) => route.split('/').filter(Boolean).length;
  const relLink = (from, to) => ((('../'.repeat(depth(from))) + to + (linkIndex ? 'index.html' : '')) || './');
  const stamp = (html) => (assetVersion ? html.replace(/(assets\/(?:css|js)\/main\.(?:css|js))"/g, `$1?v=${assetVersion}"`) : html);

  /** Visible courses in display order; the featured one first */
  function visibleCourses(content) {
    const list = (content.courses || []).filter((c) => c.visible !== false && c.status !== 'draft');
    const feat = list.find((c) => c.featured) || list.find((c) => c.slug === site.featuredCourse) || list[0];
    return { list, featured: feat || null };
  }
  const courseRoute = (course, lang, featured) =>
    (featured && course.slug === featured.slug ? langPrefix(lang) : `${langPrefix(lang)}courses/${course.slug}/`);
  const sessionRoute = (session, lang) => `${langPrefix(lang)}${session.slug}/`;

  /** Every public page: [{ route, lang, kind, course? }] */
  function routes(content) {
    const { list, featured } = visibleCourses(content);
    const out = [];
    for (const lang of site.languages) {
      if (!featured) out.push({ route: langPrefix(lang), lang, kind: 'empty' });
      for (const c of list) out.push({ route: courseRoute(c, lang, featured), lang, kind: 'course', course: c });
      if (content.session) out.push({ route: sessionRoute(content.session, lang), lang, kind: 'session' });
    }
    return out;
  }

  function baseLinks(route, lang, content, selfRoutes) {
    return {
      home: Object.fromEntries(site.languages.map((l) => [l, relLink(route, langPrefix(l))])),
      self: Object.fromEntries(site.languages.map((l) => [l, relLink(route, selfRoutes[l])])),
      session: Object.fromEntries(site.languages.map((l) => [l, content.session ? relLink(route, sessionRoute(content.session, l)) : '#'])),
    };
  }

  /** Render one route ('' / 'en/' / 'courses/x/' / 'book-session/' …). Returns HTML or null (404). */
  function render(route, content, now = new Date(), { bare = false } = {}) {
    const page = routes(content).find((p) => p.route === route);
    if (!page) return null;
    const { lang } = page;
    const t = i18n[lang];
    const { list, featured } = visibleCourses(content);
    const anyCourse = featured || (content.courses || [])[0];
    const instructor = instructors[(anyCourse && anyCourse.instructor) || Object.keys(instructors)[0]];
    const rel = '../'.repeat(depth(route));
    const common = {
      site, t, lang, instructor, ins: instructor.content[lang], rel,
      qrSrc: qrPath ? rel + qrPath : '', preview: bare,
    };

    if (page.kind === 'course') {
      const course = page.course;
      const selfRoutes = Object.fromEntries(site.languages.map((l) => [l, courseRoute(course, l, featured)]));
      const isHome = featured && course.slug === featured.slug;
      return stamp(coursePage({
        ...common, course, c: course.content[lang],
        url: abs(route),
        alternates: Object.fromEntries(site.languages.map((l) => [l, abs(selfRoutes[l])])),
        buildTier: activeTier(course.pricing, now),
        links: baseLinks(route, lang, content, selfRoutes),
        otherCourses: isHome ? list.filter((x) => x.slug !== course.slug).map((x) => ({ ...x, href: relLink(route, courseRoute(x, lang, featured)) })) : [],
      }));
    }

    if (page.kind === 'session') {
      const session = content.session;
      const selfRoutes = Object.fromEntries(site.languages.map((l) => [l, sessionRoute(session, l)]));
      const home = relLink(route, langPrefix(lang));
      const ref = anyCourse || { content: { [lang]: { name: '', kicker: '' } }, seo: {} };
      const rules = session.price?.discountRules || {};
      const dc = (content.courses || []).find((x) => x.slug === rules.workshopCourse) || featured;
      return stamp(sessionPage({
        ...common, session, course: ref, c: ref.content[lang],
        url: abs(route),
        alternates: Object.fromEntries(site.languages.map((l) => [l, abs(selfRoutes[l])])),
        links: baseLinks(route, lang, content, selfRoutes),
        navBase: home, isSessionPage: true,
        discountCourseName: dc ? dc.content[lang]?.name || dc.content.ar?.name : '',
        headerCta: featured ? `<a class="btn btn-primary btn-sm" href="${home}#details">${t.bookShort}</a>` : ' ',
      }));
    }

    // No course is visible right now: a simple page pointing to the 1-to-1 sessions
    const selfRoutes = Object.fromEntries(site.languages.map((l) => [l, langPrefix(l)]));
    const ctx = {
      ...common, course: { seo: { [lang]: { title: site.brand, description: t.empty.text } } }, c: { name: site.brand, kicker: '' },
      seo: { title: `${site.brand}`, description: t.empty.text },
      url: abs(route), alternates: Object.fromEntries(site.languages.map((l) => [l, abs(selfRoutes[l])])),
      links: baseLinks(route, lang, content, selfRoutes),
      products: [], jsonld: '{}', headerCta: ' ',
    };
    return stamp(layout(ctx, `${header(ctx)}<main id="main" class="wrap notfound">
      <h1 class="h2">${esc(t.empty.title)}</h1><p>${esc(t.empty.text)}</p>
      ${content.session ? `<p><a class="btn btn-primary btn-lg" href="${ctx.links.session[lang]}">${esc(t.session.ctaFromCoach)}</a></p>` : ''}
    </main>${footer(ctx)}`));
  }

  function sitemap(content, now = new Date()) {
    const today = now.toISOString().slice(0, 10);
    const pages = routes(content).filter((p) => p.kind !== 'empty' && p.lang === site.defaultLang);
    const { featured } = visibleCourses(content);
    const entries = pages.map((p) => {
      const alts = site.languages.map((l) => {
        const r = p.kind === 'course' ? courseRoute(p.course, l, featured) : sessionRoute(content.session, l);
        return [l, abs(r)];
      });
      const prio = p.route === '' ? '1.0' : p.kind === 'session' ? '0.9' : '0.8';
      return site.languages.map((l) => {
        const loc = alts.find(([x]) => x === l)[1];
        return `  <url>
    <loc>${loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${prio}</priority>
${alts.map(([x, h]) => `    <xhtml:link rel="alternate" hreflang="${x}" href="${h}"/>`).join('\n')}
    <xhtml:link rel="alternate" hreflang="x-default" href="${alts.find(([x]) => x === site.defaultLang)[1]}"/>
  </url>`;
      }).join('\n');
    });
    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries.join('\n')}
</urlset>
`;
  }

  return { routes, render, sitemap, visibleCourses };
}
