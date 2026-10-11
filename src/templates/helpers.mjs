const TZ = 'Africa/Cairo';

export const esc = (s = '') =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const loc = (lang) => (lang === 'ar' ? 'ar-EG' : 'en-GB');
const part = (iso, lang, opts) => new Intl.DateTimeFormat(loc(lang), { timeZone: TZ, ...opts }).format(new Date(iso));

export const fmt = {
  num: (n, lang) => new Intl.NumberFormat(loc(lang), { useGrouping: false }).format(n),
  dateShort: (iso, lang) => part(iso, lang, { day: 'numeric', month: 'long' }),
  dateLong: (iso, lang) => part(iso, lang, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
  dayList(isos, lang) {
    const days = isos.map((d) => `${part(d, lang, { weekday: lang === 'ar' ? 'long' : 'short' })} ${part(d, lang, { day: 'numeric' })}`);
    const month = part(isos[isos.length - 1], lang, { month: 'long' });
    return lang === 'ar' ? `${days.join(' و')} ${month}` : `${days.join(' & ')} ${month}`;
  },
  timeRange(a, b, lang) {
    const o = { hour: 'numeric', minute: '2-digit', hour12: true };
    if (lang === 'ar') {
      const s = part(a, lang, o).replace(/\s?م$/, '').replace(/\s?ص$/, '');
      return `من ${s} لـ ${part(b, lang, o).replace(/\s?م$/, ' مساءً')}`;
    }
    return `${part(a, lang, o)} – ${part(b, lang, o)}`.replace(/ ?pm/gi, ' pm').replace(/ ?am/gi, ' am');
  },
};

/** Price tier active at a given moment */
export function activeTier(pricing, now = new Date()) {
  return pricing.tiers.find((t) => !t.until || new Date(t.until) > now) || pricing.tiers[pricing.tiers.length - 1];
}

/** schema.org JSON-LD graph: Organization, WebSite, WebPage, Person, Course(+CourseInstance), EducationEvent(s), FAQPage, Breadcrumb */
export function structuredData(ctx) {
  const { site, lang, course, c, ins, instructor, url } = ctx;
  const base = site.siteUrl;
  const orgId = `${base}/#org`;
  const personId = `${base}/#${instructor.id}`;
  const courseId = `${url}#course`;
  const sessions = course.schedule.sessions;
  const tiers = course.pricing.tiers;

  const offers = tiers.map((t, i) => {
    const prevUntil = i > 0 ? tiers[i - 1].until : null;
    return {
      '@type': 'Offer',
      name: t.label[lang],
      price: String(t.amount),
      priceCurrency: course.pricing.currency,
      availability: 'https://schema.org/InStock',
      url,
      category: 'Paid',
      ...(prevUntil ? { validFrom: prevUntil } : {}),
      ...(t.until ? { validThrough: t.until } : { validThrough: sessions[0].start }),
    };
  });

  const virtual = { '@type': 'VirtualLocation', url };
  const graph = [
    {
      '@type': 'Organization', '@id': orgId, name: site.brand, url: `${base}/`,
      logo: `${base}/assets/img/logo-512.png`, sameAs: Object.values(site.social),
      founder: { '@id': personId },
    },
    {
      '@type': 'WebSite', '@id': `${base}/#website`, url: `${base}/`, name: site.brand,
      inLanguage: ['ar', 'en'], publisher: { '@id': orgId },
    },
    {
      '@type': 'WebPage', '@id': `${url}#webpage`, url, name: course.seo[lang].title,
      description: course.seo[lang].description, inLanguage: lang, isPartOf: { '@id': `${base}/#website` },
      primaryImageOfPage: `${base}/assets/img/og-${lang}.png`, about: { '@id': courseId },
    },
    {
      '@type': 'Person', '@id': personId, name: ins.name, jobTitle: ins.jobTitle,
      description: ins.bio[0], worksFor: { '@id': orgId }, sameAs: instructor.sameAs,
      ...(instructor.photo ? { image: base + instructor.photo } : {}),
      hasCredential: instructor.credentials.map((x) => ({ '@type': 'EducationalOccupationalCredential', recognizedBy: { '@type': 'Organization', name: x } })),
    },
    {
      '@type': 'Course', '@id': courseId, name: c.name, description: course.seo[lang].description,
      inLanguage: 'ar', provider: { '@id': orgId }, url,
      audience: { '@type': 'Audience', audienceType: lang === 'ar' ? 'أمهات الأطفال من سنة لـ٤ سنين' : 'Mothers of children aged 1–4' },
      teaches: c.curriculum.items.map((m) => m.title),
      offers,
      hasCourseInstance: {
        '@type': 'CourseInstance', courseMode: 'Online', location: virtual,
        startDate: sessions[0].start, endDate: sessions[sessions.length - 1].end,
        courseSchedule: { '@type': 'Schedule', repeatCount: sessions.length, duration: 'PT90M', startDate: sessions[0].start.slice(0, 10), endDate: sessions[sessions.length - 1].start.slice(0, 10), scheduleTimezone: site.timezone },
        instructor: { '@id': personId },
        courseWorkload: 'PT3H',
      },
    },
    {
      '@type': 'EducationEvent', '@id': `${url}#event`, name: c.name, description: course.seo[lang].description,
      startDate: sessions[0].start, endDate: sessions[sessions.length - 1].end,
      eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode',
      eventStatus: 'https://schema.org/EventScheduled',
      location: virtual, image: [`${base}/assets/img/og-${lang}.png`],
      organizer: { '@id': orgId }, performer: { '@id': personId },
      inLanguage: 'ar', isAccessibleForFree: false, offers,
      subEvent: sessions.map((s, i) => ({ '@type': 'EducationEvent', name: `${c.name} — ${i + 1}`, startDate: s.start, endDate: s.end, eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode', location: virtual })),
    },
    {
      '@type': 'FAQPage', '@id': `${url}#faq`,
      mainEntity: c.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
    },
    {
      '@type': 'BreadcrumbList', '@id': `${url}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: site.brand, item: `${base}/` },
        { '@type': 'ListItem', position: 2, name: c.name, item: url },
      ],
    },
  ];
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c');
}
