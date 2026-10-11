// Thin wrapper over GA4 (gtag) and Meta Pixel (fbq). Both are optional; calls are no-ops when absent.
// Standard e-commerce event names are used so future reports/ads optimisation work out of the box.
const META = { begin_checkout: 'InitiateCheckout', add_payment_info: 'AddPaymentInfo', generate_lead: 'Lead', view_item: 'ViewContent' };

export function track(event, params = {}) {
  try { window.gtag?.('event', event, params); } catch { /* ignore */ }
  try { if (META[event]) window.fbq?.('track', META[event], { value: params.value, currency: params.currency }); } catch { /* ignore */ }
}
