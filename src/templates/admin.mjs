// Admin dashboard (/admin/): view and manage bookings saved by worker/index.js.
// The page itself holds no data; everything loads from /api/admin/* with the admin password.
export function adminPage({ site }) {
  return `<!doctype html>
<html lang="en" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<title>Bookings admin | ${site.brand}</title>
<link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap">
<style>
:root{--paper:#F1F5EE;--surface:#fff;--ink:#1F2D35;--soft:#54656C;--line:#D5DFD3;--calm:#1D6F66;--mint:#DDEBE2;--sun:#FFC94A;--sun-soft:#FFF0C4;--red:#D33A2F;color-scheme:light only}
*{box-sizing:border-box}html{background:var(--paper)}
body{margin:0;font:15px/1.5 "IBM Plex Sans Arabic","Segoe UI",Tahoma,sans-serif;color:var(--ink);background:var(--paper)}
[hidden]{display:none!important}
.wrap{max-width:1280px;margin:0 auto;padding-inline:16px}
header{background:var(--surface);border-bottom:1px solid var(--line);position:sticky;top:0;z-index:5}
.bar{display:flex;align-items:center;gap:12px;min-height:60px;flex-wrap:wrap}
.bar h1{font-size:18px;margin:0;margin-inline-end:auto}.bar h1 b{color:var(--calm)}
button,select,input,textarea{font:inherit;color:inherit}
.btn{min-height:40px;padding:6px 14px;border-radius:999px;border:2px solid var(--line);background:var(--surface);cursor:pointer;font-weight:600}
.btn.primary{background:var(--calm);border-color:var(--calm);color:#fff}
.btn:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:3px solid var(--sun);outline-offset:2px}
.login{max-width:380px;margin:12vh auto;background:var(--surface);border:1px solid var(--line);border-radius:20px;padding:28px;display:grid;gap:14px}
.login h1{margin:0;font-size:22px}
label{font-weight:600;font-size:13px;color:var(--soft)}
input[type=password],input[type=search],select,textarea{width:100%;min-height:42px;padding:8px 12px;border-radius:10px;border:2px solid var(--line);background:var(--paper)}
.err{color:var(--red);font-weight:600;margin:0}
.tabs{display:flex;gap:6px;flex-wrap:wrap;padding-block:14px}
.tab{min-height:38px;padding:4px 14px;border-radius:999px;border:0;background:var(--mint);cursor:pointer;font-weight:600}
.tab[aria-pressed=true]{background:var(--calm);color:#fff}
.tools{display:grid;grid-template-columns:1fr 180px auto auto;gap:8px;align-items:center;padding-bottom:14px}
@media(max-width:720px){.tools{grid-template-columns:1fr 1fr}}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:16px}
.tile{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:12px 14px}
.tile small{display:block;color:var(--soft);font-weight:600}.tile b{font-size:22px;font-variant-numeric:tabular-nums}
.table-wrap{background:var(--surface);border:1px solid var(--line);border-radius:16px;overflow-x:auto}
table{border-collapse:collapse;width:100%;min-width:980px}
th,td{padding:10px 12px;text-align:left;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:12px;color:var(--soft);font-weight:700;background:#F7FAF5;position:sticky;top:0}
td.num{font-variant-numeric:tabular-nums;white-space:nowrap}
.ar{direction:rtl;text-align:right;unicode-bidi:plaintext}
.pill{display:inline-block;padding:1px 8px;border-radius:6px;font-size:12px;font-weight:700}
.pill.disc{background:var(--sun-soft)}.pill.nodisc{background:#F3E2E0;color:var(--red)}
select.status{min-height:34px;padding:4px 8px;width:auto;font-weight:700}
select.status.paid{background:var(--mint);border-color:var(--calm);color:var(--calm)}
select.status.cancelled{background:#F3E2E0;border-color:#E9B7B2;color:var(--red)}
select.status.pending{background:var(--sun-soft);border-color:#F1D27A}
.more{border:0;background:none;color:var(--calm);font-weight:700;cursor:pointer;padding:0}
tr.detail td{background:#FAFCF8}
.detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
@media(max-width:720px){.detail-grid{grid-template-columns:1fr}}
.detail-grid p{margin:0;white-space:pre-wrap}
.empty{padding:40px;text-align:center;color:var(--soft)}
.toast{position:fixed;bottom:16px;left:50%;transform:translateX(-50%);background:var(--ink);color:#fff;padding:10px 16px;border-radius:12px;font-weight:600}
a{color:var(--calm)}
</style>
</head>
<body>
<main id="login" class="wrap" hidden>
  <form class="login" id="login-form">
    <h1>Bookings admin</h1>
    <p style="margin:0;color:var(--soft)">${site.brand}</p>
    <div><label for="pw">Admin password</label><input id="pw" type="password" autocomplete="current-password" required></div>
    <p class="err" id="login-err" hidden></p>
    <button class="btn primary" type="submit">Sign in</button>
  </form>
</main>

<div id="app" hidden>
  <header><div class="wrap bar">
    <h1>Real Life <b>Parents</b> · Bookings</h1>
    <button class="btn" id="refresh" type="button">Refresh</button>
    <button class="btn" id="export" type="button">Export CSV</button>
    <button class="btn" id="logout" type="button">Sign out</button>
  </div></header>
  <div class="wrap">
    <div class="tabs" role="group" aria-label="Booking type">
      <button class="tab" data-type="workshop" aria-pressed="true">Workshop registrations</button>
      <button class="tab" data-type="session" aria-pressed="false">1-to-1 sessions</button>
      <button class="tab" data-type="" aria-pressed="false">All</button>
    </div>
    <div class="tools">
      <input type="search" id="q" placeholder="Search name, phone, email or booking ref" aria-label="Search">
      <select id="status" aria-label="Status"><option value="">All statuses</option><option value="pending">Pending payment</option><option value="paid">Paid</option><option value="cancelled">Cancelled</option></select>
    </div>
    <div class="tiles" id="tiles"></div>
    <div class="table-wrap"><table>
      <thead><tr><th>Date</th><th>Ref</th><th>Name</th><th>WhatsApp</th><th>Child age</th><th id="th-slot">Session time (Cairo)</th><th>Amount</th><th>Paid via</th><th>Status</th><th></th></tr></thead>
      <tbody id="rows"></tbody>
    </table><p class="empty" id="empty" hidden>No bookings yet.</p></div>
    <p style="color:var(--soft);font-size:13px;margin:14px 0 40px">Set a workshop booking to <b>Paid</b> after you see the transfer. Only paid workshop bookings unlock the 30% discount on a 1-to-1 session. Unpaid 1-to-1 bookings are cancelled automatically after 24 hours so the time becomes free again.</p>
  </div>
</div>
<div class="toast" id="toast" role="status" hidden></div>

<script>
(() => {
  const KEY = 'rlp.admin';
  let pw = ''; try { pw = sessionStorage.getItem(KEY) || ''; } catch {}
  let type = 'workshop', rows = [], timer;
  const $ = (s) => document.querySelector(s);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = (t) => { const n = $('#toast'); n.textContent = t; n.hidden = false; clearTimeout(timer); timer = setTimeout(() => (n.hidden = true), 2200); };
  const fmtDate = (iso) => iso ? new Date(iso).toLocaleString('en-GB', { timeZone: 'Africa/Cairo', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  const fmtSlot = (s) => s ? new Date(s + ':00Z').toLocaleString('en-GB', { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  const api = async (path, opts = {}) => {
    const res = await fetch(path, { ...opts, headers: { ...(opts.headers || {}), authorization: 'Bearer ' + pw, 'content-type': 'application/json' } });
    if (res.status === 401) { showLogin('Wrong password.'); throw new Error('401'); }
    if (res.status === 503) { const b = await res.json().catch(() => ({})); showLogin(b.error === 'admin_not_configured' ? 'Admin password is not set in Cloudflare yet (ADMIN_PASSWORD).' : 'The database is not connected yet (see setup steps).'); throw new Error('503'); }
    return res;
  };
  function showLogin(msg) { $('#app').hidden = true; $('#login').hidden = false; $('#login-err').hidden = !msg; $('#login-err').textContent = msg || ''; $('#pw').focus(); }
  $('#login-form').addEventListener('submit', async (e) => { e.preventDefault(); pw = $('#pw').value; try { sessionStorage.setItem(KEY, pw); } catch {} await load(); });
  $('#logout').addEventListener('click', () => { pw = ''; try { sessionStorage.removeItem(KEY); } catch {} showLogin(); });
  $('#refresh').addEventListener('click', load);
  document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => { type = b.dataset.type; document.querySelectorAll('.tab').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); load(); }));
  $('#status').addEventListener('change', load);
  let qT; $('#q').addEventListener('input', () => { clearTimeout(qT); qT = setTimeout(load, 300); });
  const params = () => new URLSearchParams({ ...(type ? { type } : {}), ...($('#status').value ? { status: $('#status').value } : {}), ...($('#q').value.trim() ? { q: $('#q').value.trim() } : {}) });

  async function load() {
    if (!pw) return showLogin();
    let data;
    try { data = await (await api('/api/admin/orders?' + params())).json(); } catch { return; }
    $('#login').hidden = true; $('#app').hidden = false;
    rows = data.orders || [];
    renderTiles(data.totals || []);
    render();
  }
  function renderTiles(totals) {
    const t = (ty, st) => totals.filter((r) => (!ty || r.type === ty) && (!st || r.status === st));
    const n = (a) => a.reduce((s, r) => s + r.n, 0), sum = (a) => a.reduce((s, r) => s + (r.total || 0), 0);
    const ty = type || null;
    $('#tiles').innerHTML = [
      ['Pending payment', n(t(ty, 'pending'))], ['Paid', n(t(ty, 'paid'))], ['Cancelled', n(t(ty, 'cancelled'))],
      ['Paid revenue (EGP)', sum(t(ty, 'paid')).toLocaleString('en')],
    ].map(([l, v]) => '<div class="tile"><small>' + l + '</small><b>' + v + '</b></div>').join('');
  }
  function render() {
    $('#th-slot').hidden = type === 'workshop';
    $('#empty').hidden = rows.length > 0;
    $('#rows').innerHTML = rows.map((r, i) => {
      const wa = r.phone ? 'https://wa.me/' + r.phone.replace(/\\D/g, '') : '';
      const disc = r.discount_requested ? (r.discount_applied ? '<span class="pill disc">−30% workshop</span>' : '<span class="pill nodisc" title="' + esc(r.discount_note) + '">discount refused</span>') : '';
      return '<tr>' +
        '<td class="num">' + fmtDate(r.created_at) + '</td>' +
        '<td class="num"><b>' + esc(r.ref) + '</b><br><small>' + esc(r.type === 'session' ? '1-to-1' : 'Workshop') + '</small></td>' +
        '<td class="ar">' + esc(r.name) + (r.email ? '<br><small dir="ltr">' + esc(r.email) + '</small>' : '') + '</td>' +
        '<td class="num"><a href="' + wa + '" target="_blank" rel="noopener">' + esc(r.phone) + '</a><br><small>' + esc(r.country) + '</small></td>' +
        '<td class="ar">' + esc(r.child_age) + '</td>' +
        (type === 'workshop' ? '' : '<td class="num">' + esc(fmtSlot(r.slot)) + '</td>') +
        '<td class="num"><b>' + (r.amount ?? '') + '</b> ' + esc(r.currency) + (r.full_price && r.full_price !== r.amount ? '<br><s><small>' + r.full_price + '</small></s>' : '') + '<br>' + disc + '</td>' +
        '<td>' + esc(r.payment_method || '—') + (r.payment_claimed_at ? '<br><small>says paid ' + fmtDate(r.payment_claimed_at) + '</small>' : '') + '</td>' +
        '<td><select class="status ' + esc(r.status) + '" data-ref="' + esc(r.ref) + '" aria-label="Status for ' + esc(r.ref) + '">' +
          ['pending', 'paid', 'cancelled'].map((s) => '<option value="' + s + '"' + (s === r.status ? ' selected' : '') + '>' + ({ pending: 'Pending', paid: 'Paid', cancelled: 'Cancelled' })[s] + '</option>').join('') + '</select></td>' +
        '<td><button class="more" data-i="' + i + '" aria-expanded="false">Details</button></td>' +
      '</tr>' +
      '<tr class="detail" id="d' + i + '" hidden><td colspan="10"><div class="detail-grid">' +
        '<div><label>Biggest challenge</label><p class="ar">' + esc(r.problem || '—') + '</p></div>' +
        '<div><label for="n' + i + '">Internal note</label><textarea id="n' + i + '" rows="3" data-note="' + esc(r.ref) + '">' + esc(r.admin_note || '') + '</textarea>' +
        '<button class="btn" style="margin-top:8px" data-save="' + esc(r.ref) + '" data-i="' + i + '">Save note</button>' +
        (r.discount_note ? '<p style="margin-top:8px"><small>Discount check: ' + esc(r.discount_note) + '</small></p>' : '') + '</div>' +
      '</div></td></tr>';
    }).join('');
  }
  $('#rows').addEventListener('click', async (e) => {
    const m = e.target.closest('.more');
    if (m) { const d = $('#d' + m.dataset.i); d.hidden = !d.hidden; m.setAttribute('aria-expanded', String(!d.hidden)); return; }
    const sv = e.target.closest('[data-save]');
    if (sv) {
      const note = $('#n' + sv.dataset.i).value;
      try { const r = await api('/api/admin/orders/' + sv.dataset.save, { method: 'PATCH', body: JSON.stringify({ admin_note: note }) }); toast(r.ok ? 'Note saved' : 'Could not save note'); } catch {}
    }
  });
  $('#rows').addEventListener('change', async (e) => {
    const s = e.target.closest('select.status'); if (!s) return;
    try {
      const r = await api('/api/admin/orders/' + s.dataset.ref, { method: 'PATCH', body: JSON.stringify({ status: s.value }) });
      if (r.status === 409) { toast('That session time is already taken by another booking'); return load(); }
      if (!r.ok) { toast('Could not update'); return load(); }
      s.className = 'status ' + s.value; toast('Marked as ' + s.value);
      load();
    } catch {}
  });
  $('#export').addEventListener('click', async () => {
    try {
      const res = await api('/api/admin/orders.csv?' + params());
      const blob = await res.blob();
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = 'bookings-' + (type || 'all') + '-' + new Date().toISOString().slice(0, 10) + '.csv';
      document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch {}
  });
  pw ? load() : showLogin();
})();
</script>
</body>
</html>
`;
}
