// Checkout flow: details → payment method → confirmation.
// UI shell is server-rendered (see src/templates/page.mjs → checkoutDialog); this file adds behaviour.
import { availableProviders } from './payments/registry.js';
import './payments/providers/index.js';
import { createOrder, saveOrder, submitOrder } from './commerce/order.js';
import { formatMoney } from './commerce/pricing.js';
import { el, copyText } from './ui/dom.js';
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

  // ---------- step 1: details ----------
  const showErr = (input, errId, bad) => {
    const err = dlg.querySelector(`#${errId}`);
    err.hidden = !bad;
    if (input) {
      input.setAttribute('aria-invalid', bad ? 'true' : 'false');
      if (bad) input.setAttribute('aria-describedby', errId); else input.removeAttribute('aria-describedby');
    }
    return bad;
  };
  const normalizePhone = (v) => {
    const ascii = v.replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[^\d+]/g, '');
    if (/^01[0125]\d{8}$/.test(ascii)) return ascii;
    if (/^\+?\d{8,15}$/.test(ascii)) return ascii;
    return null;
  };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = form.name.value.trim();
    const phone = normalizePhone(form.phone.value);
    const age = form.querySelector('input[name="age"]:checked')?.value;
    const errs = [
      showErr(form.name, 'co-name-err', name.length < 2),
      showErr(form.phone, 'co-phone-err', !phone),
      showErr(null, 'co-age-err', !age),
    ];
    if (errs.some(Boolean)) {
      (form.querySelector('[aria-invalid="true"]') || form.querySelector('input[name="age"]'))?.focus();
      return;
    }
    order = createOrder(cart, { name, phone, childAge: age, email: form.email.value.trim() || null, lang: data.lang }, data.currency);
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
    panel.replaceChildren(method ? method.provider.render({ order, config: method.config, strings: S, lang: data.lang, locale: data.locale, money }) : '');
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
      .replace('{phone}', order.customer.phone)
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
