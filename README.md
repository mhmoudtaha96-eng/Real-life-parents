# Real Life Parents: course website

A bilingual (Arabic / English) landing site for **Real Life Parents** parenting workshops. It's static, fast and SEO-first. It is built from data files, so new courses and new payment methods can be added without redesigning anything.

- Arabic (RTL, default): `/`
- English: `/en/`
- Future courses: `/courses/<slug>/` and `/en/courses/<slug>/`

## Before going live: fill in the real details

| What | Where |
|---|---|
| Domain | `src/config/site.json` → `siteUrl` |
| WhatsApp number (digits only, e.g. `2010xxxxxxxx`) | `src/config/site.json` → `contact.whatsapp` |
| InstaPay payment link, handle, account name | `src/config/site.json` → `payments.instapay` |
| InstaPay QR from the app (optional) | put the image in `src/assets/img/`, set `payments.instapay.qrImage` (if empty, a QR is generated from the link) |
| Early-bird end date | `src/content/courses/mesh-kol-yom-khenaqa.json` → `pricing.tiers[0].until` |
| Shereen's photo | `src/assets/img/shereen.webp` + `src/content/instructors/shereen-gendy.json` → `photo` |
| GA4 / Meta Pixel / Search Console | `src/config/site.json` → `analytics`, `googleSiteVerification` |

Then run `npm run images` to regenerate the share images (needs Playwright).

## Build & run

```bash
node build.mjs                   # builds ./dist  (no npm install needed)
python3 -m http.server -d dist   # or: npm run serve
```

Deploy the `dist/` folder to **Cloudflare Pages** (build command `node build.mjs`, output `dist`) or Netlify. `_headers` and `_redirects` are already included for both.

## Project layout

```
build.mjs                     static site generator (plain Node, no framework)
src/config/site.json          domain, contacts, payment providers, analytics
src/content/courses/*.json    one file per course/workshop (AR + EN content, schedule, price tiers, FAQ, SEO)
src/content/instructors/*.json
src/content/i18n.json         interface text in both languages
src/templates/                page HTML, JSON-LD structured data, hero illustration
src/assets/css/main.css       design system (tokens at the top, light + dark)
src/assets/js/
  main.js                     price refresh, countdown, sticky bar, wiring
  checkout.js                 3-step checkout dialog
  commerce/cart.js            cart (multi-item ready)
  commerce/pricing.js         time-based price tiers (early bird → regular)
  commerce/order.js           order object + submitOrder() hook for a future backend
  payments/registry.js        payment-provider interface
  payments/providers/         instapay.js (live), card.js (stub for Paymob/Fawry/Kashier/Stripe)
  analytics.js                GA4 + Meta Pixel e-commerce events
scripts/make-images.mjs       favicons + Open Graph images
scripts/qr.mjs                QR generator (vendored MIT encoder, no dependency)
```

## Add a new course

1. Copy `src/content/courses/mesh-kol-yom-khenaqa.json` to `src/content/courses/<new-slug>.json`.
2. Change `id`, `slug`, content, schedule, and pricing. Set `status` to `open`, `soon` (listed, not bookable yet) or `draft` (not built).
3. To make it the home page, set `featuredCourse` in `site.json`. The old featured course moves to `/courses/<slug>/` automatically.
4. Run `node build.mjs`. The sitemap, hreflang tags and structured data update automatically.

## Moving to full e-commerce later

The checkout already works with a **cart → order → payment provider** model:

- **Card gateway (Paymob, Fawry, Kashier or Stripe):** implement `startCheckout()` in `payments/providers/card.js`. It calls a small server function (for example a Cloudflare Worker) that creates the payment session with the secret key and redirects. Then set `payments.card.enabled: true`.
- **Store orders:** replace `submitOrder()` in `commerce/order.js` with a `fetch('/api/orders')` call.
- **Bundles and multiple items:** `Cart` already supports several products. Add a cart page that uses `cart.lines()`.

## SEO included

- Server-rendered HTML in both languages, one `h1` per page, semantic sections
- `hreflang` (ar / en / x-default), canonical URLs, `sitemap.xml` with alternates, `robots.txt`
- JSON-LD: Organization, WebSite, WebPage, Person (credentials), Course + CourseInstance, EducationEvent (online, with offers), FAQPage, BreadcrumbList
- Open Graph and Twitter cards with 1200×630 images per language
- No framework, about 20 KB of JS loaded as modules, system-font fallbacks, cache headers

After launch, submit `https://<domain>/sitemap.xml` in Google Search Console and check the page with the Rich Results Test.
