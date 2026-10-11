// Pricing rules shared by every product.
// A product has `pricing.tiers` ordered by time; the first tier whose `until` is in the future is active.

export function activeTier(product, now = new Date()) {
  const tiers = product.pricing.tiers;
  return tiers.find((t) => !t.until || new Date(t.until) > now) || tiers[tiers.length - 1];
}

export function regularTier(product) {
  const tiers = product.pricing.tiers;
  return tiers[tiers.length - 1];
}

export function formatMoney(amount, { locale, currencyLabel }) {
  const n = new Intl.NumberFormat(locale, { useGrouping: false }).format(amount);
  return `${n} ${currencyLabel}`;
}
