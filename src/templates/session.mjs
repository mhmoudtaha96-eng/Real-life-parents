import { icons } from './icons.mjs';
import { esc, fmt } from './helpers.mjs';
import { layout, header, footer, checkoutDialog } from './page.mjs';

/**
 * 1-to-1 session booking page: calendar of available times → checkout (same InstaPay + WhatsApp flow).
 * Availability comes from src/content/sessions/one-to-one.json and is expanded in the browser
 * (assets/js/sessions.js), so past times disappear on their own.
 */
export function sessionPage(ctx) {
  const { t, lang, session, ins, instructor, rel, site } = ctx;
  const S = t.session;
  const sc = session.content[lang];
  const price = session.price;
  const discounted = Math.round(price.amount * (1 - price.workshopDiscountPercent / 100));

  const products = [
    { id: session.id, type: 'session', name: S.productName, pricing: { currency: price.currency, tiers: [{ id: 'regular', amount: price.amount, until: null }] }, discountPercent: price.workshopDiscountPercent },
  ];
  const { _note, content, ...availability } = session;

  const photo = instructor.photo
    ? `<img class="ses-photo" src="${rel}${instructor.photo.replace(/^\//, '').replace('.webp', '-320.webp')}" alt="${esc(ins.photoAlt || ins.name)}" width="320" height="320" decoding="async">`
    : '';

  const body = `
${header(ctx)}
<main id="main">
<section class="ses-hero">
  <div class="wrap ses-hero-grid">
    <div class="ses-hero-copy">
      <p class="hero-kicker">${esc(sc.kicker)}</p>
      <h1 class="ses-title">${esc(sc.title)}</h1>
      <p class="ses-intro">${esc(sc.intro)}</p>
      <ul class="checklist ses-points">${sc.points.map((x) => `<li>${icons.tick}<span>${esc(x)}</span></li>`).join('')}</ul>
    </div>
    <div class="ses-coach">
      ${photo}
      <div>
        <p class="ses-coach-name">${esc(ins.name)}</p>
        <p class="ses-coach-role">${esc(ins.jobTitle)}</p>
      </div>
    </div>
  </div>
</section>

<section class="section ses-book" aria-labelledby="cal-title">
  <div class="wrap ses-book-grid">
    <div class="cal-card" data-calendar>
      <div class="cal-head">
        <h2 id="cal-title" class="cal-step">${S.pickDay}</h2>
        <div class="cal-nav">
          <button type="button" class="icon-btn" data-cal="prev" aria-label="${esc(S.prevMonth)}">‹</button>
          <p class="cal-month" data-cal-month aria-live="polite"></p>
          <button type="button" class="icon-btn" data-cal="next" aria-label="${esc(S.nextMonth)}">›</button>
        </div>
      </div>
      <div class="cal-grid" role="grid" data-cal-grid aria-labelledby="cal-title">
        <noscript><p>${esc(S.noSlots)}</p></noscript>
      </div>
      <p class="cal-empty" data-cal-empty hidden>${esc(S.noneThisMonth)}</p>
      <div class="cal-times">
        <h2 class="cal-step">${S.pickTime}</h2>
        <p class="cal-day-label" data-cal-day-label></p>
        <div class="time-list" role="radiogroup" aria-label="${esc(S.pickTime)}" data-cal-times></div>
        <p class="cal-tz">${esc(S.allCairo)} <span data-cal-tz></span></p>
      </div>
    </div>

    <aside class="ses-summary" aria-labelledby="sum-title">
      <h2 id="sum-title" class="ses-sum-title">${S.yourBooking}</h2>
      <dl class="ses-facts">
        <div><dt>${icons.calendar}${S.selected}</dt><dd data-sum-slot>${esc(S.chooseFirst)}</dd></div>
        <div><dt>${icons.hourglass}${S.duration}</dt><dd>${S.durationValue.replace('{n}', fmt.num(session.durationMinutes, lang))}</dd></div>
        <div><dt>${icons.screen}${S.platform}</dt><dd>${t.liveOn} ${esc(session.platform)}</dd></div>
        <div><dt>${icons.card}${S.price}</dt><dd class="ses-price"><span data-sum-price>${fmt.num(price.amount, lang)}</span> <small>${t.currency}</small> <s data-sum-was hidden>${fmt.num(price.amount, lang)} ${t.currency}</s> <small class="ses-if" data-sum-if hidden>${esc(S.priceIfEligible)}</small></dd></div>
      </dl>
      <label class="ses-discount" for="ses-attended">
        <input type="checkbox" id="ses-attended" data-sum-discount>
        <span>${esc(S.attended.replace('{p}', fmt.num(price.workshopDiscountPercent, lang)))}<small>${esc(S.attendedNote)}</small></span>
      </label>
      <button class="btn btn-primary btn-lg btn-block" type="button" data-reserve disabled>${S.reserve}</button>
      ${session.sample ? `<p class="ses-sample">${esc(S.sampleNote)}</p>` : ''}
    </aside>
  </div>
</section>

<section class="section how" aria-labelledby="how-title">
  <div class="wrap">
    <h2 id="how-title" class="h2">${S.howTitle}</h2>
    <ol class="steps">
      ${S.howSteps.map((s, i) => `<li><span class="step-n" aria-hidden="true">${fmt.num(i + 1, lang)}</span><h3>${esc(s.t)}</h3><p>${esc(s.b)}</p></li>`).join('')}
    </ol>
  </div>
</section>
</main>
${footer(ctx)}
${checkoutDialog({ ...ctx, checkoutTitle: S.productName })}
<script type="application/json" id="availability-data">${JSON.stringify(availability).replace(/</g, '\\u003c')}</script>
`;

  return layout({
    ...ctx,
    seo: sc.seo,
    ogAlt: sc.title,
    products,
    jsonld: sessionJsonLd(ctx, sc, price),
  }, body);
}

function sessionJsonLd(ctx, sc, price) {
  const { site, url, ins, instructor } = ctx;
  const base = site.siteUrl;
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Service', '@id': `${url}#service`, name: sc.title, description: sc.seo.description, url,
        serviceType: 'Parenting coaching', areaServed: 'Worldwide', availableChannel: { '@type': 'ServiceChannel', serviceUrl: url, name: 'Zoom' },
        provider: { '@type': 'Person', '@id': `${base}/#${instructor.id}`, name: ins.name, jobTitle: ins.jobTitle, ...(instructor.photo ? { image: base + instructor.photo } : {}) },
        offers: { '@type': 'Offer', price: String(price.amount), priceCurrency: price.currency, url, availability: 'https://schema.org/InStock' },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: site.brand, item: `${base}/` },
          { '@type': 'ListItem', position: 2, name: sc.title, item: url },
        ],
      },
    ],
  }).replace(/</g, '\\u003c');
}
