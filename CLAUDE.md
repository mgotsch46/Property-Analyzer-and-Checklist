# Slow Flip Deal Analyzer and Due Diligence Checklist

Public property due diligence tool. Owner: Marisa Gotsch (RenewEQ).

## Stack
- Node.js 18+, Express, single page app in `index.html`, no build step
- Deployed on Railway (project "Property Analyzer and Checklist"), repo `mgotsch46/Property-Analyzer-and-Checklist`
- `server.js` entry point, `research.js` holds the external lookups

## How it works
- Anyone can open the page. There is no AI key and no AI cost on this server.
- The user fills a fixed set of inputs, clicks "Copy request for Claude", pastes it into their own Claude account, then pastes the reply back or clicks the returned `#r=` base64url link.
- Work in progress is kept in the browser via localStorage until "Start over (clear)".

## Product rules that must not be broken
- The same fixed set of inputs shows every time, all starting blank.
- Nothing is required up front. Every result states exactly which inputs it still needs and highlights those boxes.
- Blank Make-ready, BOG, Servicing and Buyer down count as $0, and the results say so.
- Buy closing costs display as a percentage plus the dollar amount, with the costs itemized.
- This shared version carries no RenewEQ branding. It is just "Slow Flip Deal Analyzer".
- Instructions are written for a complete beginner. Keep the reading level very low.

## Data sources
- US Census geocoder for address validation, county, lat/lng (free)
- FEMA National Flood Hazard Layer for flood zone and SFHA status (free)
- RentCast is optional: set the env var and comps, rent and tax light up automatically. Nothing may break when it is absent.

## Working agreements
- Editing `index.html` updates the instructions for every user at once. Treat copy changes as a release.
- Never commit `.env` or API keys.
- Railway auto deploys from `main`.
