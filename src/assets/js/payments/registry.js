/**
 * Payment provider registry.
 *
 * A provider is an object:
 * {
 *   id: 'instapay',
 *   icon: '<svg…>',                       // optional
 *   label(strings) / hint(strings),       // text for the method picker
 *   render(ctx) -> HTMLElement,           // what the customer sees after choosing this method
 *   confirmMode: 'manual' | 'redirect',   // manual = customer sends proof (InstaPay, wallets);
 *                                         // redirect = hosted checkout (Paymob, Fawry, Stripe…)
 *   startCheckout?(ctx) -> Promise,       // for 'redirect' providers: create a payment session and redirect
 * }
 * ctx = { order, config (from site.json → payments[id]), strings, lang, locale, money(n) }
 *
 * To add a gateway later: create providers/<name>.js, register it in providers/index.js,
 * and enable it in src/config/site.json.
 */
const providers = new Map();

export function registerProvider(p) { providers.set(p.id, p); }

export function availableProviders(paymentsConfig) {
  return [...providers.values()]
    .filter((p) => paymentsConfig[p.id])
    .map((p) => ({ provider: p, config: paymentsConfig[p.id], enabled: !!paymentsConfig[p.id].enabled }));
}
