# RenewEQ — Property Due-Diligence App

One-click property research + Slow Flip deal analyzer + PDF export.
Front-end is served by a small Node/Express backend. The **RUN** button
calls `/api/run`, which pulls data and fills the compiled report.

## Runs today with NO API key
Out of the box it uses free sources:
- **US Census geocoder** — validates the address, returns county + lat/lng
- **FEMA National Flood Hazard Layer** — flood zone / SFHA status

Everything else (beds/baths/sqft, rent comps, property tax, owner, PIN)
appears in the report's TO-DO checklist with a lookup link until you add
a data key. Nothing breaks without one.

## Optional: turn on comps, rent & tax (RentCast)
Set one environment variable and it lights up automatically:

    RENTCAST_API_KEY = your_key_here

Get a key at https://app.rentcast.io (free tier available). No code change needed.

## Deploy to Railway
1. Push this folder to a GitHub repo.
2. Railway -> New Project -> Deploy from GitHub repo -> pick this repo.
3. Railway auto-detects Node and runs `npm start`.
4. (Optional) Project -> Variables -> add `RENTCAST_API_KEY`.
5. Open the generated URL. Done.

## Run locally
    npm install
    npm start
    # open http://localhost:3000

## Files
- `server.js` — Express server + `/api/run` endpoint
- `lib/research.js` — data integrations (Census, FEMA, optional RentCast)
- `public/index.html` — the tool (inputs, deal analyzer, report, PDF, calendar)

## Honest limits
BS&A parcel/PIN/liens, MLS listing, and chain of title have no public API —
they stay as confirm-tasks with links. A paid records API can close some of
that later.
