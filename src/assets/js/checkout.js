// Checkout flow: details → payment method → confirmation.
// UI shell is server-rendered (see src/templates/page.mjs → checkoutDialog); this file adds behaviour.
import { availableProviders } from './payments/registry.js';
import './payments/providers/index.js';
import { createOrder, saveOrder, submitOrder } from './commerce/order.js';
import { formatMoney } from './commerce/pricing.js';
import { el, copyText } from './ui/dom.js';
import { validateName, validatePhone, validateEmail, toAsciiDigits } from './ui/validate.js';
import { countryByIso, guessCountry } from './data/countries.js';
import { track } from './analytics.js';

export function initCheckout(data, cart) {
  const dlg = document.getElementById('checkout');
  if (!dlg) return { open() {} };
  const S = data.strings;
  const K = S.checkout;
  const money = (n) => formatMoney(n, { locale: data.locale, currencyLabel: S.currency });
  const $ = (sel) => dlg.querySelector(sel);
  const $$ = (sel) => [...dlg.querySelectorAll(sel)];
  const form = $('#co-form');
  const methods = availableProviders(data.payments).filter((m) => m.enabled);

  let order = null;
  let method = methods[0] || null;
  let lastTrigger = null;

  function go(step) {
    $$('.co-step').forEach((s) => { s.hidden = s.dataset.step !== String(step); });
    $$('[data-step-ind]').forEach((li) => {
      const n = +li.dataset.stepInd;
      li.classList.toggle('is-done', n < step);
      if (n === step) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    });
    const first = dlg.querySelector(`.co-step[data-step="${step}"] input, .co-step[data-step="${step}"] a, .co-step[data-step="${step}"] button`);
    first?.focus({ preventScroll: true });
    dlg.scrollTop = 0;
  }

  function refreshAmount() {
    $$('[data-co-amount]').forEach((b) => { b.textContent = money(order ? order.total : cart.total()); });
  }

  // ---------- open / close ----------
  function open(productId) {
    lastTrigger = document.activeElement;
    cart.buyNow(productId || data.products[0].id);
    order = null;
    refreshAmount();
    go(1);
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    document.documentElement.style.overflow = 'hidden';
    track('begin_checkout', { currency: data.currency, value: cart.total(), items: cart.lines().map((l) => ({ item_id: l.product.id, item_name: l.product.name, price: l.unit, quantity: l.qty })) });
  }
  function close() {
    if (typeof dlg.close === 'function') dlg.close(); else dlg.removeAttribute('open');
  }
  dlg.addEventListener('close', () => {
    document.documentElement.style.overflow = '';
    lastTrigger?.focus?.({ preventScroll: true });
  });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); }); // backdrop click
  $$('[data-close]').forEach((b) => b.addEventListener('click', close));
  $$('[data-back]').forEach((b) => b.addEventListener('click', () => {
    const cur = +dlg.querySelector('.co-step:not([hidden])').dataset.step;
    go(Math.max(1, cur - 1));
  }));

  // ---------- step 1: details (validation in ui/validate.js) ----------
  const E = K.err;
  const fName = form.name, fPhone = form.phone, fCountry = form.country, fEmail = form.email;
  const touched = new Set();
  let submitting = false;

  const exDigits = (iso) => countryByIso(iso).ex.replace(/\D/g, '');
  const countryName = (iso) => { const c = countryByIso(iso); return c[data.lang] || c.en; };

  function setError(input, errId, msg, extra) {
    const err = dlg.querySelector(`#${errId}`);
    err.replaceChildren();
    if (msg) { err.append(msg); if (extra) err.append(' ', extra); }
    err.hidden = !msg;
    input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    input.classList.toggle('is-valid', !msg && !!input.value.trim());
    return !msg;
  }

  function checkName() {
    const r = validateName(fName.value);
    return setError(fName, 'co-name-err', r.ok ? '' : E.name[r.code]);
  }
  function checkPhone() {
    const r = validatePhone(fPhone.value, fCountry.value);
    if (r.ok) return setError(fPhone, 'co-phone-err', '');
    const [before, after = ''] = E.phone[r.code].replace('{country}', countryName(r.country || fCountry.value)).split('{ex}');
    const msg = document.createDocumentFragment();
    msg.append(before);
    if (E.phone[r.code].includes('{ex}')) msg.append(el('bdi', { dir: 'ltr' }, exDigits(fCountry.value)), after);
    return setError(fPhone, 'co-phone-err', msg);
  }
  function checkEmail() {
    const r = validateEmail(fEmail.value);
    if (r.ok) return setError(fEmail, 'co-email-err', '');
    if (r.code === 'typo') {
      const fix = el('button', { type: 'button', class: 'link-btn' }, K.useSuggestion);
      fix.addEventListener('click', () => { fEmail.value = r.suggestion; checkEmail(); fEmail.focus(); });
      return setError(fEmail, 'co-email-err', E.email.typo.replace('{email}', r.suggestion), fix);
    }
    return setError(fEmail, 'co-email-err', E.email.invalid);
  }
  function checkAge() {
    const ok = !!form.querySelector('input[name="age"]:checked');
    dlg.querySelector('#co-age-err').hidden = ok;
    return ok;
  }
  function syncPlaceholder() {
    fPhone.placeholder = exDigits(fCountry.value);
  }

  // Pre-select the visitor's country from their time zone (no permission needed)
  fCountry.value = guessCountry();
  syncPlaceholder();

  // Validate when leaving a field; once a field has been checked, re-check as she types
  [[fName, checkName], [fPhone, checkPhone], [fEmail, checkEmail]].forEach(([input, fn]) => {
    // On leaving a field, show its error after a short pause: showing it instantly shifts the layout
    // and makes the tap on "Continue" miss the button. Skipped when focus moves straight to submit.
    input.addEventListener('blur', (e) => {
      if (e.relatedTarget?.type === 'submit') return;
      if (!(input.value.trim() || touched.has(input))) return;
      setTimeout(() => { if (!submitting) { touched.add(input); fn(); } }, 250);
    });
    input.addEventListener('input', () => { if (touched.has(input)) fn(); });
  });
  fCountry.addEventListener('change', () => { syncPlaceholder(); if (fPhone.value.trim()) { touched.add(fPhone); checkPhone(); } });
  form.querySelectorAll('input[name="age"]').forEach((r) => r.addEventListener('change', checkAge));
  // Names: block digits as they're typed
  fName.addEventListener('beforeinput', (e) => { if (e.data && /[\d٠-٩۰-۹]/.test(e.data)) e.preventDefault(); });
  // Phone: digits only. Arabic/Persian digits are converted to 0-9; everything else is dropped.
  fPhone.addEventListener('beforeinput', (e) => {
    if (e.inputType?.startsWith('insert') && e.data && !/^[\d٠-٩۰-۹]+$/.test(e.data) && !/^\s*\+/.test(e.data)) e.preventDefault();
  });
  fPhone.addEventListener('input', () => {
    const raw = toAsciiDigits(fPhone.value);
    // A full international number was pasted (+966… or 00966…) → pick that country, keep the local part
    if (/^\s*(\+|00)/.test(raw) && raw.replace(/\D/g, '').length >= 9) {
      const r = validatePhone(raw, fCountry.value);
      const c = countryByIso(r.country);
      const digits = raw.replace(/\D/g, '').replace(/^00/, '');
      if (c.dial && digits.startsWith(c.dial)) { fCountry.value = c.iso; syncPlaceholder(); fPhone.value = digits.slice(c.dial.length); }
      else { fCountry.value = 'XX'; syncPlaceholder(); fPhone.value = digits; }
    } else {
      const clean = raw.replace(/\D/g, '').slice(0, 15);
      if (clean !== fPhone.value) {
        const pos = Math.max(0, (fPhone.selectionStart ?? clean.length) - (fPhone.value.length - clean.length));
        fPhone.value = clean;
        try { fPhone.setSelectionRange(pos, pos); } catch { /* ignore */ }
      }
    }
    if (touched.has(fPhone)) checkPhone();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submitting = true; setTimeout(() => { submitting = false; }, 400);
    [fName, fPhone, fEmail].forEach((i) => touched.add(i));
    const ok = [checkName(), checkPhone(), checkAge(), checkEmail()];
    if (!ok.every(Boolean)) {
      const firstBad = form.querySelector('[aria-invalid="true"]') || form.querySelector('input[name="age"]');
      firstBad?.focus();
      firstBad?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    const phone = validatePhone(fPhone.value, fCountry.value);
    order = createOrder(cart, {
      name: validateName(fName.value).value,
      phone: phone.e164,
      phoneDisplay: phone.display,
      country: phone.country,
      countryName: countryName(phone.country),
      childAge: form.querySelector('input[name="age"]:checked').value,
      email: validateEmail(fEmail.value).value,
      lang: data.lang,
    }, data.currency);
    saveOrder(order);
    $$('[data-co-ref]').forEach((b) => { b.textContent = order.ref; });
    refreshAmount();
    renderMethods();
    go(2);
    track('generate_lead', { currency: data.currency, value: order.total });
  });

  // ---------- step 2: payment ----------
  function renderMethods() {
    const box = $('[data-co-methods]');
    box.replaceChildren(...methods.map((m) => {
      const b = el('button', { type: 'button', class: 'co-method', role: 'radio', 'aria-checked': String(m === method) }, [
        m.provider.icon?.cloneNode(true),
        el('span', {}, [m.provider.label(S), el('small', {}, m.provider.hint(S))]),
      ]);
      b.addEventListener('click', () => { method = m; renderMethods(); });
      return b;
    }));
    box.hidden = methods.length < 2; // a single method needs no picker
    $('.co-label').hidden = methods.length < 2;
    const panel = $('[data-co-panel]');
    panel.replaceChildren(method ? method.provider.render({ order, config: method.config, strings: S, lang: data.lang, locale: data.locale, money, whatsapp: data.whatsapp }) : '');
  }

  $('[data-paid]').addEventListener('click', async () => {
    if (!order || !method) return;
    order.paymentMethod = method.provider.id;
    saveOrder(order);
    track('add_payment_info', { currency: data.currency, value: order.total, payment_type: method.provider.id });
    if (method.provider.confirmMode === 'redirect') { await method.provider.startCheckout({ order, config: method.config }); return; }
    await submitOrder(order);
    buildWhatsApp();
    go(3);
  });

  // ---------- step 3: confirm on WhatsApp ----------
  function buildWhatsApp() {
    const msg = K.waMessage
      .replace('{course}', order.lines.map((l) => l.name).join(' + '))
      .replace('{ref}', order.ref)
      .replace('{name}', order.customer.name)
      .replace('{phone}', order.customer.phoneDisplay)
      .replace('{country}', order.customer.countryName)
      .replace('{age}', order.customer.childAge)
      .replace('{amount}', money(order.total))
      .replace('{method}', method.provider.label(S));
    $('[data-wa]').href = `https://wa.me/${data.whatsapp}?text=${encodeURIComponent(msg)}`;
    $('[data-wa-number]').textContent = `+${data.whatsapp}`;
  }
  $('[data-wa]').addEventListener('click', () => track('contact', { method: 'whatsapp' }));
  $('[data-copy-wa]').addEventListener('click', async (e) => {
    if (await copyText(`+${data.whatsapp}`)) { e.target.textContent = K.copied; setTimeout(() => { e.target.textContent = K.copy; }, 1800); }
  });

  return { open };
}
