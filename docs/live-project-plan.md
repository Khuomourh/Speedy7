# Speedy7 Live Project Plan

This project has now moved from a static preview toward a live app foundation.

## Completed foundation

- The preview still runs in VS Code with `node server.js`.
- `server.js` now exposes local API endpoints under `/api`.
- `server.js` now reads `.env` and connects to the active Supabase `SPEEDY7` project.
- The app loads the live parts catalog from Supabase when connected.
- `data/seed.json` stores the starter catalog, vehicles, quotes, schema labels, and metrics.
- `data/local-state.json` stores local app activity while we build full Auth.
- Local app activity mirrors to Supabase `app_intake_events` when server credentials are available.
- The browser app now saves car registrations, quote requests, assistant replies, orders, admin compatibility links, and stock uploads through the local API.
- The browser app shows whether Speedy7 is running in local mode or Supabase mode.
- `supabase/schema.sql` is tightened for real app security: customer data has RLS, Data API grants are explicit, user role changes are server-only, and foreign keys have supporting indexes.
- The starter Supabase catalog has 8 categories, 9 parts, 9 stock rows, 3 suppliers, and VIN/engine compatibility links.

## Next live steps

1. Add real auth for customers, shop assistants, and admin.
2. Move car registrations, quote requests, orders, and assistant replies from intake events into the structured Supabase tables.
3. Connect photo upload to Supabase Storage.
4. Add owner/admin screens for approving assistant quotes and managing stock.
5. Put the project on GitHub.
6. Deploy the running app to Vercel.
7. Add WhatsApp/Facebook workflows for lead intake and assistant quote notifications.

## Notes

The local API is intentionally simple. It gives us a running project now, while keeping the path clear for full Supabase Auth, WhatsApp, Facebook, GitHub, and Vercel integration.
