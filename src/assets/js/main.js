import { Cart } from './commerce/cart.js';
import { activeTier, regularTier } from './commerce/pricing.js';
import { initCheckout } from './checkout.js';
import { track } from './analytics.js';

const data = JSON.parse(document.getElementById('rlp-data').textContent);
const S = data.strings;
const nf = new Intl.NumberFormat(data.locale, { useGrouping: false });
const cart = new Cart(data.products);
const checkout = initCheckout(data, cart);

/* Book buttons → checkout */
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-checkout]');
  if (!b) return;
  e.preventDefault();
  checkout.open(b.dataset.product);
});
// Deep link: /#book opens the checkout (useful for Instagram bio & ads)
if (location.hash === '#book') checkout.open();

/* Live price: static HTML was built at a moment in time; re-check the tier on load. */
function refreshPrices() {
  const now = new Date();
  for (const product of data.products) {
    const tier = activeTier(product, now);
    const isEarly = tier !== regularTier(product);
    document.querySelectorAll(`[data-price][data-product="${product.id}"]`).forEach((box) => {
      box.querySelector('[data-price-amount]').textContent = nf.format(tier.amount);
      if (!isEarly) {
        box.querySelector('[data-price-was]')?.remove();
        box.querySelector('[data-countdown]')?.remove();
      }
    });
    document.querySelectorAll('.tier').forEach((li) => {
      const t = product.pricing.tiers.find((x) => x.id === li.dataset.tier);
      li.classList.toggle('is-active', t === tier);
      li.classList.toggle('is-past', !!t?.until && new Date(t.until) <= now);
    });
  }
}

/* Early-bird countdown */
function tickCountdowns() {
  document.querySelectorAll('[data-countdown]').forEach((n) => {
    const ms = new Date(n.dataset.countdown) - Date.now();
    if (ms <= 0) { refreshPrices(); return; }
    const d = Math.floor(ms / 864e5), h = Math.floor((ms % 864e5) / 36e5), m = Math.floor((ms % 36e5) / 6e4);
    const parts = [d && `${nf.format(d)} ${S.days}`, `${nf.format(h)} ${S.hours}`, `${nf.format(m)} ${S.minutes}`].filter(Boolean);
    n.textContent = `${n.dataset.label} ${parts.join(' ')}`;
  });
}
refreshPrices();
tickCountdowns();
setInterval(tickCountdowns, 30_000);

/* Sticky buy bar on phones: visible once the hero's buttons scroll out of view */
const bar = document.querySelector('[data-sticky]');
const heroBuy = document.querySelector('.hero-ctas');
const finalSec = document.querySelector('.final');
if (bar && heroBuy && 'IntersectionObserver' in window) {
  let heroVisible = true, finalVisible = false;
  const update = () => { bar.hidden = heroVisible || finalVisible; };
  // show only once the hero buttons have scrolled up out of view
  new IntersectionObserver(([e]) => { heroVisible = e.isIntersecting || e.boundingClientRect.top > 0; update(); }).observe(heroBuy);
  if (finalSec) new IntersectionObserver(([e]) => { finalVisible = e.isIntersecting; update(); }).observe(finalSec);
}

/* FAQ engagement */
document.querySelectorAll('.faq details').forEach((d, i) => d.addEventListener('toggle', () => { if (d.open) track('faq_open', { index: i + 1 }); }));

track('view_item', { currency: data.currency, value: activeTier(data.products[0]).amount, items: [{ item_id: data.products[0].id, item_name: data.products[0].name }] });

/* Page-specific features, loaded only where they're used */
if (document.querySelector('[data-calendar]')) import('./sessions.js').then((m) => m.initCalendar(data, checkout));
if (document.getElementById('lightbox')) import('./gallery.js').then((m) => m.initGallery(data));
