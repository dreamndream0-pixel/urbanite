# Urbanite Project Context

## Project

This repository is the production codebase for the Urbanite / Goodnight Girls shopping cart site.

GitHub repository:
https://github.com/dreamndream0-pixel/urbanite

Production site:
https://urbanite-tw.vercel.app

Current Vercel project:
urbanite

Primary branch:
main

## Current State

The app is a standard Next.js project prepared for Vercel deployment.

It currently includes:

- Product storefront page
- Product variant selectors for color, size, and quantity
- Related product add-ons
- Cart drawer
- Checkout summary UI
- Admin view for orders, inventory, revenue stats, and campaign settings

The current data is frontend mock data. It is not yet connected to a production database, payment provider, shipping provider, or authentication system.

## Commands

Install dependencies:

```bash
npm install
```

Run locally:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Push changes:

```bash
git push github main
```

## Deployment

The recommended production stack is:

- GitHub for source control
- Vercel for hosting
- Supabase or Neon Postgres for the production database

Vercel should deploy automatically when changes are pushed to `main`, assuming the GitHub repository remains connected in Vercel.

## Important Notes

- Do not commit `.vercel`, `.env`, or secrets.
- Use `.env.example` as the template for future environment variables.
- The production URL alias is `urbanite-tw.vercel.app`.
- A previous alias request for `urbanite.vercel.app` failed because that alias was already in use outside the current Vercel team.

## Next Development Steps

Recommended next tasks:

1. Add a real database schema for products, variants, inventory, orders, customers, and payments.
2. Add admin authentication and permissions.
3. Replace mock product/order data with API routes backed by the database.
4. Connect a payment provider.
5. Add shipping and invoice integrations.
6. Add order confirmation email.
7. Disable Vercel deployment protection if the storefront should be publicly accessible to customers.
