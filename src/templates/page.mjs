import { icons } from './icons.mjs';
import { heroArt } from './scribble.mjs';
import { esc, fmt, structuredData } from './helpers.mjs';
import { COUNTRIES, DEFAULT_COUNTRY, countryByIso } from '../assets/js/data/countries.js';

/**
 * Renders a full course landing page.
 * ctx = { site, t (ui strings), lang, course, c (course content in lang), instructor, ins (instructor content),
 *         url (absolute canonical), alternates {ar,en}, rel (relative prefix to site root), otherCourses, links, preview }
 */
export function coursePage(ctx) {
  const { t, lang, c } = ctx;
  return layout(ctx, `
${header(ctx)}
<main id="main">
${hero(ctx)}
${pain(ctx)}
${audience(ctx)}
${curriculum(ctx)}
${includes(ctx)}
${coach(ctx)}
${media(ctx)}
${details(ctx)}
${how(ctx)}
${faq(ctx)}
${moreCourses(ctx)}
${finalCta(ctx)}
</main>
${footer(ctx)}
${stickyBar(ctx)}
${checkoutDialog(ctx)}
`);
}

/* ---------- document shell ---------- */
export function layout(ctx, body) {
  const { site, t, lang, course, c, url, alternates, rel, preview } = ctx;
  const seo = ctx.seo || course.seo[lang];
  const og = `${site.siteUrl}/assets/img/og-${lang}.png`;
  const head = `
<title>${esc(seo.title)}</title>
<meta name="description" content="${esc(seo.description)}">
<link rel="canonical" href="${url}">
<link rel="alternate" hreflang="ar" href="${alternates.ar}">
<link rel="alternate" hreflang="en" href="${alternates.en}">
<link rel="alternate" hreflang="x-default" href="${alternates.ar}">
<meta name="robots" content="index,follow,max-image-preview:large">
<meta name="theme-color" content="${site.themeColor}">
<meta name="color-scheme" content="light only">
<meta name="author" content="${esc(ctx.ins.name)}">
${site.googleSiteVerification ? `<meta name="google-site-verification" content="${esc(site.googleSiteVerification)}">` : ''}
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(site.brand)}">
<meta property="og:title" content="${esc(seo.title)}">
<meta property="og:description" content="${esc(seo.description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${og}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(ctx.ogAlt || (c.name + ' — ' + c.kicker))}">
<meta property="og:locale" content="${t.ogLocale}">
<meta property="og:locale:alternate" content="${lang === 'ar' ? 'en_US' : 'ar_EG'}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(seo.title)}">
<meta name="twitter:description" content="${esc(seo.description)}">
<meta name="twitter:image" content="${og}">
<link rel="icon" href="${rel}assets/img/favicon.svg" type="image/svg+xml">
<link rel="icon" href="${rel}assets/img/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="${rel}assets/img/apple-touch-icon.png">
<link rel="manifest" href="${rel}site.webmanifest">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Baloo+Bhaijaan+2:wght@500;700;800&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="${rel}assets/css/main.css">
<script type="application/ld+json">${ctx.jsonld || structuredData(ctx)}</script>
${analytics(site)}`;

  const scripts = `
<script type="application/json" id="rlp-data">${pageData(ctx)}</script>
<script type="module" src="${rel}assets/js/main.js"></script>`;

  if (preview) {
    // Artifact preview: the host supplies <html>/<head>/<body>.
    return `${head}\n<div class="page" lang="${lang}" dir="${t.dir}">${body}</div>${scripts}\n`;
  }
  return `<!doctype html>
<html lang="${lang}" dir="${t.dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${head}
</head>
<body>
<div class="page">${body}</div>
${scripts}
</body>
</html>
`;
}

function analytics(site) {
  let out = '';
  if (site.analytics?.ga4) {
    out += `<script async src="https://www.googletagmanager.com/gtag/js?id=${esc(site.analytics.ga4)}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${esc(site.analytics.ga4)}');</script>`;
  }
  if (site.analytics?.metaPixel) {
    out += `<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${esc(site.analytics.metaPixel)}');fbq('track','PageView');</script>`;
  }
  return out;
}

