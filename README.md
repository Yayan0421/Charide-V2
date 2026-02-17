Charide V2
===========

This repo contains three services:
- `admin/` — admin frontend + server
- `ChaRide(driver)/` — driver frontend + server
- `Charide(passenger)/` — passenger frontend + server
- `server/` — optional unified API

Deploy notes
------------
1. Create a GitHub repo and push this folder.
2. On Render create three web services (or static sites) pointing to the respective subfolders.
3. Set environment variables on Render (server services only):
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (server only)
   - `CORS_ORIGIN`
   - Any other keys (see `.env.sample`)

Local quick start
-----------------
```powershell
cd "C:\Users\wenif\Desktop\CHARIDE V2"
# ensure .env exists with values for local testing
# install and run each service
cd admin
npm install
node server/index.js
# in other terminals, run driver and passenger servers
```

Security
--------
- Do NOT commit `.env` or your `SUPABASE_SERVICE_ROLE_KEY`.
- Keep service role key in server env only.
