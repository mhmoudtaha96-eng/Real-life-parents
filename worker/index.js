/**
 * Real Life Parents — booking API (Cloudflare Worker + D1 database).
 *
 * Pages: the home page, course pages and the 1-to-1 page are rendered here from the database,
 * so courses edited in /admin/ go live immediately. Images/CSS/JS are served from ./dist.
 * If the database isn't connected, the static pages in ./dist are served instead.
 *
 * Public:
 *   POST /api/orders                 save a workshop or 1-to-1 booking; checks the workshop discount
 *   POST /api/orders/:ref/payment    remember which payment method she used ("I've sent the payment")
 *   GET  /api/slots                  1-to-1 times that are already taken
 * Admin (header  Authorization: Bearer <ADMIN_PASSWORD>):
 *   GET   /api/admin/orders          list / search bookings
 *   PATCH /api/admin/orders/:ref     change status (pending / paid / cancelled) or add a note
 *   GET   /api/admin/orders.csv      export
 *   GET   /api/admin/courses         all courses (incl. hidden)
 *   POST  /api/admin/courses         add a course
 *   PUT   /api/admin/courses/:id     save a course
 *   PATCH /api/admin/courses/:id     show/hide on the site, set as home page, order
 *   DELETE /api/admin/courses/:id    delete a course
 *   PUT   /api/admin/settings/session   1-to-1 price, discount, weekly times, page text
 *   POST  /api/admin/preview         render a course from the editor without saving
 *   POST  /api/admin/publish         "Apply to website": the edited courses + 1-to-1 settings go live
 *   POST  /api/admin/discard         throw away changes that were not applied
 * Course and 1-to-1 edits are saved as a draft; visitors keep seeing the last applied version.
 */
import generated from './content.generated.json' with { type: 'json' };
import { createRenderer } from '../src/render/site.mjs';
import { validateName, validatePhone, validateEmail, validateProblem } from '../src/assets/js/ui/validate.js';
import { buildSlots } from '../src/assets/js/sessions.js';
import { activeTier } from '../src/assets/js/commerce/pricing.js';

const { site, i18n, instructors, qrPath, assetVersion, seed } = generated;
const renderer = createRenderer({ site, i18n, instructors, qrPath, assetVersion });
const STATUSES = ['pending', 'paid', 'cancelled'];
const HOLD_HOURS = 24; // an unpaid 1-to-1 booking keeps its time for this long

