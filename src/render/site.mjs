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
import { coursePage, homePage } from '../templates/page.mjs';
import { sessionPage } from '../templates/session.mjs';
import { activeTier, esc } from '../templates/helpers.mjs';
import { parseVideo } from '../assets/js/media/video.js';

/** Coach photo, videos and album as edited in /admin/ (starting values come from the instructor JSON) */
export function coachFromInstructor(ins) {
  const m = ins.media || {};
  const v = m.video || {};
  return {
    photo: ins.photo ? { src: ins.photo, small: ins.photo.replace('.webp', '-320.webp') } : null,
    videos: v.instagram ? [{ url: `https://www.instagram.com/reel/${v.instagram}/`, caption: {} }] : [],
    album: (m.album || []).map((a) => ({ src: a.src, thumb: a.thumb, w: a.w, h: a.h, tw: a.tw, th: a.th, caption: a.caption || {}, alt: a.alt || {} })),
  };
}
/** The instructor object the templates read, with the admin's photo / videos / album applied */
export function applyCoach(ins, coach) {
  if (!coach) return { ...ins, photoSmall: ins.photo ? ins.photo.replace('.webp', '-320.webp') : '', media: { ...(ins.media || {}), videos: ins.media?.video?.instagram ? [parseVideo(`https://www.instagram.com/reel/${ins.media.video.instagram}/`)] : [] } };
  const pick = (o, lang) => (o && (o[lang] || o.ar || o.en)) || '';
  return {
    ...ins,
    photo: coach.photo?.src || '',
    photoSmall: coach.photo?.small || coach.photo?.src || '',
    media: {
      videos: (coach.videos || []).map((v) => { const p = parseVideo(v.url); return p ? { ...p, caption: v.caption || {} } : null; }).filter(Boolean),
      album: (coach.album || []).filter((a) => a && a.src).map((a) => ({
        ...a, thumb: a.thumb || a.src, tw: a.tw || a.w, th: a.th || a.h,
        shape: a.h > a.w * 1.1 ? 'tall' : 'land',
        caption: { ar: pick(a.caption, 'ar'), en: pick(a.caption, 'en') },
        alt: { ar: pick(a.alt, 'ar') || pick(a.caption, 'ar') || ins.content.ar.name, en: pick(a.alt, 'en') || pick(a.caption, 'en') || ins.content.en.name },
      })),
    },
  };
}

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
    const instructor = applyCoach(instructors[(anyCourse && anyCourse.instructor) || Object.keys(instructors)[0]], content.coach);
    const rel = '../'.repeat(depth(route));
    const common = {
      site, t, lang, instructor, ins: instructor.content[lang], rel,
      qrSrc: qrPath ? rel + qrPath : '', preview: bare,
    };

    if (page.kind === 'course') {
      const course = page.course;
      const selfRoutes = Object.fromEntries(site.languages.map((l) => [l, courseRoute(course, l, featured)]));
            return stamp(coursePage({
        ...common, course, c: course.content[lang],
        url: abs(route),
        alternates: Object.fromEntries(site.languages.map((l) => [l, abs(selfRoutes[l])])),
        buildTier: activeTier(course.pricing, now),
        links: baseLinks(route, lang, content, selfRoutes),
        // every visible course is listed on every course page (the home-page course links to the home page)
        otherCourses: list.filter((x) => x.slug !== course.slug).map((x) => ({ ...x, href: relLink(route, courseRoute(x, lang, featured)) })),
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

    // No course is shown right now (e.g. the workshop is full): the home page keeps the coach,
    // her videos and photos and the 1-to-1 sessions; course details and booking are hidden.
    const selfRoutes = Object.fromEntries(site.languages.map((l) => [l, langPrefix(l)]));
    const H = t.home;
    const base = site.siteUrl;
    const jsonld = JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'Organization', '@id': `${base}/#org`, name: site.brand, url: `${base}/`, logo: `${base}/assets/img/logo-512.png`, sameAs: [site.social.instagram] },
        { '@type': 'Person', '@id': `${base}/#${instructor.id}`, name: common.ins.name, jobTitle: common.ins.jobTitle, ...(instructor.photo ? { image: base + instructor.photo } : {}), sameAs: instructor.sameAs || [] },
        { '@type': 'WebPage', '@id': abs(route), url: abs(route), name: `${H.title} | ${site.brand}`, inLanguage: lang, about: { '@id': `${base}/#${instructor.id}` }, publisher: { '@id': `${base}/#org` } },
      ],
    }).replace(/</g, '\\u003c');
    const ctx = {
      ...common, noCourse: true, hasMedia: !!(instructor.media?.videos?.length || instructor.media?.album?.length),
      course: { seo: { [lang]: { title: `${H.title} | ${site.brand}`, description: H.text } } }, c: { name: H.title, kicker: H.kicker },
      seo: { title: `${H.title} | ${site.brand}`, description: H.text },
      url: abs(route), alternates: Object.fromEntries(site.languages.map((l) => [l, abs(selfRoutes[l])])),
      links: baseLinks(route, lang, content, selfRoutes),
      products: [], jsonld,
      headerCta: content.session ? `<a class="btn btn-primary btn-sm" href="${relLink(route, sessionRoute(content.session, lang))}">${esc(t.session.navShort || t.nav.session)}</a>` : ' ',
    };
    return stamp(homePage(ctx));
  }

  function sitemap(content, now = new Date()) {
    const today = now.toISOString().slice(0, 10);
    const pages = routes(content).filter((p) => p.lang === site.defaultLang);
    const { featured } = visibleCourses(content);
    const entries = pages.map((p) => {
      const alts = site.languages.map((l) => {
        const r = p.kind === 'course' ? courseRoute(p.course, l, featured) : p.kind === 'empty' ? langPrefix(l) : sessionRoute(content.session, l);
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
