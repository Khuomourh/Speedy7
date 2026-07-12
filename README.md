# Speedy7 Live Project

Speedy7 is a running car-parts search and quote app for customers, shop assistants, and the business owner.

## Run in VS Code

1. Open this folder in VS Code: `D:\Speedy7`.
2. Open the VS Code terminal.
3. Run `node server.js`.
4. Open `http://127.0.0.1:5177/` in your browser.

You can also press `Ctrl+Shift+B` in VS Code and choose **Run Speedy7 App**.

If you prefer npm on Windows PowerShell, use `npm.cmd start` instead of `npm start`. PowerShell may block `npm.ps1` until script execution policy is changed.

You can also double-click `run-speedy7.bat` from this folder.

## What works now

- The app loads from a local Node server.
- The frontend calls local API routes under `/api`.
- The server reads `.env` and is connected to the active Supabase `SPEEDY7` project.
- Customers, shop assistants, and invited admins can authenticate through Supabase Auth.
- The live catalog now loads from Supabase when the connection is available.
- Starter fallback data still lives in `data/seed.json`.
- Local activity saves to `data/local-state.json` while we build full Auth.
- Local activity is mirrored into Supabase `app_intake_events` when the server key is available.
- Customer vehicle registration saves through the API.
- Quote requests save through the API.
- Shop assistant replies save through the API.
- Orders save through the API.
- Admin compatibility links save through the API.
- Stock uploads save through the API.

## Important files

- `index.html` - app screen layout.
- `styles.css` - Speedy7 design.
- `app.js` - browser interactions and API calls.
- `server.js` - local web server and API.
- `data/seed.json` - starter catalog and sample data.
- `data/local-state.json` - local saved activity, ignored by Git.
- `supabase/schema.sql` - live Supabase database structure, indexes, and RLS policies.
- `docs/live-project-plan.md` - next steps toward the live product.

## Supabase status

The active Supabase project is `SPEEDY7` (`tlalrgmnuxklikssvcoh`). The database has tables for users, vehicles, VIN/engine lookup, parts, stock, quotes, assistants, orders, social leads, audit events, and app intake events.

Local `.env` values are required for the server to connect:


```text
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ADMIN_INVITE_CODE=
PORT=5177
HOST=127.0.0.1
```

Keep `SUPABASE_SERVICE_ROLE_KEY` on the server only. Do not paste it into browser code.

Set `ADMIN_INVITE_CODE` to a private value before creating an admin account from the app. Customer and shop assistant accounts can be created without that code.

The next build step is moving authenticated app actions directly into the structured Supabase tables instead of the temporary intake table.

## Deploying to Vercel

The app includes `api/[...path].js` so Vercel can run the Speedy7 API as serverless functions. Before deploying, add the same `.env` values above as Vercel project environment variables. Never commit `.env`.