/* ---------------- database ---------------- */
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS orders (
    ref TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    updated_at TEXT,
    type TEXT NOT NULL,
    product_id TEXT NOT NULL,
    product_name TEXT,
    slot TEXT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    country TEXT,
    child_age TEXT,
    email TEXT,
    problem TEXT,
    lang TEXT,
    amount INTEGER NOT NULL,
    full_price INTEGER,
    currency TEXT,
    discount_requested INTEGER NOT NULL DEFAULT 0,
    discount_applied INTEGER NOT NULL DEFAULT 0,
    discount_note TEXT,
    payment_method TEXT,
    payment_claimed_at TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    admin_note TEXT
  )`,
  'CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders(phone)',
  'CREATE INDEX IF NOT EXISTS idx_orders_type_created ON orders(type, created_at)',
  // one active booking per 1-to-1 time (prevents double booking)
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_slot_active ON orders(slot) WHERE type = 'session' AND status IN ('pending','paid')",
  `CREATE TABLE IF NOT EXISTS courses (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    data TEXT NOT NULL,
    visible INTEGER NOT NULL DEFAULT 1,
    featured INTEGER NOT NULL DEFAULT 0,
    sort INTEGER NOT NULL DEFAULT 0,
    created_at TEXT,
    updated_at TEXT
  )`,
  'CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT)',
];
let schemaReady = null;
function ensureSchema(db) {
  schemaReady ||= db.batch(SCHEMA.map((s) => db.prepare(s))).catch((e) => { schemaReady = null; throw e; });
  return schemaReady;
}
const nowIso = () => new Date().toISOString();

/* ---------------- site content (courses + 1-to-1 settings) ---------------- */
let contentCache = null; // { at, content } — per Worker instance, refreshed every few seconds
const CONTENT_TTL_MS = 5000;

/** First run: copy the courses and 1-to-1 settings from the code into the database */
async function seedContent(db) {
  const n = await db.prepare('SELECT COUNT(*) AS n FROM courses').first();
  if (!n || n.n === 0) {
    for (const c of seed.courses) {
      const { visible, featured, sort, ...data } = c;
      await db.prepare('INSERT OR IGNORE INTO courses (id, slug, data, visible, featured, sort, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(c.id, c.slug, JSON.stringify(data), visible === false ? 0 : 1, featured ? 1 : 0, sort ?? 0, nowIso(), nowIso()).run();
    }
  }
  const sset = await db.prepare("SELECT key FROM settings WHERE key = 'session'").first();
  if (!sset && seed.session) {
    await db.prepare("INSERT OR IGNORE INTO settings (key, data, updated_at) VALUES ('session', ?, ?)").bind(JSON.stringify(seed.session), nowIso()).run();
  }
}

/** Draft = what the admin is editing (courses + settings tables). Not shown on the site until "Apply". */
async function loadDraft(env) {
  await ensureSchema(env.DB);
  await seedContent(env.DB);
  const { results } = await env.DB.prepare('SELECT * FROM courses ORDER BY sort ASC, created_at ASC').all();
  const courses = results.map((r) => ({ ...JSON.parse(r.data), id: r.id, slug: r.slug, visible: !!r.visible, featured: !!r.featured, sort: r.sort }));
  const sRow = await env.DB.prepare("SELECT data FROM settings WHERE key = 'session'").first();
  return { courses, session: sRow ? JSON.parse(sRow.data) : seed.session };
}

/** Live = the snapshot saved by the last "Apply to website". This is what visitors see and can book. */
async function loadPublished(env) {
  await ensureSchema(env.DB);
  const row = await env.DB.prepare("SELECT data, updated_at FROM settings WHERE key = 'published'").first();
  if (row) return { ...JSON.parse(row.data), publishedAt: row.updated_at };
  // first run: what is in the database now goes live
  const draft = await loadDraft(env);
  const at = nowIso();
  await env.DB.prepare("INSERT OR IGNORE INTO settings (key, data, updated_at) VALUES ('published', ?, ?)").bind(JSON.stringify(draft), at).run();
  return { ...draft, publishedAt: at };
}
async function loadContent(env, { fresh = false } = {}) {
  if (!fresh && contentCache && Date.now() - contentCache.at < CONTENT_TTL_MS) return contentCache.content;
  const content = await loadPublished(env);
  contentCache = { at: Date.now(), content };
  return content;
}
const invalidateContent = () => { contentCache = null; };

/** Same content? (ignores key order inside objects) */
const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
const sameContent = (a, b) => JSON.stringify(canon({ courses: a.courses, session: a.session })) === JSON.stringify(canon({ courses: b.courses, session: b.session }));

async function publishDraft(env) {
  const draft = await loadDraft(env);
  await env.DB.prepare("INSERT INTO settings (key, data, updated_at) VALUES ('published', ?, ?) ON CONFLICT(key) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at")
    .bind(JSON.stringify(draft), nowIso()).run();
  invalidateContent();
  return json({ ok: true });
}

/** Throw away unapplied changes: put the live version back into the editing tables */
async function discardDraft(env) {
  const live = await loadPublished(env);
  const stmts = [env.DB.prepare('DELETE FROM courses')];
  for (const c of live.courses) {
    const { visible, featured, sort, ...data } = c;
    stmts.push(env.DB.prepare('INSERT INTO courses (id, slug, data, visible, featured, sort, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(c.id, c.slug, JSON.stringify(data), visible ? 1 : 0, featured ? 1 : 0, sort ?? 0, nowIso(), nowIso()));
  }
  if (live.session) stmts.push(env.DB.prepare("INSERT INTO settings (key, data, updated_at) VALUES ('session', ?, ?) ON CONFLICT(key) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at").bind(JSON.stringify(live.session), nowIso()));
  await env.DB.batch(stmts);
  return json({ ok: true });
}

/** Free 1-to-1 times held by bookings that were never paid */
async function releaseExpiredHolds(db) {
  const cutoff = new Date(Date.now() - HOLD_HOURS * 36e5).toISOString();
  await db.prepare("UPDATE orders SET status = 'cancelled', admin_note = COALESCE(admin_note || ' | ', '') || 'Auto-cancelled: unpaid after 24h', updated_at = ? WHERE type = 'session' AND status = 'pending' AND created_at < ?")
    .bind(nowIso(), cutoff).run();
}

/* ---------------- helpers ---------------- */
const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });

function makeRef() {
  const d = new Date();
  const ym = `${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(5))).map((b) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('');
  return `RLP-${ym}-${rand}`;
}

function findProduct(content, productId) {
  const course = content.courses.find((c) => c.id === productId && c.visible);
  if (course) return { type: 'workshop', course };
  if (content.session && content.session.id === productId) return { type: 'session', session: content.session };
  return null;
}

