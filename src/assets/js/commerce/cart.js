// Minimal cart. Today the site sells one workshop at a time ("buy now" = cart with one item),
// but the same cart supports several courses, quantities and a future cart page / mini-cart.
import { activeTier } from './pricing.js';

const KEY = 'rlp.cart.v1';

const storage = {
  get() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } },
  set(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private mode: keep in memory */ } },
};

export class Cart {
  constructor(catalog) {
    this.catalog = new Map(catalog.map((p) => [p.id, p]));
    this.items = storage.get().filter((i) => this.catalog.has(i.productId));
    this.listeners = new Set();
  }
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { storage.set(this.items); this.listeners.forEach((fn) => fn(this)); }

  add(productId, qty = 1) {
    const found = this.items.find((i) => i.productId === productId);
    if (found) found.qty += qty; else this.items.push({ productId, qty });
    this.emit();
  }
  /** Replace the cart with a single item (used by "Book now" buttons). */
  buyNow(productId) { this.items = [{ productId, qty: 1 }]; this.emit(); }
  remove(productId) { this.items = this.items.filter((i) => i.productId !== productId); this.emit(); }
  clear() { this.items = []; this.emit(); }

  /** Lines priced at the moment of calling (early-bird logic lives in pricing.js). */
  lines(now = new Date()) {
    return this.items.map((i) => {
      const product = this.catalog.get(i.productId);
      const tier = activeTier(product, now);
      return { product, qty: i.qty, tier, unit: tier.amount, total: tier.amount * i.qty };
    });
  }
  total(now) { return this.lines(now).reduce((s, l) => s + l.total, 0); }
  get count() { return this.items.reduce((s, i) => s + i.qty, 0); }
}
