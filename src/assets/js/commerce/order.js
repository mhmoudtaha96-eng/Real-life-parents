// Order = snapshot of the cart + customer at checkout time.
// When a backend is added (e.g. Cloudflare Worker + database), send this object to it in `submitOrder`.

const KEY = 'rlp.orders.v1';

function makeRef() {
  const d = new Date();
  const ym = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}`;
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(4)))
    .map((b) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('');
  return `RLP-${ym}-${rand}`;
}

export function createOrder(cart, customer, currency) {
  const lines = cart.lines();
  return {
    ref: makeRef(),
    createdAt: new Date().toISOString(),
    status: 'pending_payment',
    currency,
    customer,
    lines: lines.map((l) => ({ productId: l.product.id, name: l.product.name, qty: l.qty, tier: l.tier.id, unit: l.unit, total: l.total })),
    total: lines.reduce((s, l) => s + l.total, 0),
    paymentMethod: null,
  };
}

/** Persist locally so a mother who closes the tab can find her booking ref again. */
export function saveOrder(order) {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) || '[]').filter((o) => o.ref !== order.ref);
    all.unshift(order);
    localStorage.setItem(KEY, JSON.stringify(all.slice(0, 10)));
  } catch { /* storage unavailable */ }
}

/**
 * Hook for a future backend. Today InstaPay is confirmed manually over WhatsApp,
 * so this resolves immediately. Replace with:
 *   return fetch('/api/orders', { method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(order) }).then(r => r.json());
 */
export async function submitOrder(order) {
  return { ok: true, order };
}