function cairoInstant(slot) {
  const [date, time] = slot.split('T');
  const probe = new Date(`${date}T12:00:00Z`);
  const part = new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Cairo', timeZoneName: 'longOffset' }).formatToParts(probe).find((p) => p.type === 'timeZoneName').value;
  const m = part.match(/GMT([+-]\d{2}):?(\d{2})?/);
  return new Date(`${date}T${time}:00${m ? `${m[1]}:${m[2] || '00'}` : '+02:00'}`);
}

/** Workshop discount: paid workshop booking, session within N days after the workshop, first session only */
async function checkDiscount(db, content, session, phone, slot) {
  const rules = session.price.discountRules || {};
  const course = content.courses.find((c) => c.slug === rules.workshopCourse) || content.courses.find((c) => c.featured) || content.courses[0];
  if (!course) return { applied: false, reason: 'not_found' };
  const sessions = course.schedule.sessions;
  const workshopEnd = new Date(sessions[sessions.length - 1].end);
  const validUntil = new Date(workshopEnd.getTime() + (rules.validDaysAfterWorkshop ?? 30) * 864e5);
  const at = cairoInstant(slot);
  if (at < workshopEnd) return { applied: false, reason: 'before_workshop', validFrom: workshopEnd.toISOString(), validUntil: validUntil.toISOString() };
  if (at > validUntil) return { applied: false, reason: 'expired', validUntil: validUntil.toISOString() };
  const attended = await db.prepare("SELECT ref FROM orders WHERE type = 'workshop' AND product_id = ? AND phone = ? AND status = 'paid' LIMIT 1")
    .bind(course.id, phone).first();
  if (!attended) return { applied: false, reason: 'not_found' };
  if (rules.firstSessionOnly !== false) {
    const used = await db.prepare("SELECT ref FROM orders WHERE type = 'session' AND phone = ? AND discount_applied = 1 AND status IN ('pending','paid') LIMIT 1")
      .bind(phone).first();
    if (used) return { applied: false, reason: 'already_used' };
  }
  return { applied: true, reason: 'ok', workshopRef: attended.ref };
}

/* ---------------- public: create booking ---------------- */
async function createOrder(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
  const content = await loadContent(env);
  const product = findProduct(content, String(body.productId || ''));
  if (!product) return json({ error: 'unknown_product' }, 400);
  const c = body.customer || {};

  // same rules as the form in the browser
  const fields = {};
  const name = validateName(c.name || ''); if (!name.ok) fields.name = name.code;
  const phone = validatePhone(String(c.phone || ''), String(c.country || 'EG')); if (!phone.ok) fields.phone = phone.code;
  const email = validateEmail(c.email || ''); if (!email.ok) fields.email = email.code;
  const problem = validateProblem(c.problem || ''); if (!problem.ok) fields.problem = problem.code;
  const childAge = String(c.childAge || '').slice(0, 40); if (!childAge) fields.childAge = 'empty';
  if (Object.keys(fields).length) return json({ error: 'invalid', fields }, 400);

  const db = env.DB;
  await ensureSchema(db);

  // simple abuse guard: max 6 bookings per phone per hour
  const recent = await db.prepare('SELECT COUNT(*) AS n FROM orders WHERE phone = ? AND created_at > ?')
    .bind(phone.e164, new Date(Date.now() - 36e5).toISOString()).first();
  if (recent && recent.n >= 6) return json({ error: 'too_many' }, 429);

  const lang = body.lang === 'en' ? 'en' : 'ar';
  let type, productId, productName, amount, fullPrice, slot = null, discount = { requested: false, applied: false, reason: null };

  if (product.type === 'workshop') {
    const { course } = product;
    type = 'workshop'; productId = course.id; productName = course.content[lang]?.name || course.content.ar.name;
    amount = fullPrice = activeTier(course).amount;
  } else {
    const { session } = product;
    type = 'session'; productId = session.id; productName = i18n[lang].session.productName;
    slot = String(body.slot || '');
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(slot)) return json({ error: 'invalid', fields: { slot: 'empty' } }, 400);
    // the time must exist in the published availability
    const [date, time] = slot.split('T');
    const open = (buildSlots(session)[date] || []).some((s) => s.time === time && s.status === 'open');
    if (!open) return json({ error: 'slot_unavailable' }, 409);
    await releaseExpiredHolds(db);
    amount = fullPrice = session.price.amount;
    if (body.requestDiscount) {
      discount = { requested: true, ...(await checkDiscount(db, content, session, phone.e164, slot)) };
      if (discount.applied) amount = Math.round(fullPrice * (1 - session.price.workshopDiscountPercent / 100));
    }
  }

  const ref = makeRef();
  try {
    await db.prepare(`INSERT INTO orders (ref, created_at, type, product_id, product_name, slot, name, phone, country, child_age, email, problem, lang,
        amount, full_price, currency, discount_requested, discount_applied, discount_note, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`)
      .bind(ref, nowIso(), type, productId, productName, slot, name.value, phone.e164, phone.country, childAge, email.value, problem.value, lang,
        amount, fullPrice, site.currency, discount.requested ? 1 : 0, discount.applied ? 1 : 0,
        discount.requested ? (discount.applied ? `Workshop booking ${discount.workshopRef}` : discount.reason) : null)
      .run();
  } catch (e) {
    if (String(e.message || e).includes('UNIQUE')) return json({ error: 'slot_taken' }, 409);
    throw e;
  }
  return json({ ok: true, order: { ref, type, productId, productName, slot, amount, fullPrice, currency: site.currency, discount } }, 201);
}

