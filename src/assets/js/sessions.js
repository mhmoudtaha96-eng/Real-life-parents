// 1-to-1 session calendar.
// Reads the availability JSON embedded in the page (from src/content/sessions/one-to-one.json),
// expands the weekly pattern into real dates (Cairo time), hides past/too-soon times,
// and hands the chosen time to the shared checkout.
import { track } from './analytics.js';

const DOW = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const TZ = 'Africa/Cairo';
const pad = (n) => String(n).padStart(2, '0');

/** Cairo UTC offset for a given date ("+02:00" / "+03:00" in summer time) */
function cairoOffset(date) {
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'longOffset' })
      .formatToParts(new Date(`${date}T12:00:00Z`)).find((p) => p.type === 'timeZoneName').value;
    const m = part.match(/GMT([+-]\d{2}):?(\d{2})?/);
    return m ? `${m[1]}:${m[2] || '00'}` : '+02:00';
  } catch { return '+02:00'; }
}
const instant = (date, time) => new Date(`${date}T${time}:00${cairoOffset(date)}`);
const addDays = (date, n) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/** Expand the availability rules into { 'YYYY-MM-DD': [{ time, status, at }] } */
export function buildSlots(A, now = new Date()) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(now);
  const earliest = now.getTime() + (A.booking?.minNoticeHours ?? 24) * 36e5;
  const booked = new Set((A.booked || []).map((b) => `${b.date} ${b.time}`));
  const blocked = new Set(A.blockedDates || []);
  const extra = {};
  for (const e of A.extraSlots || []) (extra[e.date] ||= []).push(...e.times);
  const out = {};
  for (let i = 0; i <= (A.booking?.daysAhead ?? 45); i++) {
    const date = addDays(today, i);
    if (blocked.has(date)) continue;
    const dow = DOW[new Date(`${date}T12:00:00Z`).getUTCDay()];
    const times = [...new Set([...(A.weekly?.[dow] || []), ...(extra[date] || [])])].sort();
    const list = times
      .map((time) => ({ time, at: instant(date, time) }))
      .filter((s) => s.at.getTime() >= earliest)
      .map((s) => ({ ...s, status: booked.has(`${date} ${s.time}`) ? 'booked' : 'open' }));
    if (list.length) out[date] = list;
  }
  return out;
}

