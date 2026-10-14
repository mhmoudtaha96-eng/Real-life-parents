# Bookings database: one-time setup (about 5 minutes)

The site saves every booking in a Cloudflare **D1** database. You manage the bookings on the **admin page**. Do these steps once.

## 1. Create the database
1. Open the Cloudflare dashboard.
2. Go to **Storage & Databases → D1 SQL Database → Create Database**.
3. Name it `rlp-bookings` and click **Create**.
4. On the database page, copy the **Database ID** (a long code like `3f2a…`).

## 2. Paste the ID into `wrangler.jsonc`
In your GitHub repo, open `wrangler.jsonc` and click the ✏️ pencil to edit. Replace `PASTE-YOUR-D1-DATABASE-ID-HERE` with the ID you copied, then click **Commit changes**.

You don't need to create any tables. The site creates them by itself on the first booking.

## 3. Set the admin password
1. In Cloudflare, go to **Workers & Pages** and open the **real-life-parents** project.
2. Open **Settings → Variables and Secrets → Add**.
3. Set **Type** to **Secret**, **Variable name** to `ADMIN_PASSWORD`, and **Value** to a strong password of your choice.
4. Click **Save** (or **Deploy**).

## 4. Use the admin page
- Open `https://<your-site>/admin/` and sign in with that password. On the current address that's `https://….workers.dev/admin/`.
- **Workshop registrations** and **1-to-1 sessions** each have their own tab, with search, a status filter and **Export CSV**.
- When the money arrives, set the booking's status to **Paid**.
  - A paid workshop booking is what unlocks the 30% discount on the mother's first 1-to-1 session. It's matched by the same WhatsApp number, for sessions within 30 days after the workshop.
- **Cancelled** frees a 1-to-1 time. Unpaid 1-to-1 bookings are cancelled automatically after 24 hours.
- Click **Details** to read the mother's biggest challenge and to add an internal note.

You can also see the raw data in Cloudflare: **Storage & Databases → D1 → rlp-bookings**, then open the tables view, table `orders`.

## If the database isn't connected
The site keeps working. Bookings still go through InstaPay or bank transfer and WhatsApp, but they aren't saved, and the discount is confirmed by hand on WhatsApp.