function pageData(ctx) {
  const { site, t, lang, course, c, rel, qrSrc } = ctx;
  const payments = {};
  for (const [id, p] of Object.entries(site.payments)) {
    if (!p.enabled) { payments[id] = { enabled: false }; continue; }
    const { _todo, _note, _qrNote, qrImage, ...pub } = p;
    payments[id] = pub;
    if (id === 'instapay') payments[id].qr = qrSrc;
  }
  const data = {
    lang,
    locale: t.locale,
    currency: site.currency,
    whatsapp: site.contact.whatsapp,
    strings: { session: t.session, checkout: t.checkout, instapay: t.instapay, bank: t.bank, card: t.card, currency: t.currency, days: t.days, hours: t.hours, minutes: t.minutes, earlyEnded: t.earlyEnded, insteadOf: t.insteadOf },
    products: ctx.products || [{
      id: course.id,
      slug: course.slug,
      type: course.type,
      name: c.name,
      pricing: course.pricing,
    }],
    payments,
    ...(ctx.pageExtra || {}),
  };
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

/* ---------- header / footer ---------- */
export function header(ctx) {
  const { t, lang, links, site } = ctx;
  const nb = ctx.navBase || '';
  const other = lang === 'ar' ? 'en' : 'ar';
  return `<a class="skip" href="#main">${t.skip}</a>
<header class="site-header">
  <div class="wrap header-inner">
    <a class="brand" href="${links.home[lang]}" aria-label="${esc(site.brand)}">
      ${logoMark()}
      <span class="brand-name">Real Life <b>Parents</b></span>
    </a>
    <nav class="main-nav" aria-label="${lang === 'ar' ? 'روابط الصفحة' : 'Page sections'}">
      <a href="${nb}#learn">${t.nav.learn}</a>
      <a href="${nb}#coach">${t.nav.coach}</a>
      <a href="${nb}#details">${t.nav.details}</a>
      <a href="${links.session[lang]}"${ctx.isSessionPage ? ' aria-current="page"' : ''}>${t.nav.session}</a>
      <a href="${nb}#faq">${t.nav.faq}</a>
    </nav>
    <div class="header-actions">
      <a class="lang-switch" href="${links.self[other]}" hreflang="${other}" lang="${other}">${icons.globe}<span>${t.switchTo}</span></a>
      ${ctx.headerCta || `<button class="btn btn-primary btn-sm" type="button" data-checkout>${t.bookShort}</button>`}
      <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="site-menu" data-menu-toggle>
        <span class="menu-icon" aria-hidden="true"><i></i><i></i><i></i></span>
        <span class="sr" data-menu-label data-open="${esc(t.nav.menu)}" data-close="${esc(t.nav.close)}">${t.nav.menu}</span>
      </button>
    </div>
  </div>
  <nav class="site-menu" id="site-menu" aria-label="${esc(t.nav.menu)}" hidden>
    <div class="wrap">
      <ul class="menu-list">
        ${[
          ['learn', t.nav.learn], ['includes', t.nav.includes], ['coach', t.nav.coach],
          ['watch', t.nav.watch], ['details', t.nav.details], ['faq', t.nav.faq],
        ].map(([id, label]) => `<li><a href="${nb}#${id}" data-menu-link>${esc(label)}</a></li>`).join('')}
        <li><a class="menu-session" href="${links.session[lang]}" data-menu-link${ctx.isSessionPage ? ' aria-current="page"' : ''}>${icons.calendar}<span>${esc(t.nav.session)}</span></a></li>
      </ul>
      <div class="menu-foot">
        <a class="lang-switch menu-lang" href="${links.self[other]}" hreflang="${other}" lang="${other}">${icons.globe}<span>${t.switchTo}</span></a>
        <a class="menu-ig" href="${site.social.instagram}" target="_blank" rel="noopener">${icons.ig}<span>Instagram</span></a>
      </div>
    </div>
  </nav>
</header>`;
}

export function logoMark(size = 34) {
  // two figures (parent + child) drawn as a single calm stroke
  return `<svg class="logo-mark" width="${size}" height="${size}" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
  <circle cx="20" cy="20" r="20" fill="var(--calm)"/>
  <circle cx="15" cy="13" r="4" fill="var(--sun)"/>
  <circle cx="27" cy="19" r="3" fill="var(--sun)"/>
  <path d="M8 31c2-7 5-11 7-11s4 5 6 5 3-3 6-3 4 4 5 9" fill="none" stroke="var(--on-calm)" stroke-width="2.6" stroke-linecap="round"/>
</svg>`;
}

export function footer(ctx) {
  const { t, lang, site, links } = ctx;
  const other = lang === 'ar' ? 'en' : 'ar';
  return `<footer class="site-footer">
  <div class="wrap footer-inner">
    <div class="footer-brand">
      <a class="brand" href="${links.home[lang]}">${logoMark(40)}<span class="brand-name">Real Life <b>Parents</b></span></a>
      <p>${t.footerTag}</p>
    </div>
    <div class="footer-links">
      <a href="${links.session[lang]}">${icons.calendar}<span>${t.nav.session}</span></a>
      <a href="${site.social.instagram}" target="_blank" rel="noopener">${icons.ig}<span>${t.followIg}</span></a>
      <a href="${links.self[other]}" hreflang="${other}" lang="${other}">${icons.globe}<span>${t.switchTo}</span></a>
    </div>
    <p class="copyright">© ${new Date().getFullYear()} ${esc(site.brand)}. ${t.rights}.</p>
  </div>
</footer>`;
}

/* ---------- sections ---------- */
function priceBlock(ctx, { compact = false } = {}) {
  const { t, lang, course, buildTier } = ctx;
  const early = course.pricing.tiers.find((x) => x.id === 'early');
  const regular = course.pricing.tiers.find((x) => x.id === 'regular');
  const isEarly = buildTier.id === 'early';
  return `<div class="price${compact ? ' price-compact' : ''}" data-price data-product="${course.id}">
    <span class="price-now"><span data-price-amount>${fmt.num(buildTier.amount, lang)}</span> <small>${t.currency}</small></span>
    ${isEarly ? `<span class="price-was" data-price-was><span class="sr">${t.insteadOf}</span> <s>${fmt.num(regular.amount, lang)} ${t.currency}</s></span>` : ''}
    ${isEarly && early.until && !compact ? `<span class="price-timer" data-countdown="${early.until}" data-label="${esc(t.earlyEndsIn)}">${t.earlyEndsIn} ${fmt.dateShort(early.until, lang)}</span>` : ''}
  </div>`;
}

function hero(ctx) {
  const { t, lang, c, course } = ctx;
  const s = course.schedule.sessions;
  const dates = fmt.dayList(s.map((x) => x.start), lang);
  return `<section class="hero" aria-labelledby="hero-title">
  <div class="wrap hero-grid">
    <div class="hero-copy">
      <p class="hero-kicker">${esc(c.kicker)}</p>
      <h1 id="hero-title" class="hero-title">${esc(c.name)}</h1>
      <p class="hero-tagline">${esc(c.tagline)}</p>
      <ul class="hero-facts" aria-label="${t.detailsTitle}">
        <li>${icons.calendar}<span>${dates}</span></li>
        <li>${icons.clock}<span>${fmt.timeRange(s[0].start, s[0].end, lang)} ${t.cairoTime}</span></li>
        <li>${icons.screen}<span>${t.liveOn} ${esc(course.schedule.platform)}</span></li>
      </ul>
      <div class="hero-buy">
        ${priceBlock(ctx)}
        <div class="hero-ctas">
          <button class="btn btn-primary btn-lg" type="button" data-checkout>${t.book}</button>
          <a class="btn btn-ghost btn-lg" href="#details">${t.seeDetails}</a>
        </div>
        ${course.seats?.limited ? `<p class="seats">${icons.hourglass}<span>${t.limitedSeats}</span></p>` : ''}
      </div>
    </div>
    <div class="hero-visual">${heroArt({ words: c.hero_words, dir: t.dir })}</div>
  </div>
</section>`;
}

function pain(ctx) {
  const { c } = ctx;
  const p = c.pain;
  return `<section class="section pain" aria-labelledby="pain-title">
  <div class="wrap pain-grid">
    <div class="pain-copy">
      <h2 id="pain-title" class="h2">${esc(p.title)}</h2>
      <ul class="battles">${p.battles.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>
      ${p.paragraphs.map((x) => `<p>${esc(x)}</p>`).join('')}
    </div>
    <aside class="insight">
      <h3>${esc(p.insight_title)}</h3>
      <p>${esc(p.insight)}</p>
      <p class="insight-promise">${esc(p.promise)}</p>
    </aside>
  </div>
</section>`;
}

function audience(ctx) {
  const { c } = ctx;
  return `<section class="section audience" aria-labelledby="aud-title">
  <div class="wrap">
    <h2 id="aud-title" class="h2">${esc(c.audience.title)}</h2>
    <ul class="checklist">${c.audience.items.map((x) => `<li>${icons.tick}<span>${esc(x)}</span></li>`).join('')}</ul>
  </div>
</section>`;
}

function curriculum(ctx) {
  const { c, lang } = ctx;
  return `<section class="section learn" id="learn" aria-labelledby="learn-title">
  <div class="wrap">
    <div class="section-head">
      <h2 id="learn-title" class="h2">${esc(c.curriculum.title)}</h2>
      <p>${esc(c.curriculum.intro)}</p>
    </div>
    <ol class="modules">
      ${c.curriculum.items.map((m, i) => `<li class="module">
        <span class="module-n" aria-hidden="true">${fmt.num(i + 1, lang)}</span>
        <div><h3>${esc(m.title)}</h3><p>${esc(m.body)}</p></div>
      </li>`).join('')}
    </ol>
  </div>
</section>`;
}

function includes(ctx) {
  const { c, t } = ctx;
  return `<section class="section includes" id="includes" aria-labelledby="inc-title">
  <div class="wrap">
    <h2 id="inc-title" class="h2">${esc(c.includes.title)}</h2>
    <ul class="perks">
      ${c.includes.items.map((x) => `<li class="perk perk-${x.icon}">
        <span class="perk-ico">${icons[x.icon] || ''}</span>
        <h3>${esc(x.title)}</h3>
        <p>${esc(x.body)}</p>
      </li>`).join('')}
    </ul>
    <p class="seats-note">${icons.hourglass}<span><b>${t.limitedSeats}.</b> ${esc(c.includes.seats_note)}</span></p>
  </div>
</section>`;
}

function coach(ctx) {
  const { ins, instructor, lang, rel } = ctx;
  const photo = instructor.photo
    ? `<img class="coach-photo" src="${rel}${instructor.photo.replace(/^\//, '')}" srcset="${rel}${instructor.photo.replace(/^\//, '').replace('.webp', '-320.webp')} 320w, ${rel}${instructor.photo.replace(/^\//, '')} 560w" sizes="240px" alt="${esc(ins.photoAlt || ins.name)}" width="560" height="560" loading="lazy" decoding="async">`
    : `<div class="coach-photo coach-monogram" role="img" aria-label="${esc(ins.name)}"><span>${esc(ins.monogram)}</span></div>`;
  return `<section class="section coach" id="coach" aria-labelledby="coach-title">
  <div class="wrap coach-grid">
    <div class="coach-side">
      ${photo}
      <ul class="coach-creds">${instructor.credentials.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
    </div>
    <div class="coach-copy">
      <h2 id="coach-title" class="h2">${esc(ins.name)}</h2>
      <ul class="coach-roles">${ins.role.split(' · ').map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
      <blockquote class="coach-quote"><p>${esc(ins.quote)}</p></blockquote>
      ${ins.bio.map((p) => `<p>${esc(p)}</p>`).join('')}
      <dl class="stats">
        ${instructor.stats.map((s) => `<div><dt>${esc(s.label[lang])}</dt><dd>${fmt.num(s.value, lang)}${s.suffix}</dd></div>`).join('')}
      </dl>
      <div class="coach-cta">
        <a class="btn btn-sun btn-lg" href="${ctx.links.session[lang]}">${icons.calendar}<span>${ctx.t.session.ctaFromCoach}</span></a>
      </div>
    </div>
  </div>
</section>`;
}

/* ---------- video + photo album ---------- */
function media(ctx) {
  const { t, lang, rel, instructor } = ctx;
  const m = instructor.media || {};
  const M = t.media;
  const img = (p) => rel + p.replace(/^\//, '');
  const v = m.video || {};
  let video = '';
  if (v.mp4) {
    video = `<video class="reel-video" controls playsinline preload="none" ${v.poster ? `poster="${img(v.poster)}"` : ''} width="720" height="1280">
      <source src="${img(v.mp4)}" type="video/mp4"></video>`;
  } else if (v.instagram) {
    video = `<iframe class="reel-frame" src="https://www.instagram.com/reel/${esc(v.instagram)}/embed/" title="${esc(M.videoTitle)}"
      loading="lazy" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen scrolling="no"></iframe>`;
  }
  const album = (m.album || []).map((a, i) => `<li class="album-item album-${a.shape || 'land'}">
      <button type="button" class="album-btn" data-album-index="${i}" aria-label="${esc(M.open)}: ${esc(a.caption[lang])}">
        <img src="${img(a.thumb)}" alt="${esc(a.alt[lang])}" width="${a.tw}" height="${a.th}" loading="lazy" decoding="async">
      </button>
      <span class="album-cap">${esc(a.caption[lang])}</span>
    </li>`).join('');
  if (!video && !album) return '';
  const albumData = JSON.stringify((m.album || []).map((a) => ({ src: img(a.src), w: a.w, h: a.h, alt: a.alt[lang], caption: a.caption[lang] }))).replace(/</g, '\\u003c');
  return `<section class="section media" id="watch" aria-labelledby="media-title">
  <div class="wrap">
    <div class="section-head">
      <h2 id="media-title" class="h2">${esc(M.title)}</h2>
      <p>${esc(M.intro)}</p>
    </div>
    <div class="media-grid">
      ${video ? `<figure class="reel">
        <div class="reel-phone">${video}</div>
        <figcaption>${esc(M.videoCaption)}</figcaption>
      </figure>` : ''}
      ${album ? `<div class="album">
        <h3 class="album-title">${esc(M.albumTitle)}</h3>
        <ul class="album-grid">${album}</ul>
      </div>` : ''}
    </div>
  </div>
  <dialog class="lightbox" id="lightbox" aria-label="${esc(M.albumTitle)}">
    <figure class="lb-fig">
      <img class="lb-img" alt="" decoding="async">
      <figcaption class="lb-cap"></figcaption>
    </figure>
    <button class="lb-btn lb-close" type="button" data-lb="close" aria-label="${esc(M.close)}">${icons.close}</button>
    <button class="lb-btn lb-prev" type="button" data-lb="prev" aria-label="${esc(M.prev)}">‹</button>
    <button class="lb-btn lb-next" type="button" data-lb="next" aria-label="${esc(M.next)}">›</button>
    <script type="application/json" id="album-data">${albumData}</script>
  </dialog>
</section>`;
}

function details(ctx) {
  const { t, lang, course } = ctx;
  const sessions = course.schedule.sessions;
  const tiers = course.pricing.tiers;
  return `<section class="section details" id="details" aria-labelledby="det-title">
  <div class="wrap">
    <h2 id="det-title" class="h2">${t.detailsTitle}</h2>
    <div class="ticket">
      <div class="ticket-main">
        <dl class="facts">
          <div><dt>${icons.calendar}${t.sessionsLabel}</dt><dd>${sessions.map((s, i) => `<span class="session"><b>${t.sessionN} ${fmt.num(i + 1, lang)}</b> <time datetime="${s.start}">${fmt.dateLong(s.start, lang)}</time></span>`).join('')}</dd></div>
          <div><dt>${icons.clock}${t.timeLabel}</dt><dd>${fmt.timeRange(sessions[0].start, sessions[0].end, lang)} ${t.cairoTime}</dd></div>
          <div><dt>${icons.screen}${t.platformLabel}</dt><dd>${t.liveOn} ${esc(course.schedule.platform)}</dd></div>
          <div><dt>${icons.hourglass}${t.durationLabel}</dt><dd>${t.durationValue}</dd></div>
          <div><dt>${icons.child}${t.ageLabel}</dt><dd>${t.ageValue}</dd></div>
        </dl>
      </div>
      <div class="ticket-stub">
        <h3>${t.priceTitle}</h3>
        <ol class="tiers">
          ${tiers.map((tier) => `<li class="tier" data-tier="${tier.id}">
            <span class="tier-label">${esc(tier.label[lang])}</span>
            <span class="tier-amount">${fmt.num(tier.amount, lang)} <small>${t.currency}</small></span>
            <span class="tier-when">${tier.until ? `${t.until} ${fmt.dateShort(tier.until, lang)}` : t.after}</span>
          </li>`).join('')}
        </ol>
        <p class="tier-note">${t.priceNote}</p>
        <button class="btn btn-primary btn-lg btn-block" type="button" data-checkout>${t.book}</button>
      </div>
    </div>
  </div>
</section>`;
}

function how(ctx) {
  const { t, lang } = ctx;
  return `<section class="section how" aria-labelledby="how-title">
  <div class="wrap">
    <h2 id="how-title" class="h2">${t.howTitle}</h2>
    <ol class="steps">
      ${t.howSteps.map((s, i) => `<li><span class="step-n" aria-hidden="true">${fmt.num(i + 1, lang)}</span><h3>${esc(s.t)}</h3><p>${esc(s.b)}</p></li>`).join('')}
    </ol>
  </div>
</section>`;
}

function faq(ctx) {
  const { t, c } = ctx;
  return `<section class="section faq" id="faq" aria-labelledby="faq-title">
  <div class="wrap faq-wrap">
    <h2 id="faq-title" class="h2">${t.faqTitle}</h2>
    <div class="faq-list">
      ${c.faq.map((f, i) => `<details${i === 0 ? ' open' : ''}><summary><span>${esc(f.q)}</span></summary><p>${esc(f.a)}</p></details>`).join('')}
    </div>
  </div>
</section>`;
}

function moreCourses(ctx) {
  const { otherCourses, t, lang } = ctx;
  if (!otherCourses?.length) return '';
  return `<section class="section more" aria-labelledby="more-title">
  <div class="wrap">
    <h2 id="more-title" class="h2">${t.moreCourses}</h2>
    <ul class="course-grid">
      ${otherCourses.map((oc) => `<li><a class="course-card" href="${oc.href}">
        <h3>${esc(oc.content[lang].name)}</h3>
        <p>${esc(oc.content[lang].kicker)}</p>
        ${oc.status === 'soon' ? `<span class="badge">${t.comingSoon}</span>` : ''}
      </a></li>`).join('')}
    </ul>
  </div>
</section>`;
}

function finalCta(ctx) {
  const { t, c } = ctx;
  return `<section class="final" aria-labelledby="final-title">
  <div class="wrap final-inner">
    <h2 id="final-title">${esc(c.final_cta.title)}</h2>
    <p>${esc(c.final_cta.body)}</p>
    <div class="final-buy">
      ${priceBlock(ctx, { compact: true })}
      <button class="btn btn-sun btn-lg" type="button" data-checkout>${t.book}</button>
    </div>
    <svg class="final-line" viewBox="0 0 600 40" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="M0 22 C 100 34, 200 34, 300 24 S 500 12, 600 22" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>
  </div>
</section>`;
}

function stickyBar(ctx) {
  const { t } = ctx;
  return `<div class="sticky-buy" data-sticky hidden>
  ${priceBlock(ctx, { compact: true })}
  <button class="btn btn-primary" type="button" data-checkout>${t.book}</button>
</div>`;
}

/* ---------- checkout dialog (UI shell; logic in assets/js/checkout.js) ---------- */
export function checkoutDialog(ctx) {
  const { t, c, lang } = ctx;
  const k = t.checkout;
  return `<dialog class="checkout" id="checkout" aria-labelledby="co-title">
  <div class="co-inner">
    <div class="co-head">
      <div>
        <h2 id="co-title">${k.title}</h2>
        <p class="co-product" data-co-product>${esc(ctx.checkoutTitle || c.name)}</p>
      </div>
      <button class="icon-btn" type="button" data-close aria-label="${k.close}">${icons.close}</button>
    </div>
    <ol class="co-steps" aria-label="${k.title}">
      <li data-step-ind="1" aria-current="step">${k.stepDetails}</li>
      <li data-step-ind="2">${k.stepPay}</li>
      <li data-step-ind="3">${k.stepConfirm}</li>
    </ol>

    <form class="co-step" data-step="1" id="co-form" novalidate>
      <p class="co-notice" data-co-notice="form" role="alert" hidden></p>
      <div class="field">
        <label for="co-name">${k.name}</label>
        <input id="co-name" name="name" type="text" autocomplete="name" maxlength="60" placeholder="${esc(k.namePh)}" required aria-describedby="co-name-err">
        <p class="err" id="co-name-err" aria-live="polite" hidden></p>
      </div>
      <div class="field">
        <label for="co-phone">${k.phone}</label>
        <div class="phone-group" dir="ltr">
          <label class="sr" for="co-country">${k.country}</label>
          <select id="co-country" name="country" autocomplete="country">
            ${COUNTRIES.map((c) => `<option value="${c.iso}"${c.iso === DEFAULT_COUNTRY ? ' selected' : ''}>${c.flag} ${esc(c[lang])}${c.dial ? ` +${c.dial}` : ''}</option>`).join('')}
          </select>
          <input id="co-phone" name="phone" type="tel" inputmode="numeric" pattern="[0-9]*" autocomplete="tel-national" placeholder="${countryByIso(DEFAULT_COUNTRY).ex.replace(/\D/g, '')}" required aria-describedby="co-phone-hint co-phone-err">
        </div>
        <p class="hint" id="co-phone-hint">${k.phoneHint}</p>
        <p class="err" id="co-phone-err" aria-live="polite" hidden></p>
      </div>
      <fieldset class="field">
        <legend>${k.childAge}</legend>
        <div class="chips">
          ${k.childAgeOpts.map((o, i) => `<label class="chip"><input type="radio" name="age" value="${esc(o)}" id="co-age-${i}"><span>${esc(o)}</span></label>`).join('')}
        </div>
        <p class="err" id="co-age-err" hidden>${k.errAge}</p>
      </fieldset>
      <div class="field">
        <label for="co-problem">${k.problem}</label>
        <textarea id="co-problem" name="problem" rows="4" maxlength="1000" placeholder="${esc(k.problemPh)}" required aria-describedby="co-problem-hint co-problem-err"></textarea>
        <p class="hint" id="co-problem-hint"><span>${k.problemHint}</span> <span class="count" data-count dir="ltr">0 / 1000</span></p>
        <p class="err" id="co-problem-err" aria-live="polite" hidden></p>
      </div>
      <div class="field">
        <label for="co-email">${k.email}</label>
        <input id="co-email" name="email" type="email" inputmode="email" autocomplete="email" maxlength="254" dir="ltr" placeholder="name@gmail.com" aria-describedby="co-email-err">
        <p class="err" id="co-email-err" aria-live="polite" hidden></p>
      </div>
      <div class="co-summary">
        <span>${k.amount}</span>
        <b data-co-amount></b>
      </div>
      <button class="btn btn-primary btn-lg btn-block" type="submit">${k.next}</button>
    </form>

    <div class="co-step" data-step="2" hidden>
      <div class="co-summary">
        <span>${k.orderRef}: <b data-co-ref dir="ltr"></b></span>
        <b data-co-amount></b>
      </div>
      <p class="co-notice" data-co-notice="pay" role="status" hidden></p>
      <p class="co-label">${k.payWith}</p>
      <div class="co-methods" data-co-methods role="radiogroup" aria-label="${k.payWith}"></div>
      <div class="co-method-panel" data-co-panel></div>
      <div class="co-actions">
        <button class="btn btn-ghost" type="button" data-back>${k.back}</button>
        <button class="btn btn-primary" type="button" data-paid>${k.paidBtn}</button>
      </div>
    </div>

    <div class="co-step" data-step="3" hidden>
      <h3 class="co-confirm-title">${k.confirmTitle}</h3>
      <p>${k.confirmBody}</p>
      <a class="btn btn-wa btn-lg btn-block" data-wa href="#" target="_blank" rel="noopener">${icons.wa}<span>${k.sendWa}</span></a>
      <p class="co-fallback">${k.waFallback} <bdi class="mono" data-wa-number dir="ltr"></bdi> <button class="link-btn" type="button" data-copy-wa>${k.copy}</button></p>
      <div class="co-actions">
        <button class="btn btn-ghost" type="button" data-back>${k.back}</button>
        <button class="btn btn-ghost" type="button" data-close>${k.close}</button>
      </div>
    </div>
  </div>
</dialog>`;
}
