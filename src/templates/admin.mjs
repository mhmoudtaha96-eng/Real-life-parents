// Admin dashboard (/admin/): bookings, courses (add / edit / show on the site) and 1-to-1 settings.
// The page holds no data; everything loads from /api/admin/* with the admin password.
// The dashboard code lives in src/assets/admin/admin.js.
export function adminPage({ site }) {
  return `<!doctype html>
<html lang="en" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<title>Admin | ${site.brand}</title>
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
header{background:var(--surface);border-bottom:1px solid var(--line);position:sticky;top:0;z-index:20}
.bar{display:flex;align-items:center;gap:10px;min-height:60px;flex-wrap:wrap;padding-block:8px}
.bar h1{font-size:18px;margin:0;margin-inline-end:8px}.bar h1 b{color:var(--calm)}
.nav{display:flex;gap:4px;flex-wrap:wrap;margin-inline-end:auto}
.nav button{min-height:40px;padding:4px 14px;border:0;border-radius:10px;background:none;font-weight:700;color:var(--soft);cursor:pointer}
.nav button[aria-current=page]{background:var(--mint);color:var(--calm)}
button,select,input,textarea{font:inherit;color:inherit}
.btn{min-height:40px;padding:6px 14px;border-radius:999px;border:2px solid var(--line);background:var(--surface);cursor:pointer;font-weight:600;white-space:nowrap}
.btn.primary{background:var(--calm);border-color:var(--calm);color:#fff}
.btn.danger{color:var(--red);border-color:#E9B7B2}
.btn.sm{min-height:34px;padding:3px 12px;font-size:14px}
.btn:disabled{opacity:.5;cursor:default}
.link{border:0;background:none;color:var(--calm);font-weight:700;cursor:pointer;padding:0;text-decoration:underline}
.btn:focus-visible,.link:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,.nav button:focus-visible{outline:3px solid var(--sun);outline-offset:2px}
.login{max-width:380px;margin:12vh auto;background:var(--surface);border:1px solid var(--line);border-radius:20px;padding:28px;display:grid;gap:14px}
.login h1{margin:0;font-size:22px}
label,.lbl{font-weight:600;font-size:13px;color:var(--soft)}
input:not([type=checkbox]):not([type=radio]),select,textarea{width:100%;min-height:42px;padding:8px 12px;border-radius:10px;border:2px solid var(--line);background:var(--paper)}
textarea{resize:vertical;min-height:70px}
input:not([type=checkbox]):not([type=radio]):focus,textarea:focus,select:focus{background:#fff;border-color:var(--calm)}
.err{color:var(--red);font-weight:600;margin:0}
.tabs{display:flex;gap:6px;flex-wrap:wrap;padding-block:14px}
.tab{min-height:38px;padding:4px 14px;border-radius:999px;border:0;background:var(--mint);cursor:pointer;font-weight:600}
.tab[aria-pressed=true]{background:var(--calm);color:#fff}
.tools{display:grid;grid-template-columns:1fr 200px 180px auto auto;gap:8px;align-items:center;padding-bottom:14px}
@media(max-width:860px){.tools{grid-template-columns:1fr 1fr}}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:16px}
.tile{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:12px 14px}
.tile small{display:block;color:var(--soft);font-weight:600}.tile b{font-size:22px;font-variant-numeric:tabular-nums}
.table-wrap{background:var(--surface);border:1px solid var(--line);border-radius:16px;overflow-x:auto}
table{border-collapse:collapse;width:100%;min-width:980px}
th,td{padding:10px 12px;text-align:left;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:12px;color:var(--soft);font-weight:700;background:#F7FAF5;position:sticky;top:0}
td.num{font-variant-numeric:tabular-nums;white-space:nowrap}
.ar{direction:rtl;text-align:right;unicode-bidi:plaintext}
.pill{display:inline-block;padding:1px 8px;border-radius:6px;font-size:12px;font-weight:700;white-space:nowrap}
.pill.disc{background:var(--sun-soft)}.pill.nodisc{background:#F3E2E0;color:var(--red)}
.pill.on{background:var(--mint);color:var(--calm)}.pill.off{background:#ECEFEA;color:var(--soft)}.pill.past{background:#F3E2E0;color:var(--red)}.pill.home{background:var(--sun-soft)}
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
.toast{position:fixed;bottom:84px;left:50%;transform:translateX(-50%);background:var(--ink);color:#fff;padding:10px 16px;border-radius:12px;font-weight:600;z-index:50;max-width:calc(100% - 32px)}
a{color:var(--calm)}
.help{color:var(--soft);font-size:13px;margin:4px 0 0}
.page-head{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding-block:18px 10px}
.page-head h2{margin:0;font-size:22px;margin-inline-end:auto}

/* courses list */
.clist{display:grid;gap:12px;margin-bottom:40px}
.ccard{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:14px 16px;display:grid;grid-template-columns:auto 1fr auto;gap:12px 16px;align-items:start}
.ccard.is-hidden{background:#F8FAF7}
.cnum{width:36px;height:36px;border-radius:50%;background:var(--mint);color:var(--calm);display:grid;place-items:center;font-weight:700}
.cmain h3{margin:0;font-size:18px}.cmain h3 small{display:block;font-size:14px;color:var(--soft);font-weight:500}
.cfacts{display:flex;flex-wrap:wrap;gap:6px 18px;margin:8px 0 0;padding:0;list-style:none;font-size:14px}
.cfacts li b{color:var(--soft);font-weight:600}
.cside{display:grid;gap:8px;justify-items:end}
.switch{display:flex;align-items:center;gap:8px;font-weight:700;color:var(--ink);font-size:14px;cursor:pointer;white-space:nowrap}
.switch input{width:20px;height:20px;accent-color:var(--calm);cursor:pointer}
.cact{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
@media(max-width:720px){.ccard{grid-template-columns:auto 1fr}.cside{grid-column:1/-1;justify-items:start}.cact{justify-content:flex-start}}

/* editor */
.editor{display:grid;gap:14px;margin-bottom:90px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:16px}
.card>h3{margin:0 0 4px;font-size:17px}
.card>.help:first-of-type{margin-bottom:12px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
.f{display:grid;gap:4px;align-content:start}
.f.wide{grid-column:1/-1}
.row{display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:8px;align-items:end;margin-bottom:8px}
@media(max-width:600px){.row{grid-template-columns:1fr 1fr}.row .f:first-child{grid-column:1/-1}}
.items{display:grid;gap:10px}
.item{border:1px dashed var(--line);border-radius:12px;padding:10px;display:grid;gap:8px;background:#FCFDFB}
.item-head{display:flex;gap:8px;align-items:center}
.item-head .lbl{margin-inline-end:auto}
.icon-btn{min-width:34px;min-height:34px;border-radius:8px;border:1px solid var(--line);background:#fff;cursor:pointer;font-weight:700}
.note{background:var(--sun-soft);border-radius:12px;padding:10px 14px;margin:0;font-weight:600}
.langtabs{display:flex;gap:6px;margin-bottom:12px}
.savebar{position:fixed;inset-inline:0;bottom:0;background:var(--surface);border-top:1px solid var(--line);z-index:15}
.savebar .wrap{display:flex;gap:8px;align-items:center;min-height:64px;flex-wrap:wrap;padding-block:8px}
.savebar .err{margin-inline-end:auto}
.days{display:grid;gap:8px}
.day{display:grid;grid-template-columns:110px 1fr;gap:10px;align-items:center;border-bottom:1px solid var(--line);padding-bottom:8px}
.times{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.times .t{display:flex;gap:2px;align-items:center}
.times input{width:150px!important}
.f.switch{display:flex;align-items:center}
.invalid{border-color:var(--red)!important;background:#FDF3F2!important}
</style>
</head>
<body>
<main id="login" class="wrap" hidden>
  <form class="login" id="login-form">
    <h1>Admin</h1>
    <p style="margin:0;color:var(--soft)">${site.brand}</p>
    <div><label for="pw">Admin password</label><input id="pw" type="password" autocomplete="current-password" required></div>
    <p class="err" id="login-err" hidden></p>
    <button class="btn primary" type="submit">Sign in</button>
  </form>
</main>

<div id="app" hidden>
  <header><div class="wrap bar">
    <h1>Real Life <b>Parents</b></h1>
    <nav class="nav" aria-label="Admin sections">
      <button type="button" data-view="bookings" aria-current="page">Bookings</button>
      <button type="button" data-view="courses">Courses</button>
      <button type="button" data-view="settings">1-to-1 sessions</button>
    </nav>
    <a class="btn sm" href="/" target="_blank" rel="noopener">View website ↗</a>
    <button class="btn sm" id="logout" type="button">Sign out</button>
  </div></header>

  <!-- ============ BOOKINGS ============ -->
  <section class="wrap" id="view-bookings">
    <div class="tabs" role="group" aria-label="Booking type">
      <button class="tab" data-type="workshop" aria-pressed="true">Workshop registrations</button>
      <button class="tab" data-type="session" aria-pressed="false">1-to-1 sessions</button>
      <button class="tab" data-type="" aria-pressed="false">All</button>
    </div>
    <div class="tools">
      <input type="search" id="q" placeholder="Search name, phone, email or booking ref" aria-label="Search">
      <select id="product" aria-label="Course"><option value="">All courses</option></select>
      <select id="status" aria-label="Status"><option value="">All statuses</option><option value="pending">Pending payment</option><option value="paid">Paid</option><option value="cancelled">Cancelled</option></select>
      <button class="btn" id="refresh" type="button">Refresh</button>
      <button class="btn" id="export" type="button">Export CSV</button>
    </div>
    <div class="tiles" id="tiles"></div>
    <div class="table-wrap"><table>
      <thead><tr><th>Date</th><th>Ref</th><th>Name</th><th>WhatsApp</th><th>Child age</th><th id="th-slot">Session time (Cairo)</th><th>Amount</th><th>Paid via</th><th>Status</th><th></th></tr></thead>
      <tbody id="rows"></tbody>
    </table><p class="empty" id="empty" hidden>No bookings yet.</p></div>
    <p class="help" style="margin:14px 0 40px">Set a workshop booking to <b>Paid</b> after you see the transfer. Only paid workshop bookings unlock the workshop discount on a 1-to-1 session. Unpaid 1-to-1 bookings are cancelled automatically after 24 hours so the time becomes free again.</p>
  </section>

  <!-- ============ COURSES ============ -->
  <section class="wrap" id="view-courses" hidden>
    <div id="courses-list-view">
      <div class="page-head">
        <h2>Courses</h2>
        <button class="btn primary" type="button" id="add-course">+ Add new course</button>
      </div>
      <p class="help" style="margin:0 0 14px">Tick <b>Show on website</b> to publish a course, untick it to hide it. The course marked <b>Home page</b> is the main page of the website; the other visible courses get their own page and are listed on the home page. Changes are live within a few seconds.</p>
      <div class="clist" id="clist"></div>
    </div>
    <form id="course-form" class="editor" novalidate hidden></form>
  </section>

  <!-- ============ 1-TO-1 SETTINGS ============ -->
  <section class="wrap" id="view-settings" hidden>
    <div class="page-head"><h2>1-to-1 sessions</h2></div>
    <form id="session-form" class="editor" novalidate></form>
  </section>
</div>
<div class="toast" id="toast" role="status" hidden></div>
<script type="module" src="/assets/admin/admin.js"></script>
</body>
</html>
`;
}
