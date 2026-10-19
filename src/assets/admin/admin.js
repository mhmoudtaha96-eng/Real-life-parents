// Admin dashboard: bookings, courses (add / edit / show on site) and 1-to-1 settings.
// Talks to worker/index.js → /api/admin/* with the admin password.
import { parseVideo } from '../js/media/video.js';

const KEY = 'rlp.admin';
const TZ = 'Africa/Cairo';
let pw = ''; try { pw = sessionStorage.getItem(KEY) || ''; } catch { /* private mode */ }

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = (o) => JSON.parse(JSON.stringify(o ?? null));
let toastT;
const toast = (t, ms = 2600) => { const n = $('#toast'); n.textContent = t; n.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (n.hidden = true), ms); };

/* ---------- Cairo time helpers ---------- */
function cairoOffset(date) { // 'YYYY-MM-DD' → '+02:00' / '+03:00'
  const probe = new Date(`${date}T12:00:00Z`);
  const p = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'longOffset' }).formatToParts(probe).find((x) => x.type === 'timeZoneName')?.value || '';
  const m = p.match(/GMT([+-]\d{2}):?(\d{2})?/);
  return m ? `${m[1]}:${m[2] || '00'}` : '+02:00';
}
const toIso = (date, time) => `${date}T${time}:00${cairoOffset(date)}`;
function fromIso(iso) { // → { date, time } in Cairo
  if (!iso) return { date: '', time: '' };
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}
const fmtDay = (iso) => new Date(iso).toLocaleDateString('en-GB', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const fmtTime = (iso) => new Date(iso).toLocaleTimeString('en-GB', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true });
const fmtDate = (iso) => iso ? new Date(iso).toLocaleString('en-GB', { timeZone: TZ, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
const fmtSlot = (s) => s ? new Date(s + ':00Z').toLocaleString('en-GB', { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
const money = (n) => Number(n || 0).toLocaleString('en');
const addDays = (date, n) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/* ---------- API ---------- */
async function api(path, opts = {}) {
  const res = await fetch(path, { ...opts, headers: { ...(opts.headers || {}), authorization: 'Bearer ' + pw, 'content-type': 'application/json' }, cache: 'no-store' });
  if (res.status === 401) { showLogin('Wrong password.'); throw new Error('401'); }
  if (res.status === 503) {
    const b = await res.json().catch(() => ({}));
    showLogin(b.error === 'admin_not_configured' ? 'Admin password is not set in Cloudflare yet (ADMIN_PASSWORD).' : 'The database is not connected yet (see setup steps).');
    throw new Error('503');
  }
  return res;
}
function showLogin(msg) { $('#app').hidden = true; $('#login').hidden = false; $('#login-err').hidden = !msg; $('#login-err').textContent = msg || ''; $('#pw').focus(); }
$('#login-form').addEventListener('submit', async (e) => { e.preventDefault(); pw = $('#pw').value; try { sessionStorage.setItem(KEY, pw); } catch { /* */ } await start(); });
$('#logout').addEventListener('click', () => { pw = ''; try { sessionStorage.removeItem(KEY); } catch { /* */ } showLogin(); });

/* ---------- views ---------- */
let view = 'bookings';
let dirty = false;
function setView(v) {
  if (dirty && !confirm('You have unsaved changes. Leave without saving?')) return;
  dirty = false;
  view = v;
  $$('.nav [data-view]').forEach((b) => (b.getAttribute('data-view') === v ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current')));
  for (const id of ['bookings', 'courses', 'settings', 'media']) $('#view-' + id).hidden = id !== v;
  $('#savebar')?.remove();
  try { history.replaceState(null, '', '#' + v); } catch { /* */ }
  if (v === 'bookings') loadBookings();
  if (v === 'courses') { showCourseList(); loadCourses(); }
  if (v === 'settings') loadCourses().then(renderSessionForm);
  if (v === 'media') loadCourses().then(renderMediaForm);
  window.scrollTo(0, 0);
}
$$('.nav [data-view]').forEach((b) => b.addEventListener('click', () => setView(b.getAttribute('data-view'))));
window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

async function start() {
  if (!pw) return showLogin();
  let data;
  try { data = await (await api('/api/admin/courses')).json(); } catch { return; }
  store = data;
  fillProductFilter();
  renderPublishBar();
  $('#login').hidden = true; $('#app').hidden = false;
  const h = location.hash.slice(1);
  setView(['bookings', 'courses', 'settings', 'media'].includes(h) ? h : 'bookings');
}

/* =================================================================
   BOOKINGS
   ================================================================= */
let type = 'workshop', rows = [];
$('#refresh').addEventListener('click', loadBookings);
$$('.tab[data-type]').forEach((b) => b.addEventListener('click', () => { type = b.dataset.type; $$('.tab[data-type]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); loadBookings(); }));
$('#status').addEventListener('change', loadBookings);
$('#product').addEventListener('change', loadBookings);
let qT; $('#q').addEventListener('input', () => { clearTimeout(qT); qT = setTimeout(loadBookings, 300); });
const params = () => new URLSearchParams({
  ...(type ? { type } : {}), ...($('#status').value ? { status: $('#status').value } : {}),
  ...($('#product').value ? { product: $('#product').value } : {}), ...($('#q').value.trim() ? { q: $('#q').value.trim() } : {}),
});
function fillProductFilter() {
  const sel = $('#product'); const cur = sel.value;
  sel.innerHTML = '<option value="">All courses</option>' + (store.courses || []).map((c) => `<option value="${esc(c.id)}">${esc(c.content?.en?.name || c.content?.ar?.name)} (${esc(fromIso(c.schedule?.sessions?.[0]?.start).date)})</option>`).join('');
  sel.value = cur;
}

async function loadBookings() {
  let data;
  try { data = await (await api('/api/admin/orders?' + params())).json(); } catch { return; }
  rows = data.orders || [];
  renderTiles(data.totals || []);
  renderRows();
}
function renderTiles(totals) {
  const t = (ty, st) => totals.filter((r) => (!ty || r.type === ty) && (!st || r.status === st));
  const n = (a) => a.reduce((s, r) => s + r.n, 0), sum = (a) => a.reduce((s, r) => s + (r.total || 0), 0);
  const ty = type || null;
  $('#tiles').innerHTML = [
    ['Pending payment', n(t(ty, 'pending'))], ['Paid', n(t(ty, 'paid'))], ['Cancelled', n(t(ty, 'cancelled'))],
    ['Paid revenue (EGP)', money(sum(t(ty, 'paid')))],
  ].map(([l, v]) => `<div class="tile"><small>${l}</small><b>${v}</b></div>`).join('');
}
function renderRows() {
  $('#th-slot').hidden = type === 'workshop';
  $('#empty').hidden = rows.length > 0;
  $('#rows').innerHTML = rows.map((r, i) => {
    const wa = r.phone ? 'https://wa.me/' + r.phone.replace(/\D/g, '') : '';
    const disc = r.discount_requested ? (r.discount_applied ? '<span class="pill disc">workshop discount</span>' : `<span class="pill nodisc" title="${esc(r.discount_note)}">discount refused</span>`) : '';
    return `<tr>
      <td class="num">${fmtDate(r.created_at)}</td>
      <td class="num"><b>${esc(r.ref)}</b><br><small class="ar">${esc(r.product_name || (r.type === 'session' ? '1-to-1' : 'Workshop'))}</small></td>
      <td class="ar">${esc(r.name)}${r.email ? `<br><small dir="ltr">${esc(r.email)}</small>` : ''}</td>
      <td class="num"><a href="${wa}" target="_blank" rel="noopener">${esc(r.phone)}</a><br><small>${esc(r.country)}</small></td>
      <td class="ar">${esc(r.child_age)}</td>
      ${type === 'workshop' ? '' : `<td class="num">${esc(fmtSlot(r.slot))}</td>`}
      <td class="num"><b>${r.amount ?? ''}</b> ${esc(r.currency)}${r.full_price && r.full_price !== r.amount ? `<br><s><small>${r.full_price}</small></s>` : ''}<br>${disc}</td>
      <td>${esc(r.payment_method || '—')}${r.payment_claimed_at ? `<br><small>says paid ${fmtDate(r.payment_claimed_at)}</small>` : ''}</td>
      <td><select class="status ${esc(r.status)}" data-ref="${esc(r.ref)}" aria-label="Status for ${esc(r.ref)}">${['pending', 'paid', 'cancelled'].map((s) => `<option value="${s}"${s === r.status ? ' selected' : ''}>${({ pending: 'Pending', paid: 'Paid', cancelled: 'Cancelled' })[s]}</option>`).join('')}</select></td>
      <td><button class="more" data-i="${i}" aria-expanded="false">Details</button></td>
    </tr>
    <tr class="detail" id="d${i}" hidden><td colspan="10"><div class="detail-grid">
      <div><span class="lbl">Biggest challenge</span><p class="ar">${esc(r.problem || '—')}</p></div>
      <div><label for="n${i}">Internal note</label><textarea id="n${i}" rows="3">${esc(r.admin_note || '')}</textarea>
      <button class="btn sm" style="margin-top:8px" data-save="${esc(r.ref)}" data-i="${i}">Save note</button>
      ${r.discount_note ? `<p style="margin-top:8px"><small>Discount check: ${esc(r.discount_note)}</small></p>` : ''}</div>
    </div></td></tr>`;
  }).join('');
}
$('#rows').addEventListener('click', async (e) => {
  const m = e.target.closest('.more');
  if (m) { const d = $('#d' + m.dataset.i); d.hidden = !d.hidden; m.setAttribute('aria-expanded', String(!d.hidden)); return; }
  const sv = e.target.closest('[data-save]');
  if (sv) {
    try { const r = await api('/api/admin/orders/' + sv.dataset.save, { method: 'PATCH', body: JSON.stringify({ admin_note: $('#n' + sv.dataset.i).value }) }); toast(r.ok ? 'Note saved' : 'Could not save note'); } catch { /* */ }
  }
});
$('#rows').addEventListener('change', async (e) => {
  const s = e.target.closest('select.status'); if (!s) return;
  try {
    const r = await api('/api/admin/orders/' + s.dataset.ref, { method: 'PATCH', body: JSON.stringify({ status: s.value }) });
    if (r.status === 409) { toast('That session time is already taken by another booking'); return loadBookings(); }
    if (!r.ok) { toast('Could not update'); return loadBookings(); }
    toast('Marked as ' + s.value);
    loadBookings();
  } catch { /* */ }
});
$('#export').addEventListener('click', async () => {
  try {
    const blob = await (await api('/api/admin/orders.csv?' + params())).blob();
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'bookings-' + (type || 'all') + '-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } catch { /* */ }
});

/* =================================================================
   COURSES
   ================================================================= */
let store = { courses: [], session: null, live: { courses: [] }, pending: false };
let loadSeq = 0;
async function loadCourses() {
  const seq = ++loadSeq;
  let data;
  try { data = await (await api('/api/admin/courses')).json(); } catch { return; }
  if (seq !== loadSeq) return; // a newer reload is on its way
  store = data;
  fillProductFilter();
  renderPublishBar();
  if (view === 'courses' && $('#course-form').hidden) renderCourseList();
}

/* ---------- Apply to website ---------- */
// Every change in Courses and 1-to-1 sessions is saved as a draft. Visitors keep seeing the last applied
// version until "Apply to website" is clicked.
const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
const same = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
function changeCount() {
  const live = store.live?.courses || [];
  let n = 0;
  for (const c of store.courses || []) { const l = live.find((x) => x.id === c.id); if (!l || !same(c, l)) n++; }
  n += live.filter((l) => !(store.courses || []).some((c) => c.id === l.id)).length;
  if (store.live?.session && !same(store.session, store.live.session)) n++;
  if (store.live?.coach && !same(store.coach, store.live.coach)) n++;
  return n;
}
function renderPublishBar() {
  const bar = $('#publish');
  bar.hidden = false;
  const n = store.pending ? Math.max(1, changeCount()) : 0;
  bar.className = 'publish ' + (n ? 'pending' : 'live');
  $('#publish-text').textContent = n
    ? `${n} change${n > 1 ? 's' : ''} saved but not on the website yet. Click “Apply to website” when you're ready.`
    : `The website is up to date${store.live?.publishedAt ? ' (last applied ' + fmtDate(store.live.publishedAt) + ')' : ''}.`;
}
$('#apply').addEventListener('click', async () => {
  if (dirty) { toast('Save or cancel the form you are editing first'); return; }
  const shown = (store.courses || []).filter((c) => c.visible);
  const names = shown.map((c, i) => `${i + 1}. ${c.content?.en?.name || c.content?.ar?.name}`).join('\n');
  if (!confirm(`Apply all changes to the live website?\n\nCourses that will be on the website (${shown.length}):\n${names || '(none)'}`)) return;
  const btn = $('#apply'); btn.disabled = true;
  try {
    const r = await api('/api/admin/publish', { method: 'POST', body: '{}' });
    toast(r.ok ? 'Done. The website now shows your changes.' : 'Could not apply. Try again.', 4000);
  } catch { /* */ } finally { btn.disabled = false; }
  await loadCourses();
  if (view === 'settings') renderSessionForm();
  if (view === 'media') renderMediaForm();
});
$('#discard').addEventListener('click', async () => {
  if (!confirm('Throw away all changes that are not on the website yet?\n\nCourses and 1-to-1 settings go back to what the website shows now. This cannot be undone.')) return;
  try { const r = await api('/api/admin/discard', { method: 'POST', body: '{}' }); toast(r.ok ? 'Changes discarded' : 'Could not discard'); } catch { /* */ }
  dirty = false;
  await loadCourses();
  if (view === 'courses') { showCourseList(); renderCourseList(); }
  if (view === 'settings') renderSessionForm();
  if (view === 'media') renderMediaForm();
});

/* one change at a time, so quick clicks never overwrite each other */
let queue = Promise.resolve();
const enqueue = (fn) => (queue = queue.then(fn, fn));
const liveOf = (c) => (store.live?.courses || []).find((x) => x.id === c.id);
const courseUrl = (c) => (c.featured ? '/' : `/courses/${c.slug}/`);
function priceFacts(c) {
  const tiers = c.pricing?.tiers || [];
  const early = tiers.find((t) => t.id === 'early'), reg = tiers.find((t) => t.id === 'regular');
  return [
    early ? `<li><b>Early-bird:</b> ${money(early.amount)} EGP until ${esc(fmtDay(early.until))}</li>` : '',
    reg ? `<li><b>Regular:</b> ${money(reg.amount)} EGP</li>` : '',
  ].join('');
}
function renderCourseList() {
  const list = store.courses || [];
  const visible = list.filter((c) => c.visible);
  const homeId = (visible.find((c) => c.featured) || visible[0])?.id;
  $('#clist').innerHTML = list.length ? list.map((c, i) => {
    const ss = c.schedule?.sessions || [];
    const past = ss.length && new Date(ss[ss.length - 1].end) < new Date();
    const dates = ss.map((s) => `${fmtDay(s.start)}, ${fmtTime(s.start)}–${fmtTime(s.end)}`).join(' · ');
    return `<article class="ccard${c.visible ? '' : ' is-hidden'}" data-id="${esc(c.id)}">
      <span class="cnum" aria-label="Course number ${i + 1}">${i + 1}</span>
      <div class="cmain">
        <h3><span dir="rtl">${esc(c.content?.ar?.name)}</span><small dir="ltr">${esc(c.content?.en?.name)}</small></h3>
        <p style="margin:6px 0 0;display:flex;gap:6px;flex-wrap:wrap">
          ${liveOf(c)?.visible ? '<span class="pill on">Live on website</span>' : '<span class="pill off">Not on website</span>'}
          ${!liveOf(c) ? '<span class="pill chg">New: not applied yet</span>' : !same(c, liveOf(c)) ? '<span class="pill chg">Changes not applied yet</span>' : ''}
          ${c.visible && c.id === homeId ? '<span class="pill home">Home page</span>' : ''}
          ${past ? '<span class="pill past">Finished</span>' : ''}
        </p>
        <ul class="cfacts">
          <li><b>Dates (Cairo):</b> ${esc(dates || '—')}</li>
          ${priceFacts(c)}
          <li><b>Ages:</b> ${esc(c.audienceAge?.min)}–${esc(c.audienceAge?.max)}</li>
          ${c.visible ? `<li><b>Page:</b> <a href="${courseUrl({ ...c, featured: c.id === homeId })}" target="_blank" rel="noopener">${esc(courseUrl({ ...c, featured: c.id === homeId }))}</a></li>` : ''}
        </ul>
      </div>
      <div class="cside">
        <label class="switch"><input type="checkbox" data-act="visible" ${c.visible ? 'checked' : ''}> Show on website</label>
        <label class="switch"><input type="radio" name="home" data-act="featured" ${c.visible && c.id === homeId ? 'checked' : ''}> Home page</label>
        <div class="cact">
          <button class="icon-btn" type="button" data-act="up" ${i === 0 ? 'disabled' : ''} aria-label="Move up" title="Move up">↑</button>
          <button class="icon-btn" type="button" data-act="down" ${i === list.length - 1 ? 'disabled' : ''} aria-label="Move down" title="Move down">↓</button>
          <button class="btn sm" type="button" data-act="edit">Edit</button>
          <button class="btn sm" type="button" data-act="copy" title="New course starting from this one">Duplicate</button>
          <button class="btn sm danger" type="button" data-act="delete">Delete</button>
        </div>
      </div>
    </article>`;
  }).join('') : '<p class="empty card">No courses yet. Click “Add new course”.</p>';
}
$('#clist').addEventListener('change', (e) => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const id = el.closest('[data-id]').dataset.id;
  const act = el.dataset.act;
  const body = act === 'visible' ? { visible: el.checked } : { featured: true };
  // update the list right away, then save in order
  const c = store.courses.find((x) => x.id === id);
  if (act === 'visible') c.visible = el.checked;
  else { store.courses.forEach((x) => (x.featured = x.id === id)); c.visible = true; }
  store.pending = true; renderPublishBar(); renderCourseList();
  enqueue(async () => {
    try {
      const r = await api('/api/admin/courses/' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify(body) });
      toast(r.ok ? (act === 'visible' ? (body.visible ? 'Will be on the website after “Apply to website”' : 'Will be hidden after “Apply to website”') : 'Will be the home page after “Apply to website”') : 'Could not update', 3200);
    } catch { /* */ }
  });
  enqueue(loadCourses);
});
$('#clist').addEventListener('click', async (e) => {
  const el = e.target.closest('button[data-act]'); if (!el) return;
  const id = el.closest('[data-id]').dataset.id;
  const list = store.courses;
  const i = list.findIndex((c) => c.id === id);
  const c = list[i];
  if (el.dataset.act === 'edit') return openCourseForm(c, 'edit');
  if (el.dataset.act === 'copy') return openCourseForm(c, 'new');
  if (el.dataset.act === 'delete') {
    if (!confirm(`Delete “${c.content?.en?.name || c.content?.ar?.name}”?\n\nThis can't be undone. Bookings already made stay in the Bookings list.\nTip: to just take it off the website, untick “Show on website” instead.`)) return;
    await enqueue(async () => { try { const r = await api('/api/admin/courses/' + encodeURIComponent(id), { method: 'DELETE' }); toast(r.ok ? 'Deleted. It leaves the website after “Apply to website”.' : 'Could not delete', 3200); } catch { /* */ } });
    return enqueue(loadCourses);
  }
  if (el.dataset.act === 'up' || el.dataset.act === 'down') {
    const j = el.dataset.act === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= list.length) return;
    const order = list.map((x) => x.id);
    [order[i], order[j]] = [order[j], order[i]];
    await enqueue(async () => { try { await Promise.all(order.map((cid, n) => api('/api/admin/courses/' + encodeURIComponent(cid), { method: 'PATCH', body: JSON.stringify({ sort: n }) }))); } catch { /* */ } });
    enqueue(loadCourses);
  }
});
$('#add-course').addEventListener('click', () => openCourseForm((store.courses || [])[0] || null, 'new'));

function showCourseList() {
  $('#course-form').hidden = true; $('#courses-list-view').hidden = false; $('#savebar')?.remove();
}

/* ---------- course editor ---------- */
// Page text fields, per language. path: where it lives in course.content[lang] (or course.seo[lang] for "seo.")
const ICONS = [['live', 'Live sessions'], ['pdf', 'PDF / worksheet'], ['rec', 'Recording'], ['gift', 'Gift / bonus']];
const TEXT = [
  { title: 'Top of the page', fields: [
    { path: 'name', label: 'Course name', kind: 'input', required: 'ar' },
    { path: 'kicker', label: 'Small line above the name (who it is for)', kind: 'input' },
    { path: 'tagline', label: 'Sentence under the name', kind: 'textarea' },
    { path: 'hero_words', label: 'Words in the speech bubbles (one per line, up to 3)', kind: 'lines', rows: 3 },
  ] },
  { title: 'The problem', fields: [
    { path: 'pain.title', label: 'Title', kind: 'input' },
    { path: 'pain.battles', label: 'Daily battles chips (one per line)', kind: 'lines' },
    { path: 'pain.paragraphs', label: 'Paragraphs (leave an empty line between paragraphs)', kind: 'paras', rows: 6 },
    { path: 'pain.insight_title', label: 'Highlighted box: title', kind: 'input' },
    { path: 'pain.insight', label: 'Highlighted box: text', kind: 'textarea' },
    { path: 'pain.promise', label: 'Promise sentence', kind: 'textarea' },
  ] },
  { title: 'Who it is for', fields: [
    { path: 'audience.title', label: 'Title', kind: 'input' },
    { path: 'audience.items', label: 'Points (one per line)', kind: 'lines', rows: 6 },
  ] },
  { title: 'What you will learn', fields: [
    { path: 'curriculum.title', label: 'Title', kind: 'input' },
    { path: 'curriculum.intro', label: 'Intro line', kind: 'textarea' },
    { path: 'curriculum.items', label: 'Topic', kind: 'list', sub: [['title', 'Topic title', 'input'], ['body', 'Short explanation', 'textarea']] },
  ] },
  { title: 'What you get', fields: [
    { path: 'includes.title', label: 'Title', kind: 'input' },
    { path: 'includes.items', label: 'Item', kind: 'list', sub: [['icon', 'Icon', 'icon'], ['title', 'Title', 'input'], ['body', 'Text', 'textarea']] },
    { path: 'includes.seats_note', label: 'Limited seats note', kind: 'textarea' },
  ] },
  { title: 'Questions & answers', fields: [
    { path: 'faq', label: 'Question', kind: 'list', sub: [['q', 'Question', 'input'], ['a', 'Answer', 'textarea']] },
  ] },
  { title: 'Last call to action', fields: [
    { path: 'final_cta.title', label: 'Title', kind: 'input' },
    { path: 'final_cta.body', label: 'Text', kind: 'textarea' },
  ] },
  { title: 'Google (search results)', fields: [
    { path: 'seo.title', label: 'Title shown on Google (about 60 characters)', kind: 'input', counter: 60 },
    { path: 'seo.description', label: 'Description shown on Google (about 155 characters)', kind: 'textarea', counter: 155 },
  ] },
];
const getPath = (o, p) => p.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);
const setPath = (o, p, v) => { const ks = p.split('.'); let x = o; ks.slice(0, -1).forEach((k) => { x[k] ??= {}; x = x[k]; }); x[ks[ks.length - 1]] = v; };

let editing = null; // { mode: 'new'|'edit', id, base }
let slugTouched = false;

function langPane(c, lang) {
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const src = (p) => (p.startsWith('seo.') ? getPath(c.seo?.[lang], p.slice(4)) : getPath(c.content?.[lang], p));
  return `<div class="langpane" data-lang="${lang}" ${lang === 'ar' ? '' : 'hidden'}>` + TEXT.map((sec) => `
    <div class="card"><h3>${sec.title}</h3><div class="grid" style="margin-top:10px">
      ${sec.fields.map((f) => fieldHtml(f, src(f.path), lang, dir)).join('')}
    </div></div>`).join('') + '</div>';
}
function fieldHtml(f, val, lang, dir) {
  const id = `f-${lang}-${f.path.replace(/\./g, '-')}`;
  const req = f.required === lang;
  const label = `<label for="${id}">${esc(f.label)}${req ? ' *' : ''}</label>`;
  const data = `data-path="${f.path}" data-lang="${lang}" data-kind="${f.kind}"`;
  if (f.kind === 'input') return `<div class="f wide">${label}<input id="${id}" ${data} dir="${dir}" value="${esc(val)}" ${f.counter ? `data-counter="${f.counter}"` : ''}>${f.counter ? '<small class="help" data-count></small>' : ''}</div>`;
  if (f.kind === 'textarea') return `<div class="f wide">${label}<textarea id="${id}" ${data} dir="${dir}" rows="${f.rows || 3}" ${f.counter ? `data-counter="${f.counter}"` : ''}>${esc(val)}</textarea>${f.counter ? '<small class="help" data-count></small>' : ''}</div>`;
  if (f.kind === 'lines') return `<div class="f wide">${label}<textarea id="${id}" ${data} dir="${dir}" rows="${f.rows || 5}">${esc((val || []).join('\n'))}</textarea></div>`;
  if (f.kind === 'paras') return `<div class="f wide">${label}<textarea id="${id}" ${data} dir="${dir}" rows="${f.rows || 6}">${esc((val || []).join('\n\n'))}</textarea></div>`;
  if (f.kind === 'list') {
    return `<div class="f wide"><div class="items" ${data}>${(val || []).map((it) => itemHtml(f, it, dir)).join('')}</div>
      <p style="margin:6px 0 0"><button class="btn sm" type="button" data-add-item>+ Add ${esc(f.label.toLowerCase())}</button></p></div>`;
  }
  return '';
}
function itemHtml(f, it = {}, dir) {
  return `<div class="item"><div class="item-head"><span class="lbl">${esc(f.label)}</span>
    <button class="icon-btn" type="button" data-item-up aria-label="Move up">↑</button><button class="icon-btn" type="button" data-item-down aria-label="Move down">↓</button><button class="icon-btn" type="button" data-item-del aria-label="Remove">✕</button></div>
    ${f.sub.map(([k, l, kind]) => (kind === 'icon'
      ? `<label class="f"><span class="lbl">${l}</span><select data-k="${k}">${ICONS.map(([v, t]) => `<option value="${v}"${it[k] === v ? ' selected' : ''}>${t}</option>`).join('')}</select></label>`
      : kind === 'input'
        ? `<label class="f"><span class="lbl">${l}</span><input data-k="${k}" dir="${dir}" value="${esc(it[k])}"></label>`
        : `<label class="f"><span class="lbl">${l}</span><textarea data-k="${k}" dir="${dir}" rows="2">${esc(it[k])}</textarea></label>`)).join('')}
  </div>`;
}
const sessionRow = (s = {}) => {
  const a = s.start ? fromIso(s.start) : { date: '', time: s.startTime || '' };
  const b = s.end ? fromIso(s.end) : { time: s.endTime || '' };
  return `<div class="row" data-session>
    <div class="f"><span class="lbl">Date</span><input type="date" data-s="date" value="${a.date}"></div>
    <div class="f"><span class="lbl">Starts (Cairo)</span><input type="time" data-s="start" value="${a.time}"></div>
    <div class="f"><span class="lbl">Ends (Cairo)</span><input type="time" data-s="end" value="${b.time}"></div>
    <button class="icon-btn" type="button" data-del-session aria-label="Remove this date" style="margin-bottom:4px">✕</button>
  </div>`;
};

function openCourseForm(src, mode) {
  const c = clone(src) || { content: { ar: {}, en: {} }, seo: { ar: {}, en: {} }, schedule: { platform: 'Zoom', sessions: [] }, pricing: { tiers: [] }, audienceAge: { min: 1, max: 4 }, seats: { limited: true } };
  if (mode === 'new') { // start from an existing course: keep the text and prices, clear address and dates
    c.slug = '';
    c.seo = { ar: {}, en: {} }; // Google title/description: empty = made from the new name and tagline
    // same number of sessions and the same times, new dates
    c.schedule.sessions = (c.schedule.sessions || []).map((x) => ({ startTime: fromIso(x.start).time, endTime: fromIso(x.end).time }));
    (c.pricing.tiers || []).forEach((t) => { if (t.id === 'early') t.until = ''; });
  }
  editing = { mode, id: mode === 'edit' ? src.id : null, instructor: c.instructor, sourceName: src ? (src.content?.en?.name || src.content?.ar?.name) : '' };
  slugTouched = mode === 'edit';
  const tiers = c.pricing.tiers || [];
  const early = tiers.find((t) => t.id === 'early') || {}, reg = tiers.find((t) => t.id === 'regular') || {};
  const sessions = c.schedule.sessions.length ? c.schedule.sessions : [{}];
  const f = $('#course-form');
  f.innerHTML = `
    <div class="page-head">
      <button class="btn sm" type="button" data-back>← All courses</button>
      <h2>${mode === 'edit' ? 'Edit course' : 'New course'}</h2>
    </div>
    ${mode === 'new' && src ? `<p class="note">Filled in from “${esc(editing.sourceName)}”. Add the new dates and web address, then change any text or price that is different. Nothing goes on the website until you click “Apply to website” at the top.</p>` : ''}
    <div class="card">
      <h3>Basics</h3>
      <div class="grid" style="margin-top:10px">
        <div class="f"><label for="c-slug">Web address *</label><input id="c-slug" dir="ltr" value="${esc(c.slug)}" placeholder="e.g. sleep-workshop" autocapitalize="off" spellcheck="false"><small class="help">sherinegendy.com/courses/<b data-slug-preview>${esc(c.slug || '…')}</b>/ · small English letters, numbers and dashes</small></div>
        <div class="f"><label for="c-platform">Where</label><input id="c-platform" value="${esc(c.schedule.platform || 'Zoom')}"></div>
        <div class="f"><label for="c-amin">Child age from (years)</label><input id="c-amin" type="number" min="0" max="18" value="${esc(c.audienceAge?.min ?? '')}"></div>
        <div class="f"><label for="c-amax">Child age to (years)</label><input id="c-amax" type="number" min="0" max="18" value="${esc(c.audienceAge?.max ?? '')}"></div>
        <label class="switch f wide"><input type="checkbox" id="c-limited" ${c.seats?.limited !== false ? 'checked' : ''}> Limited seats (shows the “limited seats” note)</label>
      </div>
    </div>
    <div class="card">
      <h3>Dates *</h3>
      <p class="help">One row per live session, Cairo time.</p>
      <div id="c-sessions">${sessions.map(sessionRow).join('')}</div>
      <button class="btn sm" type="button" data-add-session>+ Add another date</button>
    </div>
    <div class="card">
      <h3>Prices (EGP)</h3>
      <div class="grid" style="margin-top:10px">
        <div class="f"><label for="c-regular">Regular price *</label><input id="c-regular" type="number" min="1" inputmode="numeric" value="${esc(reg.amount ?? '')}"></div>
        <div class="f"><label for="c-early">Early-bird price</label><input id="c-early" type="number" min="0" inputmode="numeric" value="${esc(early.amount ?? '')}"><small class="help">Leave empty for no early-bird price</small></div>
        <div class="f"><label for="c-until">Early-bird ends on (last day)</label><input id="c-until" type="date" value="${esc(fromIso(early.until).date)}"><small class="help"><button class="link" type="button" data-until5>Set to 5 days before the first date</button></small></div>
      </div>
    </div>
    <div class="card" style="padding-bottom:6px">
      <h3>Page text</h3>
      <p class="help">Write the Arabic page first. English fields left empty use the Arabic text.</p>
      <div class="langtabs" role="group" aria-label="Language">
        <button class="tab" type="button" data-langtab="ar" aria-pressed="true">العربي (Arabic)</button>
        <button class="tab" type="button" data-langtab="en" aria-pressed="false">English</button>
      </div>
    </div>
    ${langPane(c, 'ar')}${langPane(c, 'en')}
  `;
  f.hidden = false; $('#courses-list-view').hidden = true;
  addSaveBar(`<button class="btn" type="button" data-cancel>Cancel</button>
    <button class="btn" type="button" data-preview>Preview page ↗</button>
    <button class="btn primary" type="submit" form="course-form">${mode === 'edit' ? 'Save changes' : 'Save new course'}</button>`);
  dirty = false;
  updateCounters(f);
  window.scrollTo(0, 0);
}
function addSaveBar(html) {
  $('#savebar')?.remove();
  const bar = document.createElement('div');
  bar.className = 'savebar'; bar.id = 'savebar';
  bar.innerHTML = `<div class="wrap"><p class="err" id="save-err" role="alert"></p>${html}</div>`;
  document.body.append(bar);
  bar.addEventListener('click', (e) => {
    if (e.target.closest('[data-cancel]')) { if (!dirty || confirm('Discard your changes?')) { dirty = false; view === 'courses' ? (showCourseList(), renderCourseList()) : view === 'media' ? renderMediaForm() : renderSessionForm(); } }
    if (e.target.closest('[data-preview]')) previewCourse();
  });
}
function updateCounters(root) {
  $$('[data-counter]', root).forEach((el) => {
    const n = el.value.length, max = +el.dataset.counter;
    const out = el.parentElement.querySelector('[data-count]');
    if (out) { out.textContent = `${n} / ~${max} characters${n ? '' : ' (empty: uses the course name / tagline)'}`; out.style.color = n > max ? 'var(--red)' : ''; }
  });
}

const cf = $('#course-form');
cf.addEventListener('input', (e) => {
  dirty = true;
  e.target.classList.remove('invalid');
  if (e.target.id === 'c-slug') { slugTouched = true; $('[data-slug-preview]').textContent = e.target.value || '…'; }
  if (!slugTouched && editing?.mode === 'new' && e.target.matches('[data-path="name"][data-lang="en"]')) {
    const s = slugify(e.target.value); $('#c-slug').value = s; $('[data-slug-preview]').textContent = s || '…';
  }
  if (e.target.dataset.counter) updateCounters(cf);
});
cf.addEventListener('click', (e) => {
  const t = e.target;
  if (t.closest('[data-back]')) { if (!dirty || confirm('Discard your changes?')) { dirty = false; showCourseList(); renderCourseList(); } return; }
  if (t.closest('[data-add-session]')) { $('#c-sessions').insertAdjacentHTML('beforeend', sessionRow({})); const rows = $$('[data-session]'); const prev = rows[rows.length - 2]; const last = rows[rows.length - 1]; if (prev) { $('[data-s=start]', last).value = $('[data-s=start]', prev).value; $('[data-s=end]', last).value = $('[data-s=end]', prev).value; } $('[data-s=date]', last).focus(); dirty = true; return; }
  if (t.closest('[data-del-session]')) { if ($$('[data-session]').length > 1) t.closest('[data-session]').remove(); else $$('input', t.closest('[data-session]')).forEach((i) => (i.value = '')); dirty = true; return; }
  if (t.closest('[data-until5]')) {
    const first = $$('[data-s=date]').map((i) => i.value).filter(Boolean).sort()[0];
    if (!first) { toast('Add the first date first'); return; }
    $('#c-until').value = addDays(first, -5); dirty = true; return;
  }
  const lt = t.closest('[data-langtab]');
  if (lt) { $$('[data-langtab]').forEach((b) => b.setAttribute('aria-pressed', String(b === lt))); $$('.langpane').forEach((p) => (p.hidden = p.dataset.lang !== lt.dataset.langtab)); return; }
  if (t.closest('[data-add-item]')) {
    const box = t.closest('.f').querySelector('.items');
    const def = TEXT.flatMap((s) => s.fields).find((x) => x.path === box.dataset.path);
    box.insertAdjacentHTML('beforeend', itemHtml(def, {}, box.dataset.lang === 'ar' ? 'rtl' : 'ltr'));
    box.lastElementChild.querySelector('input,textarea')?.focus(); dirty = true; return;
  }
  const item = t.closest('.item');
  if (item && t.closest('[data-item-del]')) { item.remove(); dirty = true; return; }
  if (item && t.closest('[data-item-up]') && item.previousElementSibling) { item.previousElementSibling.before(item); dirty = true; return; }
  if (item && t.closest('[data-item-down]') && item.nextElementSibling) { item.nextElementSibling.after(item); dirty = true; }
});
cf.addEventListener('submit', (e) => { e.preventDefault(); saveCourse(); });

function slugify(s) { return String(s || '').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 60); }

function readCourse() {
  const c = { content: { ar: {}, en: {} }, seo: { ar: {}, en: {} } };
  c.slug = $('#c-slug').value.trim().toLowerCase();
  c.audienceAge = { min: Number($('#c-amin').value) || 0, max: Number($('#c-amax').value) || 0 };
  c.seats = { limited: $('#c-limited').checked };
  c.schedule = {
    platform: $('#c-platform').value.trim() || 'Zoom',
    sessions: $$('[data-session]').map((r) => {
      const d = $('[data-s=date]', r).value, s = $('[data-s=start]', r).value, en = $('[data-s=end]', r).value;
      return d && s && en ? { start: toIso(d, s), end: toIso(d, en) } : null;
    }).filter(Boolean),
  };
  const tiers = [];
  const early = Number($('#c-early').value), until = $('#c-until').value;
  if (early > 0 && until) tiers.push({ id: 'early', amount: early, until: `${until}T23:59:59${cairoOffset(until)}` });
  tiers.push({ id: 'regular', amount: Number($('#c-regular').value) });
  c.pricing = { tiers };
  if (editing?.instructor) c.instructor = editing.instructor;
  for (const el of $$('[data-path]', cf)) {
    const { path, lang, kind } = el.dataset;
    let v;
    if (kind === 'input' || kind === 'textarea') v = el.value.trim();
    else if (kind === 'lines') v = el.value.split('\n').map((x) => x.trim()).filter(Boolean);
    else if (kind === 'paras') v = el.value.split(/\n\s*\n/).map((x) => x.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean);
    else if (kind === 'list') v = $$('.item', el).map((it) => Object.fromEntries($$('[data-k]', it).map((i) => [i.dataset.k, i.value.trim()]))).filter((o) => Object.entries(o).some(([k, x]) => k !== 'icon' && x));
    if (path.startsWith('seo.')) setPath(c.seo[lang], path.slice(4), v);
    else setPath(c.content[lang], path, v);
  }
  return c;
}
function checkCourse(c) {
  const errs = [];
  const mark = (el) => { el?.classList.add('invalid'); return el; };
  if (!/^[a-z0-9][a-z0-9-]{2,59}$/.test(c.slug)) errs.push([mark($('#c-slug')), 'Web address: 3–60 small English letters, numbers or dashes (e.g. sleep-workshop).']);
  const rows = $$('[data-session]');
  rows.forEach((r) => {
    const d = $('[data-s=date]', r), s = $('[data-s=start]', r), en = $('[data-s=end]', r);
    const any = d.value || s.value || en.value;
    if (any && !d.value) errs.push([mark(d), 'Pick the day for each session.']);
    else if (any && !(s.value && en.value)) errs.push([mark(s.value ? en : s), 'Each session needs a start time and an end time.']);
    else if (any && en.value <= s.value) errs.push([mark(en), 'The end time must be after the start time.']);
  });
  if (!c.schedule.sessions.length && !errs.length) errs.push([mark($('[data-s=date]')), 'Add at least one date.']);
  if (!(Number($('#c-regular').value) > 0)) errs.push([mark($('#c-regular')), 'Add the regular price.']);
  const early = Number($('#c-early').value);
  if (early > 0 && !$('#c-until').value) errs.push([mark($('#c-until')), 'Add the last day of the early-bird price (or clear the early-bird price).']);
  if (early > 0 && early >= Number($('#c-regular').value)) errs.push([mark($('#c-early')), 'The early-bird price should be lower than the regular price.']);
  if (!c.content.ar.name) errs.push([mark($('[data-path="name"][data-lang="ar"]')), 'Add the Arabic course name.']);
  return errs;
}
function showErrors(errs) {
  $('#save-err').textContent = errs.map((x) => x[1]).filter((v, i, a) => a.indexOf(v) === i).join(' ');
  const el = errs[0]?.[0];
  if (el) {
    const pane = el.closest('.langpane');
    if (pane && pane.hidden) $(`[data-langtab="${pane.dataset.lang}"]`).click();
    el.scrollIntoView({ block: 'center', behavior: 'smooth' }); setTimeout(() => el.focus({ preventScroll: true }), 300);
  }
}
async function saveCourse() {
  $$('.invalid', cf).forEach((x) => x.classList.remove('invalid'));
  const c = readCourse();
  const errs = checkCourse(c);
  if (errs.length) return showErrors(errs);
  $('#save-err').textContent = '';
  const btn = $('#savebar [type=submit]'); btn.disabled = true;
  try {
    const res = editing.mode === 'edit'
      ? await api('/api/admin/courses/' + encodeURIComponent(editing.id), { method: 'PUT', body: JSON.stringify({ course: c }) })
      : await api('/api/admin/courses', { method: 'POST', body: JSON.stringify({ course: c }) });
    const b = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = { slug: 'Web address is not valid.', slug_taken: 'Another course already uses this web address. Choose a different one.', sessions: 'Check the dates.', price: 'Add the regular price.', name_ar: 'Add the Arabic course name.' };
      showErrors((b.fields || ['x']).map((k) => [k.startsWith('slug') ? mark1('#c-slug') : null, msg[k] || 'Could not save. Check the fields and try again.']));
      return;
    }
    dirty = false;
    toast(editing.mode === 'edit' ? 'Saved. Click “Apply to website” to put it live.' : 'New course saved. Click “Apply to website” to put it live.', 4500);
    await loadCourses();
    showCourseList(); renderCourseList();
  } catch { /* shown by api() */ } finally { btn.disabled = false; }
}
const mark1 = (s) => { const el = $(s); el?.classList.add('invalid'); return el; };

async function previewCourse() {
  const c = readCourse();
  const errs = checkCourse(c).filter(([el]) => el?.id !== 'c-slug');
  $$('#c-slug.invalid').forEach((x) => x.classList.remove('invalid'));
  if (errs.length) return showErrors(errs);
  $('#save-err').textContent = '';
  const lang = $('[data-langtab][aria-pressed=true]')?.dataset.langtab || 'ar';
  const w = window.open('', '_blank');
  try {
    const res = await api('/api/admin/preview', { method: 'POST', body: JSON.stringify({ course: c, id: editing.id, lang }) });
    const b = await res.json();
    if (!res.ok || !b.html) { w?.close(); return toast('Preview failed. Check the fields.'); }
    const banner = '<div style="position:fixed;z-index:9999;inset-inline:0;bottom:0;background:#1F2D35;color:#fff;text-align:center;padding:8px;font:600 14px sans-serif">Preview — not saved yet</div>';
    const html = b.html.replace(/<head>/i, `<head><base href="${location.origin}${b.path}">`).replace(/<\/body>/i, banner + '</body>');
    if (w) { w.document.open(); w.document.write(html); w.document.close(); } else toast('Allow pop-ups to see the preview');
  } catch { w?.close(); }
}

/* =================================================================
   1-TO-1 SETTINGS
   ================================================================= */
const DAYS = [['sat', 'Saturday'], ['sun', 'Sunday'], ['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'], ['fri', 'Friday']];
const timeChip = (v = '') => `<span class="t"><input type="time" step="900" value="${esc(v)}" aria-label="Start time"><button class="icon-btn" type="button" data-del-time aria-label="Remove time">✕</button></span>`;
const dateChip = (v = '') => `<span class="t"><input type="date" value="${esc(v)}" aria-label="Date"><button class="icon-btn" type="button" data-del-time aria-label="Remove date">✕</button></span>`;
const extraRow = (date = '', time = '') => `<div class="row" data-extra style="grid-template-columns:1fr 1fr auto"><div class="f"><span class="lbl">Date</span><input type="date" data-x="date" value="${esc(date)}"></div><div class="f"><span class="lbl">Start time (Cairo)</span><input type="time" data-x="time" value="${esc(time)}"></div><button class="icon-btn" type="button" data-del-extra aria-label="Remove" style="margin-bottom:4px">✕</button></div>`;

function renderSessionForm() {
  const s = store.session; const f = $('#session-form');
  if (!s) { f.innerHTML = '<p class="empty card">1-to-1 settings are not available.</p>'; return; }
  const r = s.price.discountRules || {};
  const extras = (s.extraSlots || []).flatMap((x) => x.times.map((t) => [x.date, t]));
  const textPane = (lang) => {
    const c = s.content[lang] || {}; const dir = lang === 'ar' ? 'rtl' : 'ltr';
    return `<div class="langpane" data-lang="${lang}" ${lang === 'ar' ? '' : 'hidden'}><div class="grid">
      <div class="f wide"><label>Small line above the title</label><input dir="${dir}" data-st="${lang}.kicker" value="${esc(c.kicker)}"></div>
      <div class="f wide"><label>Title</label><input dir="${dir}" data-st="${lang}.title" value="${esc(c.title)}"></div>
      <div class="f wide"><label>Intro</label><textarea dir="${dir}" rows="3" data-st="${lang}.intro">${esc(c.intro)}</textarea></div>
      <div class="f wide"><label>Points with ticks (one per line)</label><textarea dir="${dir}" rows="5" data-st="${lang}.points">${esc((c.points || []).join('\n'))}</textarea>
      <small class="help">If you change the price, discount or hours above, update these lines too.</small></div>
    </div></div>`;
  };
  f.innerHTML = `
    <div class="card"><h3>Price</h3>
      <div class="grid" style="margin-top:10px">
        <div class="f"><label for="s-price">Session price (EGP)</label><input id="s-price" type="number" min="1" value="${esc(s.price.amount)}"></div>
        <div class="f"><label for="s-duration">Session length (minutes)</label><input id="s-duration" type="number" min="15" max="240" step="5" value="${esc(s.durationMinutes)}"></div>
      </div></div>
    <div class="card"><h3>Discount for workshop attendees</h3>
      <p class="help">Checked by WhatsApp number against <b>paid</b> workshop bookings. Set to 0 to turn the discount off.</p>
      <div class="grid">
        <div class="f"><label for="s-pct">Discount (%)</label><input id="s-pct" type="number" min="0" max="100" value="${esc(s.price.workshopDiscountPercent)}"></div>
        <div class="f"><label for="s-course">For people who attended</label><select id="s-course">${(store.courses || []).map((c) => `<option value="${esc(c.slug)}"${c.slug === r.workshopCourse ? ' selected' : ''}>${esc(c.content?.en?.name || c.content?.ar?.name)} (${esc(fromIso(c.schedule?.sessions?.[0]?.start).date)})</option>`).join('')}</select></div>
        <div class="f"><label for="s-days">Valid for (days after the workshop)</label><input id="s-days" type="number" min="0" max="365" value="${esc(r.validDaysAfterWorkshop ?? 30)}"></div>
        <label class="switch f" style="align-self:end;min-height:42px"><input type="checkbox" id="s-first" ${r.firstSessionOnly !== false ? 'checked' : ''}> First session only</label>
      </div></div>
    <div class="card"><h3>Weekly available times (Cairo time)</h3>
      <p class="help">Start time of each session. Times already booked disappear from the calendar automatically.</p>
      <div class="days">${DAYS.map(([k, name]) => `<div class="day" data-day="${k}"><b>${name}</b><div class="times">${(s.weekly?.[k] || []).map((t) => timeChip(t)).join('')}<button class="btn sm" type="button" data-add-time>+ time</button></div></div>`).join('')}</div>
    </div>
    <div class="card"><h3>Days off</h3>
      <p class="help">No sessions on these dates (holidays, workshop days…).</p>
      <div class="times" id="s-blocked">${(s.blockedDates || []).map((d) => dateChip(d)).join('')}<button class="btn sm" type="button" data-add-date>+ day off</button></div>
    </div>
    <div class="card"><h3>Extra one-off times</h3>
      <p class="help">A time outside the weekly hours, on a specific date.</p>
      <div id="s-extra">${extras.map(([d, t]) => extraRow(d, t)).join('')}</div>
      <button class="btn sm" type="button" data-add-extra>+ Add extra time</button>
    </div>
    <div class="card"><h3>Booking window</h3>
      <div class="grid" style="margin-top:10px">
        <div class="f"><label for="s-ahead">Show times up to (days ahead)</label><input id="s-ahead" type="number" min="1" max="180" value="${esc(s.booking?.daysAhead ?? 45)}"></div>
        <div class="f"><label for="s-notice">Minimum notice (hours)</label><input id="s-notice" type="number" min="0" max="336" value="${esc(s.booking?.minNoticeHours ?? 24)}"></div>
      </div></div>
    <div class="card"><h3>Page text</h3>
      <div class="langtabs" role="group" aria-label="Language">
        <button class="tab" type="button" data-langtab="ar" aria-pressed="true">العربي (Arabic)</button>
        <button class="tab" type="button" data-langtab="en" aria-pressed="false">English</button>
      </div>
      ${textPane('ar')}${textPane('en')}
    </div>`;
  addSaveBar(`<button class="btn" type="button" data-cancel>Undo changes</button><a class="btn" href="/book-session/" target="_blank" rel="noopener">View page ↗</a><button class="btn primary" type="submit" form="session-form">Save</button>`);
  dirty = false;
}
const sf = $('#session-form');
sf.addEventListener('input', (e) => { dirty = true; e.target.classList.remove('invalid'); });
sf.addEventListener('click', (e) => {
  const t = e.target;
  if (t.closest('[data-add-time]')) { const b = t.closest('[data-add-time]'); const prev = b.parentElement.querySelectorAll('input'); const last = prev[prev.length - 1]?.value; b.insertAdjacentHTML('beforebegin', timeChip(last ? nextHour(last) : '17:00')); dirty = true; return; }
  if (t.closest('[data-add-date]')) { const b = t.closest('[data-add-date]'); b.insertAdjacentHTML('beforebegin', dateChip('')); b.previousElementSibling.querySelector('input').focus(); dirty = true; return; }
  if (t.closest('[data-del-time]')) { t.closest('.t').remove(); dirty = true; return; }
  if (t.closest('[data-add-extra]')) { $('#s-extra').insertAdjacentHTML('beforeend', extraRow()); dirty = true; return; }
  if (t.closest('[data-del-extra]')) { t.closest('[data-extra]').remove(); dirty = true; return; }
  const lt = t.closest('[data-langtab]');
  if (lt) { $$('[data-langtab]', sf).forEach((b) => b.setAttribute('aria-pressed', String(b === lt))); $$('.langpane', sf).forEach((p) => (p.hidden = p.dataset.lang !== lt.dataset.langtab)); }
});
const nextHour = (t) => { const [h, m] = t.split(':').map(Number); return `${String(Math.min(23, h + 1)).padStart(2, '0')}:${String(m).padStart(2, '0')}`; };
sf.addEventListener('submit', async (e) => {
  e.preventDefault();
  const errs = [];
  const num = (id, ok, msg) => { const el = $(id); const v = Number(el.value); if (el.value === '' || !ok(v)) { el.classList.add('invalid'); errs.push([el, msg]); } return v; };
  const amount = num('#s-price', (v) => v > 0, 'Add the session price.');
  const duration = num('#s-duration', (v) => v >= 15 && v <= 240, 'Session length must be 15–240 minutes.');
  const pct = num('#s-pct', (v) => v >= 0 && v <= 100, 'Discount must be 0–100%.');
  const days = num('#s-days', (v) => v >= 0, 'Check the discount days.');
  const weekly = Object.fromEntries($$('[data-day]').map((d) => [d.dataset.day, $$('input', d).map((i) => i.value).filter(Boolean)]));
  const blockedDates = $$('#s-blocked input').map((i) => i.value).filter(Boolean);
  const ex = {};
  for (const r of $$('[data-extra]')) { const d = $('[data-x=date]', r).value, t = $('[data-x=time]', r).value; if (d && t) (ex[d] ||= []).push(t); else if (d || t) { const el = $(d ? '[data-x=time]' : '[data-x=date]', r); el.classList.add('invalid'); errs.push([el, 'Each extra time needs a date and a time.']); } }
  if (errs.length) return showErrors(errs);
  const st = (k) => $(`[data-st="${k}"]`).value.trim();
  const body = {
    durationMinutes: duration,
    price: { amount, workshopDiscountPercent: pct, discountRules: { validDaysAfterWorkshop: days, firstSessionOnly: $('#s-first').checked, workshopCourse: $('#s-course').value } },
    booking: { daysAhead: Number($('#s-ahead').value) || 45, minNoticeHours: Number($('#s-notice').value) || 0 },
    weekly, blockedDates, extraSlots: Object.entries(ex).map(([date, times]) => ({ date, times })),
    content: Object.fromEntries(['ar', 'en'].map((l) => [l, { kicker: st(l + '.kicker'), title: st(l + '.title'), intro: st(l + '.intro'), points: st(l + '.points').split('\n').map((x) => x.trim()).filter(Boolean) }])),
  };
  $('#save-err').textContent = '';
  const btn = $('#savebar [type=submit]'); btn.disabled = true;
  try {
    const res = await api('/api/admin/settings/session', { method: 'PUT', body: JSON.stringify(body) });
    const b = await res.json().catch(() => ({}));
    if (!res.ok) { $('#save-err').textContent = 'Could not save: check ' + (b.fields || []).join(', '); return; }
    store.session = b.session; dirty = false;
    toast('Saved. Click “Apply to website” to put it live.', 3500);
    loadCourses();
    renderSessionForm();
  } catch { /* */ } finally { btn.disabled = false; }
});


/* =================================================================
   PHOTOS & VIDEOS (coach profile photo, videos, photo album)
   ================================================================= */
let md = null; // the form's working copy of store.coach
const mf = $('#media-form');

/* ---------- image resizing in the browser, then upload ---------- */
async function decode(file) {
  try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* try the slower way */ }
  return new Promise((res, rej) => {
    const u = URL.createObjectURL(file); const im = new Image();
    im.onload = () => { res(im); setTimeout(() => URL.revokeObjectURL(u), 0); };
    im.onerror = () => { URL.revokeObjectURL(u); rej(new Error('decode')); };
    im.src = u;
  });
}
function draw(img, w, h, crop) { // crop: { sx, sy, sw, sh }
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
  const { sx = 0, sy = 0, sw = img.width, sh = img.height } = crop || {};
  g.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
  return new Promise((res) => c.toBlob((b) => {
    if (b && b.type === 'image/webp') return res(b);
    c.toBlob((j) => res(j), 'image/jpeg', 0.86); // browsers that can't make WebP
  }, 'image/webp', 0.84));
}
async function upload(blob) {
  const res = await fetch('/api/admin/media', { method: 'POST', body: blob, headers: { authorization: 'Bearer ' + pw, 'content-type': blob.type } });
  if (res.status === 401) { showLogin('Wrong password.'); throw new Error('401'); }
  if (res.status === 413) throw new Error('too_big');
  if (!res.ok) throw new Error('upload');
  return (await res.json()).url;
}
const fit = (w, h, max) => { const k = Math.min(1, max / Math.max(w, h)); return [Math.round(w * k), Math.round(h * k)]; };
async function makeAlbumPhoto(file) {
  const img = await decode(file);
  const [w, h] = fit(img.width, img.height, 1600);
  const [tw, th] = img.width >= img.height ? fit(img.width, img.height, 720) : fit(img.width, img.height, 900);
  const [src, thumb] = await Promise.all([draw(img, w, h).then(upload), draw(img, tw, th).then(upload)]);
  return { src, thumb, w, h, tw, th, caption: { ar: '', en: '' }, alt: { ar: '', en: '' } };
}
async function makeProfilePhoto(file) {
  const img = await decode(file);
  const side = Math.min(img.width, img.height);
  // square from the middle (a little above centre, where faces usually are)
  const crop = { sx: (img.width - side) / 2, sy: Math.max(0, (img.height - side) * 0.3), sw: side, sh: side };
  const [src, small] = await Promise.all([draw(img, 560, 560, crop).then(upload), draw(img, 320, 320, crop).then(upload)]);
  return { src, small };
}
const photoError = (e) => toast(e.message === 'too_big' ? 'That photo is too large. Try a smaller one.'
  : e.message === 'decode' ? 'This photo type can’t be opened here. Use JPG or PNG (on iPhone: Settings → Camera → Formats → Most Compatible).'
    : e.message === '401' ? 'Signed out' : 'Upload failed. Check the connection and try again.', 6000);

/* ---------- form ---------- */
function renderMediaForm(reset = true) {
  if (reset || !md) md = clone(store.coach) || { photo: null, videos: [], album: [] };
  md.videos ||= []; md.album ||= [];
  const ph = md.photo;
  mf.innerHTML = `
    <p class="help" style="margin:0">Changes here are saved as a draft. Click <b>Apply to website</b> at the top to put them live.</p>
    <div class="card"><h3>Profile photo</h3>
      <p class="help">Shown in the coach section and on the 1-to-1 page. Any photo works: it is cropped to a circle and resized automatically.</p>
      <div class="pp">
        ${ph ? `<img src="${esc(ph.src)}" alt="Current profile photo">` : '<span class="pp-empty">No photo</span>'}
        <div class="pp-actions">
          <label class="btn sm primary" for="pp-file" style="display:inline-grid;place-items:center">${ph ? 'Change photo' : 'Upload photo'}</label>
          <input type="file" id="pp-file" accept="image/*" hidden>
          ${ph ? '<button class="btn sm danger" type="button" data-pp-remove>Remove</button>' : ''}
        </div>
      </div>
    </div>
    <div class="card"><h3>Videos</h3>
      <p class="help">Paste a link to an Instagram reel or post, a YouTube video or Short, a TikTok or a Facebook video. The videos play on the page without leaving the site. The first video is shown first.</p>
      <div class="vlist" id="vlist">${md.videos.map(videoRow).join('') || '<p class="help" data-none>No videos. The video area is hidden on the website.</p>'}</div>
      <p style="margin:10px 0 0"><button class="btn sm" type="button" data-add-video>+ Add video</button></p>
    </div>
    <div class="card"><h3>Photo album</h3>
      <p class="help">The first photo is shown big. Use the arrows to change the order. Captions are optional.</p>
      <div class="alist" id="alist">${md.album.map(albumItem).join('')}</div>
      <label class="drop" id="drop" for="album-file">
        <b>+ Add photos</b><br>Click to choose (you can pick several), or drag photos here
      </label>
      <input type="file" id="album-file" accept="image/*" multiple hidden>
    </div>`;
  addSaveBar(`<button class="btn" type="button" data-cancel>Undo changes</button><a class="btn" href="/#watch" target="_blank" rel="noopener">View website ↗</a><button class="btn primary" type="submit" form="media-form">Save</button>`);
  dirty = false;
}
function videoRow(v, i) {
  const p = parseVideo(v.url);
  const name = p ? ({ instagram: 'Instagram', youtube: 'YouTube', tiktok: 'TikTok', facebook: 'Facebook' })[p.provider] : '';
  return `<div class="vrow" data-vi="${i}">
    <div class="vprev${p && !p.vertical ? ' wide' : ''}">${p ? `<iframe src="${esc(p.embed)}" loading="lazy" title="Preview" allow="encrypted-media; picture-in-picture" scrolling="no"></iframe>` : (v.url ? 'Link not recognised' : 'Paste a link')}</div>
    <div class="vfields">
      <div class="item-head"><span class="lbl">Video ${i + 1}${name ? ` · ${name}` : ''}</span>
        <button class="icon-btn" type="button" data-vmove="-1" aria-label="Move up">↑</button><button class="icon-btn" type="button" data-vmove="1" aria-label="Move down">↓</button><button class="icon-btn" type="button" data-vdel aria-label="Remove video">✕</button></div>
      <label class="f"><span class="lbl">Video link</span><input data-vk="url" dir="ltr" value="${esc(v.url)}" placeholder="https://www.instagram.com/reel/…" inputmode="url"></label>
      <label class="f"><span class="lbl">Caption (Arabic, optional)</span><input data-vk="ar" dir="rtl" value="${esc(v.caption?.ar)}"></label>
      <label class="f"><span class="lbl">Caption (English, optional)</span><input data-vk="en" dir="ltr" value="${esc(v.caption?.en)}"></label>
    </div>
  </div>`;
}
function albumItem(a, i) {
  return `<div class="aitem" data-ai="${i}">
    <div class="item-head"><span class="lbl">${i === 0 ? 'Photo 1 (big)' : `Photo ${i + 1}`}</span>
      <button class="icon-btn" type="button" data-amove="-1" aria-label="Move earlier">↑</button><button class="icon-btn" type="button" data-amove="1" aria-label="Move later">↓</button><button class="icon-btn" type="button" data-adel aria-label="Delete photo">✕</button></div>
    <img src="${esc(a.thumb || a.src)}" alt="" loading="lazy" style="margin-top:8px">
    <div class="afields">
      <label class="f"><span class="lbl">Caption (Arabic)</span><input data-ak="ar" dir="rtl" value="${esc(a.caption?.ar)}"></label>
      <label class="f"><span class="lbl">Caption (English)</span><input data-ak="en" dir="ltr" value="${esc(a.caption?.en)}"></label>
    </div>
  </div>`;
}
const redrawVideos = () => { $('#vlist').innerHTML = md.videos.map(videoRow).join('') || '<p class="help" data-none>No videos. The video area is hidden on the website.</p>'; };
const redrawAlbum = () => { $('#alist').innerHTML = md.album.map(albumItem).join(''); };
const move = (arr, i, d) => { const j = i + d; if (j < 0 || j >= arr.length) return false; [arr[i], arr[j]] = [arr[j], arr[i]]; return true; };

let vT;
mf.addEventListener('input', (e) => {
  dirty = true;
  const vr = e.target.closest('[data-vi]');
  if (vr && e.target.dataset.vk) {
    const v = md.videos[+vr.dataset.vi]; const k = e.target.dataset.vk;
    if (k === 'url') {
      v.url = e.target.value.trim();
      e.target.classList.toggle('invalid', !!v.url && !parseVideo(v.url));
      clearTimeout(vT); vT = setTimeout(() => { // refresh the preview only
        const p = parseVideo(v.url); const box = vr.querySelector('.vprev');
        box.className = 'vprev' + (p && !p.vertical ? ' wide' : '');
        box.innerHTML = p ? `<iframe src="${esc(p.embed)}" loading="lazy" title="Preview" allow="encrypted-media; picture-in-picture" scrolling="no"></iframe>` : (v.url ? 'Link not recognised' : 'Paste a link');
      }, 600);
    } else { v.caption = { ...(v.caption || {}), [k]: e.target.value }; }
  }
  const ar = e.target.closest('[data-ai]');
  if (ar && e.target.dataset.ak) { const a = md.album[+ar.dataset.ai]; a.caption = { ...(a.caption || {}), [e.target.dataset.ak]: e.target.value }; }
});
mf.addEventListener('click', (e) => {
  const t = e.target;
  if (t.closest('[data-pp-remove]')) { if (confirm('Remove the profile photo? Her initial will be shown instead.')) { md.photo = null; dirty = true; refreshPhoto(); } return; }
  if (t.closest('[data-add-video]')) { md.videos.push({ url: '', caption: { ar: '', en: '' } }); redrawVideos(); $$('#vlist [data-vk=url]').pop()?.focus(); dirty = true; return; }
  const vr = t.closest('[data-vi]');
  if (vr && t.closest('[data-vdel]')) { md.videos.splice(+vr.dataset.vi, 1); redrawVideos(); dirty = true; return; }
  if (vr && t.closest('[data-vmove]')) { if (move(md.videos, +vr.dataset.vi, +t.closest('[data-vmove]').dataset.vmove)) { redrawVideos(); dirty = true; } return; }
  const ai = t.closest('[data-ai]');
  if (ai && t.closest('[data-adel]')) { if (confirm('Delete this photo from the album?')) { md.album.splice(+ai.dataset.ai, 1); redrawAlbum(); dirty = true; } return; }
  if (ai && t.closest('[data-amove]')) { if (move(md.album, +ai.dataset.ai, +t.closest('[data-amove]').dataset.amove)) { redrawAlbum(); dirty = true; } }
});
function refreshPhoto() { renderMediaForm(false); dirty = true; } // redraw with the new photo, keep other edits
mf.addEventListener('change', async (e) => {
  if (e.target.id === 'pp-file' && e.target.files[0]) {
    const box = $('.pp', mf); box.classList.add('uploading'); toast('Uploading photo…', 20000);
    try { md.photo = await makeProfilePhoto(e.target.files[0]); toast('Photo ready. Click Save, then Apply to website.', 4000); refreshPhoto(); }
    catch (err) { photoError(err); box.classList.remove('uploading'); }
    e.target.value = '';
  }
  if (e.target.id === 'album-file' && e.target.files.length) { await addAlbumFiles([...e.target.files]); e.target.value = ''; }
});
async function addAlbumFiles(files) {
  files = files.filter((f) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name));
  if (!files.length) return;
  const drop = $('#drop'); drop.classList.add('uploading');
  let done = 0, failed = null;
  for (const f of files) {
    drop.innerHTML = `Uploading ${done + 1} of ${files.length}…`;
    try { md.album.push(await makeAlbumPhoto(f)); done++; redrawAlbum(); dirty = true; } catch (err) { failed = err; }
  }
  drop.classList.remove('uploading');
  drop.innerHTML = '<b>+ Add photos</b><br>Click to choose (you can pick several), or drag photos here';
  if (failed) photoError(failed); else toast(`${done} photo${done > 1 ? 's' : ''} added. Click Save, then Apply to website.`, 4000);
}
mf.addEventListener('dragover', (e) => { const d = e.target.closest('#drop'); if (d) { e.preventDefault(); d.classList.add('over'); } });
mf.addEventListener('dragleave', (e) => { e.target.closest('#drop')?.classList.remove('over'); });
mf.addEventListener('drop', (e) => { const d = e.target.closest('#drop'); if (!d) return; e.preventDefault(); d.classList.remove('over'); addAlbumFiles([...e.dataTransfer.files]); });

mf.addEventListener('submit', async (e) => {
  e.preventDefault();
  md.videos = md.videos.filter((v) => v.url);
  const bad = md.videos.findIndex((v) => !parseVideo(v.url));
  if (bad >= 0) {
    redrawVideos();
    const el = $$('#vlist [data-vk=url]')[bad]; el.classList.add('invalid'); el.scrollIntoView({ block: 'center' }); el.focus();
    $('#save-err').textContent = `Video ${bad + 1}: the link isn't an Instagram, YouTube, TikTok or Facebook video link.`;
    return;
  }
  $('#save-err').textContent = '';
  const btn = $('#savebar [type=submit]'); btn.disabled = true;
  try {
    const res = await api('/api/admin/settings/coach', { method: 'PUT', body: JSON.stringify(md) });
    const b = await res.json().catch(() => ({}));
    if (!res.ok) { $('#save-err').textContent = 'Could not save: check ' + (b.fields || []).join(', '); return; }
    store.coach = b.coach; dirty = false;
    toast('Saved. Click “Apply to website” to put it live.', 3500);
    await loadCourses(); renderMediaForm();
  } catch { /* */ } finally { btn.disabled = false; }
});

pw ? start() : showLogin();
