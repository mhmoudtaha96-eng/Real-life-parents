// Placeholder for a future card gateway (Paymob, Fawry, Kashier, Stripe…).
// Enable in src/config/site.json → payments.card.enabled = true once implemented.
//
// Typical implementation:
//   startCheckout: async ({ order }) => {
//     const res = await fetch('/api/checkout', { method: 'POST', body: JSON.stringify(order) });
//     const { redirectUrl } = await res.json();   // created server-side with the gateway's secret key
//     location.href = redirectUrl;                 // gateway calls your webhook → order marked paid
//   }
import { el, icon } from '../../ui/dom.js';

export const card = {
  id: 'card',
  confirmMode: 'redirect',
  icon: icon('card'),
  label: (s) => s.card.label,
  hint: (s) => s.card.hint,
  render: ({ strings }) => el('p', { class: 'ip-note' }, strings.card.hint),
  async startCheckout() { throw new Error('Card payments are not configured yet.'); },
};