async function claimPayment(request, env, ref) {
  let body = {};
  try { body = await request.json(); } catch { /* empty */ }
  const method = String(body.method || '').slice(0, 20);
  await ensureSchema(env.DB);
  const r = await env.DB.prepare("UPDATE orders SET payment_method = ?, payment_claimed_at = ?, updated_at = ? WHERE ref = ? AND status = 'pending'")
    .bind(method, nowIso(), nowIso(), ref).run();
  return json({ ok: (r.meta?.changes ?? 1) > 0 });
}

async function takenSlots(env) {
  await ensureSchema(env.DB);
  await releaseExpiredHolds(env.DB);
  const today = new Date().toISOString().slice(0, 10);
  const { results } = await env.DB.prepare("SELECT slot FROM orders WHERE type = 'session' AND status IN ('pending','paid') AND slot >= ?").bind(today).all();
  return json({ taken: results.map((r) => r.slot) }, 200, { 'cache-control': 'no-store' });
}

/* ---------------- admin ---------------- */
function timingSafeEqual(a, b) {
  const enc = new TextEncoder();
  const x = enc.encode(a), y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}
function isAdmin(request, env) {
  if (!env.ADMIN_PASSWORD) return false;
  const h = request.headers.get('authorization') || '';
  return h.startsWith('Bearer ') && timingSafeEqual(h.slice(7), env.ADMIN_PASSWORD);
}

async function listOrders(url, env) {
  await ensureSchema(env.DB);
  const where = [], args = [];
  const type = url.searchParams.get('type');
  const status = url.searchParams.get('status');
  const q = (url.searchParams.get('q') || '').trim();
  if (type) { where.push('type = ?'); args.push(type); }
  if (status) { where.push('status = ?'); args.push(status); }
  const product = url.searchParams.get('product');
  if (product) { where.push('product_id = ?'); args.push(product); }
  if (q) { where.push('(name LIKE ? OR phone LIKE ? OR ref LIKE ? OR email LIKE ?)'); const like = `%${q.replace(/[%_]/g, '')}%`; args.push(like, like, like, like); }
  const sql = `SELECT * FROM orders ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC LIMIT 1000`;
  const { results } = await env.DB.prepare(sql).bind(...args).all();
  const totals = await (product
    ? env.DB.prepare('SELECT type, status, COUNT(*) AS n, SUM(amount) AS total FROM orders WHERE product_id = ? GROUP BY type, status').bind(product)
    : env.DB.prepare('SELECT type, status, COUNT(*) AS n, SUM(amount) AS total FROM orders GROUP BY type, status')).all();
  return { orders: results, totals: totals.results };
}

async function updateOrder(request, env, ref) {
  let body = {};
  try { body = await request.json(); } catch { /* empty */ }
  const sets = [], args = [];
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) return json({ error: 'bad_status' }, 400);
    sets.push('status = ?'); args.push(body.status);
  }
  if (body.admin_note !== undefined) { sets.push('admin_note = ?'); args.push(String(body.admin_note).slice(0, 1000)); }
  if (!sets.length) return json({ error: 'nothing_to_update' }, 400);
  sets.push('updated_at = ?'); args.push(nowIso());
  try {
    const r = await env.DB.prepare(`UPDATE orders SET ${sets.join(', ')} WHERE ref = ?`).bind(...args, ref).run();
    if (!(r.meta?.changes ?? 1)) return json({ error: 'not_found' }, 404);
  } catch (e) {
    if (String(e.message || e).includes('UNIQUE')) return json({ error: 'slot_taken' }, 409);
    throw e;
  }
  const row = await env.DB.prepare('SELECT * FROM orders WHERE ref = ?').bind(ref).first();
  return json({ ok: true, order: row });
}

