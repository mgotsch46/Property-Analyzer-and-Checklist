# Property Due-Diligence App

RenewEQ Slow Flip deal analyzer + due diligence checklist + PDF export.
Anyone can open the page. The live property research runs in each user's
own Claude account, so there is no AI key or cost on this server.

## How a user runs a deal
1. Open the page and fill in the inputs. The same fixed set of inputs shows
   every time, all starting blank. Nothing is required up front: every result
   in the Deal Analysis says exactly which inputs it still needs, and those
   boxes are highlighted. Blank Make-ready, BOG, Servicing and Buyer down
   count as $0 (noted under the results).
2. Click **Copy request for Claude** and paste it into a chat in their own
   Claude account (web search on). The request carries their inputs and the
   exact JSON format to reply in.
3. Paste Claude's whole reply into the box and click **Fill the analyzer**,
   or click the link Claude gives back (`#r=` + base64url JSON).

Work in progress is kept in that browser (localStorage) until
**Start over (clear)**. Updating `index.html` here updates the instructions
for every user at once; nothing to install on their side.

## Server extras (optional)

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
