/**
 * Real Life Parents — booking API (Cloudflare Worker + D1 database).
 *
 * Static pages are served from ./dist by Cloudflare. Only /api/* reaches this code
 * (see "run_worker_first" in wrangler.jsonc).
 *
 * Public:
 *   POST /api/orders                 save a workshop or 1-to-1 booking; checks the workshop discount
 *   POST /api/orders/:ref/payment    remember which payment method she used ("I've sent the payment")
 *   GET  /api/slots                  1-to-1 times that are already taken
 * Admin (header  Authorization: Bearer <ADMIN_PASSWORD>):
 *   GET   /api/admin/orders          list / search bookings
 *   PATCH /api/admin/orders/:ref     change status (pending / paid / cancelled) or add a note
 *   GET   /api/admin/orders.csv      export
 */
import catalog from './catalog.generated.json' with { type: 'json' };
import { validateName, validatePhone, validateEmail, validateProblem } from '../src/assets/js/ui/validate.js';
import { buildSlots } from '../src/assets/js/sessions.js';
import { activeTier } from '../src/assets/js/commerce/pricing.js';

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
];
let schemaReady = null;
function ensureSchema(db) {
  schemaReady ||= db.batch(SCHEMA.map((s) => db.prepare(s))).catch((e) => { schemaReady = null; throw e; });
  return schemaReady;
}
const nowIso = () => new Date().toISOString();

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

function findProduct(productId) {
  const course = catalog.courses.find((c) => c.id === productId);
  if (course) return { type: 'workshop', course };
  const session = catalog.sessions.find((s) => s.id === productId);
  if (session) return { type: 'session', session };
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
async function checkDiscount(db, session, phone, slot) {
  const rules = session.price.discountRules || {};
  const course = catalog.courses.find((c) => c.slug === rules.workshopCourse) || catalog.courses[0];
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
  const product = findProduct(String(body.productId || ''));
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
    type = 'workshop'; productId = course.id; productName = course.name[lang];
    amount = fullPrice = activeTier(course).amount;
  } else {
    const { session } = product;
    type = 'session'; productId = session.id; productName = session.name[lang];
    slot = String(body.slot || '');
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(slot)) return json({ error: 'invalid', fields: { slot: 'empty' } }, 400);
    // the time must exist in the published availability
    const [date, time] = slot.split('T');
    const open = (buildSlots(session)[date] || []).some((s) => s.time === time && s.status === 'open');
    if (!open) return json({ error: 'slot_unavailable' }, 409);
    await releaseExpiredHolds(db);
    amount = fullPrice = session.price.amount;
    if (body.requestDiscount) {
      discount = { requested: true, ...(await checkDiscount(db, session, phone.e164, slot)) };
      if (discount.applied) amount = Math.round(fullPrice * (1 - session.price.workshopDiscountPercent / 100));
    }
  }

  const ref = makeRef();
  try {
    await db.prepare(`INSERT INTO orders (ref, created_at, type, product_id, product_name, slot, name, phone, country, child_age, email, problem, lang,
        amount, full_price, currency, discount_requested, discount_applied, discount_note, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`)
      .bind(ref, nowIso(), type, productId, productName, slot, name.value, phone.e164, phone.country, childAge, email.value, problem.value, lang,
        amount, fullPrice, catalog.currency, discount.requested ? 1 : 0, discount.applied ? 1 : 0,
        discount.requested ? (discount.applied ? `Workshop booking ${discount.workshopRef}` : discount.reason) : null)
      .run();
  } catch (e) {
    if (String(e.message || e).includes('UNIQUE')) return json({ error: 'slot_taken' }, 409);
    throw e;
  }
  return json({ ok: true, order: { ref, type, productId, productName, slot, amount, fullPrice, currency: catalog.currency, discount } }, 201);
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
  if (q) { where.push('(name LIKE ? OR phone LIKE ? OR ref LIKE ? OR email LIKE ?)'); const like = `%${q.replace(/[%_]/g, '')}%`; args.push(like, like, like, like); }
  const sql = `SELECT * FROM orders ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC LIMIT 1000`;
  const { results } = await env.DB.prepare(sql).bind(...args).all();
  const totals = await env.DB.prepare("SELECT type, status, COUNT(*) AS n, SUM(amount) AS total FROM orders GROUP BY type, status").all();
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

/* ---------------- router ---------------- */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;
    if (!pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
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
      }
      return json({ error: 'not_found' }, 404);
    } catch (e) {
      console.error(e);
      return json({ error: 'server_error' }, 500);
    }
  },
};
