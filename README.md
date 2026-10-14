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
| Early-bird end date, prices, dates | Admin page → **Courses** → Edit |
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

## Add a new course (no code needed)

Courses and 1-to-1 settings are edited in the admin page: `/admin/` → **Courses** and **1-to-1 sessions**.

- **+ Add new course** opens a form already filled in from course #1. Change the web address, dates, prices and any text that's different, then save. New courses are saved hidden.
- Tick **Show on website** to publish a course, untick to hide it. **Home page** chooses the course on the main page; other visible courses get `/courses/<slug>/` and are listed on the home page.
- **Preview page** shows the page before saving. The sitemap, hreflang tags and structured data update by themselves.
- The pages are rendered by `worker/index.js` from the database (`courses` and `settings` tables) using the same templates as the build, so Google gets full HTML.
- `src/content/courses/*.json` and `src/content/sessions/one-to-one.json` are only the **starting content**: they are copied into the database the first time it is empty. After that, edit in the admin page, not in the files.
- New courses use the generic social-sharing image (`og-ar.png` / `og-en.png`).

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

## 1-to-1 session booking page

- Pages: `/book-session/` (Arabic) and `/en/book-session/` (English).
- Availability: `src/content/sessions/one-to-one.json`. All times are Cairo time (start times of 60-minute sessions).
  - `weekly`: repeating slots per weekday (`sat` … `fri`). Currently Monday to Thursday, 17:00, 18:00 and 19:00.
  - `extraSlots`: one-off extra times on specific dates. `blockedDates`: days off (workshop days are blocked).
  - `booking.daysAhead` sets how far ahead people can book. `booking.minNoticeHours` sets the minimum notice.
  - `price.amount` and `price.discountRules` set the price and the workshop discount (30%, first session only, valid 30 days after the workshop).
- Booked times are saved in the database and disappear from the calendar automatically.
- Unpaid 1-to-1 bookings release their time after 24 hours.

## Bookings database and admin page

See **SETUP-DATABASE.md**. In short:

- Every booking is saved in a Cloudflare D1 database: workshop registrations and 1-to-1 sessions, each with the name, WhatsApp number, country, child's age, biggest challenge, amount and discount.
- Admin page: `https://<your-site>/admin/`, protected by the `ADMIN_PASSWORD` secret.
  - You can search, filter, mark bookings Paid or Cancelled, add notes and export to CSV (Excel).
  - A workshop booking marked **Paid** unlocks the 30% session discount for that WhatsApp number.
- Code: `worker/index.js` (API). The price and schedule data it uses is generated by `node build.mjs` into `worker/catalog.generated.json`.

## Coach photo, album and video

- Coach data: `src/content/instructors/shereen-gendy.json`. It holds `photo`, the `media.album` items and `media.video`.
- Video: `media.video.instagram` is the reel ID and plays inside the page. To drop the Instagram frame, put an MP4 in `src/assets/video/` and set `media.video.mp4` (and an optional `poster`).
