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
 * Saves the booking on the server (worker/index.js → D1 database).
 * Returns { ok: true, order } or { ok: false, error }. error = 'offline' when the API isn't reachable
 * (e.g. the database isn't set up yet); the booking then continues on WhatsApp only.
 */
export async function submitOrder(payload) {
  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body.ok) return { ok: true, order: body.order };
    if ([400, 409, 429].includes(res.status)) return { ok: false, error: body.error || 'invalid', detail: body };
    return { ok: false, error: 'offline' };
  } catch {
    return { ok: false, error: 'offline' };
  }
}

/** Remembers which payment method she used (the team still confirms the transfer). */
export function claimPayment(ref, method) {
  try {
    fetch(`/api/orders/${encodeURIComponent(ref)}/payment`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ method }), keepalive: true,
    }).catch(() => {});
  } catch { /* ignore */ }
}