export function initCalendar(data, checkout) {
  const root = document.querySelector('[data-calendar]');
  const src = document.getElementById('availability-data');
  if (!root || !src) return;
  const A = JSON.parse(src.textContent);
  const S = data.strings.session;
  const loc = data.locale;
  const nf = new Intl.NumberFormat(loc, { useGrouping: false });
  let slots = buildSlots(A);
  let dates = Object.keys(slots).sort();
  let openDates = dates.filter((d) => slots[d].some((s) => s.status === 'open'));

  const $ = (sel) => document.querySelector(sel);
  const grid = $('[data-cal-grid]');
  const monthLabel = $('[data-cal-month]');
  const timesBox = $('[data-cal-times]');
  const dayLabel = $('[data-cal-day-label]');
  const emptyMsg = $('[data-cal-empty]');
  const reserveBtn = $('[data-reserve]');
  const sumSlot = $('[data-sum-slot]');
  const sumPrice = $('[data-sum-price]');
  const sumWas = $('[data-sum-was]');
  const discount = $('[data-sum-discount]');
  const visitorTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const sameTz = new Intl.DateTimeFormat('en-US', { timeZone: visitorTz, hour: 'numeric', timeZoneName: 'longOffset' }).format(new Date())
    .split(' ').pop() === new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', timeZoneName: 'longOffset' }).format(new Date()).split(' ').pop();

  const fmtDay = (date, opts) => new Intl.DateTimeFormat(loc, { timeZone: 'UTC', ...opts }).format(new Date(`${date}T12:00:00Z`));
  const durMs = (A.durationMinutes || 60) * 6e4;
  const fmtRange = (at, tz) => {
    const f = new Intl.DateTimeFormat(loc, { timeZone: tz, hour: 'numeric', minute: '2-digit' });
    const end = new Date(at.getTime() + durMs);
    // Arabic: «من ٥:٠٠ لـ ٦:٠٠ م» (a dash between numbers reads backwards in right-to-left text)
    if (data.lang === 'ar') return `من ${f.format(at).replace(/\s?[صم]$/, '')} لـ ${f.format(end)}`;
    try { return f.formatRange(at, end); } catch { return `${f.format(at)} – ${f.format(end)}`; }
  };
  const fmtTime = (at, tz) => new Intl.DateTimeFormat(loc, { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(at);

  // First day of the week: Saturday for Arabic (as in Egypt), Sunday for English
  const weekStart = data.lang === 'ar' ? 6 : 0;
  const first = openDates[0] || dates[0] || new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
  const last = dates[dates.length - 1] || first;
  const monthKey = (d) => d.slice(0, 7);
  let viewMonth = monthKey(first);
  let selDate = null;
  let selSlot = null;

  function renderMonth() {
    const [y, m] = viewMonth.split('-').map(Number);
    monthLabel.textContent = new Intl.DateTimeFormat(loc, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 15)));
    root.querySelector('[data-cal="prev"]').disabled = viewMonth <= monthKey(first);
    root.querySelector('[data-cal="next"]').disabled = viewMonth >= monthKey(last);

    const cells = [];
    for (let i = 0; i < 7; i++) {
      const dayIdx = (weekStart + i) % 7;
      const ref = new Date(Date.UTC(2026, 1, 1 + dayIdx)); // 1 Feb 2026 is a Sunday
      cells.push(`<div class="cal-dow" role="columnheader" aria-label="${new Intl.DateTimeFormat(loc, { weekday: 'long', timeZone: 'UTC' }).format(ref)}">${new Intl.DateTimeFormat(loc, { weekday: 'short', timeZone: 'UTC' }).format(ref)}</div>`);
    }
    const firstDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    const lead = (firstDow - weekStart + 7) % 7;
    for (let i = 0; i < lead; i++) cells.push('<div class="cal-cell is-blank" aria-hidden="true"></div>');
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    let any = false;
    for (let d = 1; d <= daysInMonth; d++) {
      const date = `${y}-${pad(m)}-${pad(d)}`;
      const open = (slots[date] || []).filter((s) => s.status === 'open').length;
      if (open) any = true;
      const label = `${fmtDay(date, { weekday: 'long', day: 'numeric', month: 'long' })}: ${open ? S.slotsLeft.replace('{n}', nf.format(open)) : (slots[date] ? S.full : S.noSlots)}`;
      cells.push(`<button type="button" class="cal-cell${open ? ' has-slots' : ''}${date === selDate ? ' is-selected' : ''}" data-date="${date}" ${open ? '' : 'disabled'} aria-pressed="${date === selDate}" aria-label="${label}">
        <span class="cal-num">${nf.format(d)}</span>${open ? '<span class="cal-dot" aria-hidden="true"></span>' : ''}</button>`);
    }
    grid.innerHTML = cells.join('');
    emptyMsg.hidden = any;
  }

  function renderTimes() {
    timesBox.replaceChildren();
    if (!selDate) { dayLabel.textContent = S.chooseFirst; return; }
    dayLabel.textContent = fmtDay(selDate, { weekday: 'long', day: 'numeric', month: 'long' });
    for (const s of slots[selDate] || []) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'time-chip';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(selSlot === s));
      b.disabled = s.status !== 'open';
      b.innerHTML = `<b>${fmtRange(s.at, TZ)}</b>${s.status === 'booked' ? `<small>${S.booked}</small>` : (!sameTz ? `<small>${S.yourTime.replace('{t}', fmtRange(s.at, visitorTz))}</small>` : '')}`;
      b.addEventListener('click', () => { selSlot = s; renderTimes(); renderSummary(); track('select_slot', { date: selDate, time: s.time }); });
      timesBox.append(b);
    }
  }

  const product = data.products.find((p) => p.id === A.id);
  const productId = () => A.id;
  const fullPrice = product.pricing.tiers[0].amount;
  const price = () => (discount?.checked ? Math.round(fullPrice * (1 - (product.discountPercent || 0) / 100)) : fullPrice);
  const slotLabel = () => `${fmtDay(selDate, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}، ${fmtRange(selSlot.at, TZ)}`.replace('،', data.lang === 'ar' ? '،' : ',');

  function renderSummary() {
    sumPrice.textContent = nf.format(price());
    sumWas.hidden = !discount?.checked;
    const ifEl = document.querySelector('[data-sum-if]'); if (ifEl) ifEl.hidden = !discount?.checked;
    reserveBtn.disabled = !selSlot;
    sumSlot.textContent = selSlot ? slotLabel() : S.chooseFirst;
    sumSlot.classList.toggle('is-set', !!selSlot);
  }

  grid.addEventListener('click', (e) => {
    const b = e.target.closest('[data-date]');
    if (!b || b.disabled) return;
    selDate = b.dataset.date; selSlot = null;
    renderMonth(); renderTimes(); renderSummary();
    grid.querySelector(`[data-date="${selDate}"]`)?.focus();
  });
  // arrow-key movement between days
  grid.addEventListener('keydown', (e) => {
    const b = e.target.closest('[data-date]');
    const step = { ArrowLeft: data.lang === 'ar' ? 1 : -1, ArrowRight: data.lang === 'ar' ? -1 : 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (!b || !step) return;
    e.preventDefault();
    const target = grid.querySelector(`[data-date="${addDays(b.dataset.date, step)}"]`);
    target?.focus();
  });
  root.querySelector('[data-cal="prev"]').addEventListener('click', () => { const [y, m] = viewMonth.split('-').map(Number); viewMonth = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7); renderMonth(); });
  root.querySelector('[data-cal="next"]').addEventListener('click', () => { const [y, m] = viewMonth.split('-').map(Number); viewMonth = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7); renderMonth(); });
  discount?.addEventListener('change', renderSummary);

  reserveBtn.addEventListener('click', () => {
    if (!selSlot) return;
    checkout.open(productId(), { label: slotLabel(), slot: `${selDate}T${selSlot.time}`, at: selSlot.at.toISOString(), requestDiscount: !!discount?.checked });
  });

  // Times already booked by others (saved in the database) → shown as "booked"
  async function loadTaken() {
    try {
      const res = await fetch('/api/slots', { cache: 'no-store' });
      if (!res.ok) return;
      const { taken = [] } = await res.json();
      const extra = taken.map((t) => ({ date: t.slice(0, 10), time: t.slice(11, 16) }));
      slots = buildSlots({ ...A, booked: [...(A.booked || []), ...extra] });
      dates = Object.keys(slots).sort();
      openDates = dates.filter((d) => slots[d].some((s) => s.status === 'open'));
      if (selDate && !(slots[selDate] || []).some((s) => s.status === 'open')) selDate = openDates[0] || null;
      if (selSlot) selSlot = (slots[selDate] || []).find((s) => s.time === selSlot.time && s.status === 'open') || null;
      renderMonth(); renderTimes(); renderSummary();
    } catch { /* API not available: keep the published availability */ }
  }
  document.addEventListener('rlp:slots-changed', loadTaken);

  // Start on the first available day
  selDate = openDates[0] || null;
  renderMonth(); renderTimes(); renderSummary();
  loadTaken();
}