function toCsv(rows) {
  const cols = ['ref', 'created_at', 'type', 'product_name', 'slot', 'name', 'phone', 'country', 'child_age', 'email', 'problem',
    'amount', 'full_price', 'currency', 'discount_requested', 'discount_applied', 'discount_note', 'payment_method', 'payment_claimed_at', 'status', 'admin_note'];
  const esc = (v) => { const s = v == null ? '' : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return '﻿' + [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\r\n');
}


/* ---------------- admin: courses & 1-to-1 settings ---------------- */
const SLUG_RE = /^[a-z0-9][a-z0-9-]{2,59}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?([+-]\d{2}:\d{2}|Z)$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Keep only plain text / numbers / lists / objects (templates escape all text) */
function clean(v, depth = 0) {
  if (depth > 5) return undefined;
  if (typeof v === 'string') return v.trim().slice(0, 4000);
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'boolean') return v;
  if (Array.isArray(v)) return v.slice(0, 60).map((x) => clean(x, depth + 1)).filter((x) => x !== undefined && x !== '');
  if (v && typeof v === 'object') {
    const o = {};
    for (const [k, x] of Object.entries(v).slice(0, 60)) { if (/^[a-zA-Z_][\w]{0,40}$/.test(k)) { const c = clean(x, depth + 1); if (c !== undefined) o[k] = c; } }
    return o;
  }
  return undefined;
}

/** Make sure every field the page template reads exists, so a half-filled course never breaks the page */
function shapeContent(c = {}, fallback = {}) {
  const str = (x, f) => (typeof x === 'string' && x ? x : (typeof f === 'string' ? f : ''));
  const arr = (x, f) => (Array.isArray(x) && x.length ? x : (Array.isArray(f) ? f : []));
  const F = fallback || {};
  const P = c.pain || {}, FP = F.pain || {};
  const A = c.audience || {}, FA = F.audience || {};
  const CU = c.curriculum || {}, FCU = F.curriculum || {};
  const IN = c.includes || {}, FIN = F.includes || {};
  const FC = c.final_cta || {}, FFC = F.final_cta || {};
  return {
    name: str(c.name, F.name), kicker: str(c.kicker, F.kicker), tagline: str(c.tagline, F.tagline),
    hero_words: arr(c.hero_words, F.hero_words).filter((x) => typeof x === 'string').slice(0, 3),
    pain: {
      title: str(P.title, FP.title), battles: arr(P.battles, FP.battles).filter((x) => typeof x === 'string'),
      paragraphs: arr(P.paragraphs, FP.paragraphs).filter((x) => typeof x === 'string'),
      insight_title: str(P.insight_title, FP.insight_title), insight: str(P.insight, FP.insight), promise: str(P.promise, FP.promise),
    },
    audience: { title: str(A.title, FA.title), items: arr(A.items, FA.items).filter((x) => typeof x === 'string') },
    curriculum: {
      title: str(CU.title, FCU.title), intro: str(CU.intro, FCU.intro),
      items: arr(CU.items, FCU.items).filter((x) => x && typeof x === 'object').map((x) => ({ title: str(x.title), body: str(x.body) })).filter((x) => x.title),
    },
    includes: {
      title: str(IN.title, FIN.title), seats_note: str(IN.seats_note, FIN.seats_note),
      items: arr(IN.items, FIN.items).filter((x) => x && typeof x === 'object')
        .map((x) => ({ icon: ['live', 'pdf', 'rec', 'gift'].includes(x.icon) ? x.icon : 'live', title: str(x.title), body: str(x.body) })).filter((x) => x.title),
    },
    faq: arr(c.faq, F.faq).filter((x) => x && typeof x === 'object').map((x) => ({ q: str(x.q), a: str(x.a) })).filter((x) => x.q && x.a),
    final_cta: { title: str(FC.title, FFC.title), body: str(FC.body, FFC.body) },
  };
}

function validateCourse(input, existingId, takenSlugs) {
  const d = clean(input) || {};
  const errors = [];
  const slug = String(d.slug || '').toLowerCase();
  if (!SLUG_RE.test(slug)) errors.push('slug');
  else if (takenSlugs.includes(slug)) errors.push('slug_taken');
  const sessions = (d.schedule?.sessions || []).filter((x) => ISO_RE.test(x.start || '') && ISO_RE.test(x.end || '') && new Date(x.end) > new Date(x.start))
    .sort((a, b) => new Date(a.start) - new Date(b.start));
  if (!sessions.length) errors.push('sessions');
  const tiers = (d.pricing?.tiers || []).map((t) => ({
    id: t.id === 'early' ? 'early' : 'regular',
    amount: Math.round(Number(t.amount)),
    until: t.id === 'early' && ISO_RE.test(t.until || '') ? t.until : null,
    label: t.id === 'early' ? { ar: 'سعر الحجز المبكر', en: 'Early-bird price' } : { ar: 'السعر العادي', en: 'Regular price' },
  })).filter((t) => t.amount > 0 && (t.id === 'regular' || t.until));
  if (!tiers.some((t) => t.id === 'regular')) errors.push('price');
  tiers.sort((a, b) => (a.id === 'early' ? -1 : 1) - (b.id === 'early' ? -1 : 1));
  const ar = shapeContent(d.content?.ar);
  if (!ar.name) errors.push('name_ar');
  const en = shapeContent(d.content?.en, ar);
  if (errors.length) return { errors };
  const seo = {
    ar: { title: String(d.seo?.ar?.title || ar.name).slice(0, 120), description: String(d.seo?.ar?.description || ar.tagline || ar.kicker).slice(0, 300) },
    en: { title: String(d.seo?.en?.title || en.name).slice(0, 120), description: String(d.seo?.en?.description || en.tagline || en.kicker).slice(0, 300) },
  };
  const id = existingId || `${slug}-${new Date().toISOString().slice(0, 7).replace('-', '')}`;
  return {
    course: {
      id, slug, status: 'open', type: 'live-workshop', instructor: d.instructor || Object.keys(instructors)[0],
      audienceAge: { min: Number(d.audienceAge?.min) || 0, max: Number(d.audienceAge?.max) || 0 },
      seats: { limited: d.seats?.limited !== false, total: null, left: null },
      schedule: { platform: String(d.schedule?.platform || 'Zoom').slice(0, 40), sessions: sessions.map(({ start, end }) => ({ start, end })) },
      pricing: { currency: site.currency, tiers },
      seo, content: { ar, en },
    },
  };
}

async function adminCourses(env) {
  const draft = await loadDraft(env);
  const live = await loadPublished(env);
  return { courses: draft.courses, session: draft.session, live: { courses: live.courses, session: live.session, publishedAt: live.publishedAt }, pending: !sameContent(draft, live) };
}

async function saveCourse(request, env, id) {
  const body = await request.json().catch(() => ({}));
  const content = await loadDraft(env);
  const existing = id ? content.courses.find((c) => c.id === id) : null;
  if (id && !existing) return json({ error: 'not_found' }, 404);
  const taken = content.courses.filter((c) => c.id !== id).map((c) => c.slug);
  const { course, errors } = validateCourse(body.course || body, existing?.id, taken);
  if (errors) return json({ error: 'invalid', fields: errors }, 400);
  if (existing) {
    await env.DB.prepare('UPDATE courses SET slug = ?, data = ?, updated_at = ? WHERE id = ?').bind(course.slug, JSON.stringify(course), nowIso(), id).run();
  } else {
    const maxSort = content.courses.reduce((m, c) => Math.max(m, c.sort ?? 0), 0);
    let newId = course.id, n = 2;
    while (content.courses.some((c) => c.id === newId)) newId = `${course.id}-${n++}`;
    course.id = newId;
    await env.DB.prepare('INSERT INTO courses (id, slug, data, visible, featured, sort, created_at, updated_at) VALUES (?, ?, ?, 1, 0, ?, ?, ?)')
      .bind(newId, course.slug, JSON.stringify(course), maxSort + 1, nowIso(), nowIso()).run();
  }
  invalidateContent();
  return json({ ok: true, id: course.id }, existing ? 200 : 201);
}

async function patchCourse(request, env, id) {
  const body = await request.json().catch(() => ({}));
  const row = await env.DB.prepare('SELECT id FROM courses WHERE id = ?').bind(id).first();
  if (!row) return json({ error: 'not_found' }, 404);
  const stmts = [];
  if (typeof body.visible === 'boolean') stmts.push(env.DB.prepare('UPDATE courses SET visible = ?, updated_at = ? WHERE id = ?').bind(body.visible ? 1 : 0, nowIso(), id));
  if (body.featured === true) {
    stmts.push(env.DB.prepare('UPDATE courses SET featured = 0'));
    stmts.push(env.DB.prepare('UPDATE courses SET featured = 1, visible = 1, updated_at = ? WHERE id = ?').bind(nowIso(), id));
  }
  if (Number.isInteger(body.sort)) stmts.push(env.DB.prepare('UPDATE courses SET sort = ? WHERE id = ?').bind(body.sort, id));
  if (!stmts.length) return json({ error: 'nothing_to_update' }, 400);
  await env.DB.batch(stmts);
  invalidateContent();
  return json({ ok: true });
}

async function deleteCourse(env, id) {
  const row = await env.DB.prepare('SELECT id FROM courses WHERE id = ?').bind(id).first();
  if (!row) return json({ error: 'not_found' }, 404);
  await env.DB.prepare('DELETE FROM courses WHERE id = ?').bind(id).run();
  invalidateContent();
  return json({ ok: true });
}

async function saveSessionSettings(request, env) {
  const body = clean(await request.json().catch(() => ({}))) || {};
  const content = await loadDraft(env);
  const cur = content.session || seed.session;
  const errors = [];
  const amount = Math.round(Number(body.price?.amount));
  if (!(amount > 0)) errors.push('price');
  const pct = Number(body.price?.workshopDiscountPercent ?? 0);
  if (!(pct >= 0 && pct <= 100)) errors.push('discount');
  const duration = Math.round(Number(body.durationMinutes));
  if (!(duration >= 15 && duration <= 240)) errors.push('duration');
  const weekly = {};
  for (const d of ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri']) {
    const times = (body.weekly?.[d] || []).filter((t) => TIME_RE.test(t));
    if (times.length) weekly[d] = [...new Set(times)].sort();
  }
  const extraSlots = (body.extraSlots || []).filter((x) => DATE_RE.test(x.date || '')).map((x) => ({ date: x.date, times: (x.times || []).filter((t) => TIME_RE.test(t)) })).filter((x) => x.times.length);
  const blockedDates = (body.blockedDates || []).filter((x) => DATE_RE.test(x));
  if (errors.length) return json({ error: 'invalid', fields: errors }, 400);
  const pts = (l) => (body.content?.[l]?.points || []).filter((x) => typeof x === 'string' && x).slice(0, 8);
  const txt = (l) => Object.fromEntries(['kicker', 'title', 'intro'].map((k) => [k, typeof body.content?.[l]?.[k] === 'string' && body.content[l][k] ? body.content[l][k] : cur.content[l][k]]));
  const next = {
    ...cur,
    durationMinutes: duration,
    price: {
      amount, currency: site.currency, workshopDiscountPercent: pct,
      discountRules: {
        validDaysAfterWorkshop: Math.max(0, Math.round(Number(body.price?.discountRules?.validDaysAfterWorkshop ?? 30))),
        firstSessionOnly: body.price?.discountRules?.firstSessionOnly !== false,
        workshopCourse: String(body.price?.discountRules?.workshopCourse || cur.price?.discountRules?.workshopCourse || ''),
      },
    },
    booking: {
      daysAhead: Math.min(180, Math.max(1, Math.round(Number(body.booking?.daysAhead ?? 45)))),
      minNoticeHours: Math.min(336, Math.max(0, Math.round(Number(body.booking?.minNoticeHours ?? 24)))),
    },
    weekly, extraSlots, blockedDates, booked: cur.booked || [], sample: false,
    content: {
      ar: { ...cur.content.ar, ...txt('ar'), points: pts('ar').length ? pts('ar') : cur.content.ar.points },
      en: { ...cur.content.en, ...txt('en'), points: pts('en').length ? pts('en') : cur.content.en.points },
    },
  };
  await env.DB.prepare("INSERT INTO settings (key, data, updated_at) VALUES ('session', ?, ?) ON CONFLICT(key) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at")
    .bind(JSON.stringify(next), nowIso()).run();
  invalidateContent();
  return json({ ok: true, session: next });
}

/** Preview a course from the editor (also unsaved changes) exactly as the page will look */
async function previewCourse(request, env) {
  const body = await request.json().catch(() => ({}));
  const content = await loadDraft(env);
  const input = { ...(body.course || {}) };
  if (!SLUG_RE.test(String(input.slug || ''))) input.slug = 'preview-course';
  const { course, errors } = validateCourse(input, body.id || 'preview', []);
  if (errors) return json({ error: 'invalid', fields: errors }, 400);
  const lang = body.lang === 'en' ? 'en' : 'ar';
  const others = content.courses.filter((c) => c.id !== body.id && c.slug !== course.slug);
  const existing = content.courses.find((c) => c.id === body.id);
  const featured = !!existing?.featured || !others.some((c) => c.visible && c.featured);
  const temp = { ...content, courses: [...others.map((c) => (featured ? { ...c, featured: false } : c)), { ...course, visible: true, featured }] };
  const route = (lang === site.defaultLang ? '' : `${lang}/`) + (featured ? '' : `courses/${course.slug}/`);
  const html = renderer.render(route, temp);
  if (!html) return json({ error: 'not_found' }, 404);
  return json({ html, path: '/' + route });
}

/* ---------------- public pages (rendered from the database) ---------------- */
const PAGE_HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'public, max-age=0, must-revalidate',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'SAMEORIGIN',
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
};
async function servePage(request, env, url) {
  const path = url.pathname;
  if (path === '/sitemap.xml') {
    const content = await loadContent(env);
    return new Response(renderer.sitemap(content), { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=300' } });
  }
  if (/\.[a-z0-9]+$/i.test(path)) return env.ASSETS.fetch(request); // files (images, css, …)
  if (!path.endsWith('/')) return Response.redirect(`${url.origin}${path}/${url.search}`, 301);
  const route = path.slice(1);
  const content = await loadContent(env);
  // the home-page course also has a /courses/<slug>/ address → send it to the home page
  const { featured } = renderer.visibleCourses(content);
  const m = route.match(/^((?:en\/)?)courses\/([a-z0-9-]+)\/$/);
  if (m && featured && m[2] === featured.slug) return Response.redirect(`${url.origin}/${m[1]}${url.search}`, 301);
  const html = renderer.render(route, content);
  if (html == null) {
    const asset = await env.ASSETS.fetch(request); // e.g. /admin/
    if (asset.status !== 404) return asset;
    const nf = await env.ASSETS.fetch(new Request(`${url.origin}/404.html`));
    return new Response(nf.body, { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } });
  }
  return new Response(html, { headers: PAGE_HEADERS });
}

/* ---------------- router ---------------- */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;
    if (!pathname.startsWith('/api/')) {
      // live pages from the database; static pages from dist/ if the database isn't connected or fails
      if (env.DB && request.method === 'GET') {
        try { return await servePage(request, env, url); } catch (e) { console.error('page render failed', e); }
      }
      return env.ASSETS.fetch(request);
    }
    if (!env.DB) return json({ error: 'db_unavailable' }, 503);
    try {
      if (pathname === '/api/orders' && request.method === 'POST') return await createOrder(request, env);
      let m = pathname.match(/^\/api\/orders\/(RLP-[A-Z0-9-]+)\/payment$/);
      if (m && request.method === 'POST') return await claimPayment(request, env, m[1]);
      if (pathname === '/api/slots' && request.method === 'GET') return await takenSlots(env);

      if (pathname.startsWith('/api/admin/')) {
        if (!env.ADMIN_PASSWORD) return json({ error: 'admin_not_configured' }, 503);
        if (!isAdmin(request, env)) return json({ error: 'unauthorized' }, 401);
        if (pathname === '/api/admin/orders' && request.method === 'GET') return json(await listOrders(url, env));
        if (pathname === '/api/admin/orders.csv' && request.method === 'GET') {
          const { orders } = await listOrders(url, env);
          return new Response(toCsv(orders), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="bookings-${new Date().toISOString().slice(0, 10)}.csv"`, 'cache-control': 'no-store' } });
        }
        m = pathname.match(/^\/api\/admin\/orders\/(RLP-[A-Z0-9-]+)$/);
        if (m && request.method === 'PATCH') return await updateOrder(request, env, m[1]);
        if (pathname === '/api/admin/courses' && request.method === 'GET') return json(await adminCourses(env));
        if (pathname === '/api/admin/courses' && request.method === 'POST') return await saveCourse(request, env, null);
        m = pathname.match(/^\/api\/admin\/courses\/([a-z0-9-]+)$/);
        if (m && request.method === 'PUT') return await saveCourse(request, env, m[1]);
        if (m && request.method === 'PATCH') return await patchCourse(request, env, m[1]);
        if (m && request.method === 'DELETE') return await deleteCourse(env, m[1]);
        if (pathname === '/api/admin/settings/session' && request.method === 'PUT') return await saveSessionSettings(request, env);
        if (pathname === '/api/admin/preview' && request.method === 'POST') return await previewCourse(request, env);
        if (pathname === '/api/admin/publish' && request.method === 'POST') return await publishDraft(env);
        if (pathname === '/api/admin/discard' && request.method === 'POST') return await discardDraft(env);
      }
      return json({ error: 'not_found' }, 404);
    } catch (e) {
      console.error(e);
      return json({ error: 'server_error' }, 500);
    }
  },
};
