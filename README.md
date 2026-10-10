# OJEHLC E-CART (React + Supabase)
Online shop with customer accounts, cart, checkout (pay on delivery or bank transfer), order tracking, and an admin area (products with pictures, orders, sales overview).

## Setup
1. Create a Supabase project. In **SQL Editor**, run `supabase/schema.sql` once.
2. Copy `.env.example` to `.env` and fill in your Project URL and anon key (never the service_role key). Optional: `VITE_CURRENCY` (default NGN) and `VITE_BANK_DETAILS`.
3. `npm install` then `npm run dev`.
4. **Create your account first: the first account becomes the admin.** Then use the *Admin* link to add products.
5. Authentication > Providers > Email: turn "Confirm email" off while testing if you do not want email links.
6. Deploy: push to GitHub and import in Netlify or Vercel (Vite), add the same environment variables, and set Supabase Authentication > URL Configuration > Site URL to your live address.

## How it is protected
Prices, totals, stock and order status are handled by database functions, not the browser, so customers cannot change prices or give themselves admin rights. Only admins can edit products, upload pictures and update orders.

## Not included yet
Online card payment (Paystack/Flutterwave must be confirmed by a server function, never by the browser), email/SMS notifications, discount codes, product variants, delivery fees.
