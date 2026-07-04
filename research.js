// Research backend. Runs on FREE sources with no API key:
//   - US Census geocoder (address validation + lat/lng + county)
//   - FEMA National Flood Hazard Layer (flood zone)
// RentCast is OPTIONAL: only used if process.env.RENTCAST_API_KEY is set.
// Anything not obtainable is returned null and flagged in `needsConfirm`
// so the front-end shows it in the TO-DO checklist with a link.

const enc = encodeURIComponent;

async function jget(url, opts) {
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error(url.split('?')[0] + ' -> HTTP ' + r.status);
  return r.json();
}

async function geocode(full) {
  const base = 'https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress';
  const url = base + '?address=' + enc(full) +
    '&benchmark=Public_AR_Current&vintage=Current_Current&format=json';
  try {
    const j = await jget(url);
    const m = j.result && j.result.addressMatches && j.result.addressMatches[0];
    if (!m) return null;
    const g = m.geographies || {};
    const county = (g.Counties && g.Counties[0] && g.Counties[0].NAME) || null;
    return {
      matched: m.matchedAddress,
      lat: m.coordinates.y, lng: m.coordinates.x, county
    };
  } catch (e) { return null; }
}

async function floodZone(lat, lng) {
  const url = 'https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query' +
    '?geometry=' + lng + ',' + lat +
    '&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects' +
    '&outFields=FLD_ZONE,ZONE_SUBTY,SFHA_TF&returnGeometry=false&f=json';
  try {
    const j = await jget(url);
    const a = j.features && j.features[0] && j.features[0].attributes;
    if (!a) return null;
    const sfha = a.SFHA_TF === 'T';
    return {
      zone: a.FLD_ZONE,
      subtype: a.ZONE_SUBTY || null,
      sfha,
      text: 'Zone ' + a.FLD_ZONE + (a.ZONE_SUBTY ? ' (' + a.ZONE_SUBTY + ')' : '') +
            (sfha ? ' — IN a Special Flood Hazard Area; flood insurance typically required.'
                  : ' — not in a Special Flood Hazard Area; flood insurance not federally required.')
    };
  } catch (e) { return null; }
}

// OPTIONAL — only runs if a key is present. Safe no-op otherwise.
async function rentcast(full) {
  const key = process.env.RENTCAST_API_KEY;
  if (!key) return null;
  const h = { headers: { 'X-Api-Key': key, accept: 'application/json' } };
  const out = {};
  try {
    const p = await jget('https://api.rentcast.io/v1/properties?address=' + enc(full), h);
    const rec = Array.isArray(p) ? p[0] : p;
    if (rec) {
      out.beds = rec.bedrooms; out.baths = rec.bathrooms; out.sqft = rec.squareFootage;
      out.built = rec.yearBuilt; out.lot = rec.lotSize; out.pin = rec.assessorID || null;
      out.owner = rec.owner && rec.owner.names ? rec.owner.names.join(', ') : null;
      if (rec.propertyTaxes) {
        const yrs = Object.keys(rec.propertyTaxes).sort();
        const last = rec.propertyTaxes[yrs[yrs.length - 1]];
        if (last && last.total) { out.taxAnnual = last.total; out.taxMonthly = +(last.total / 12).toFixed(2); }
      }
    }
  } catch (e) { out._propErr = e.message; }
  try {
    const rent = await jget('https://api.rentcast.io/v1/avm/rent/long-term?address=' + enc(full), h);
    if (rent && rent.rent) {
      out.rentMid = Math.round(rent.rent);
      out.rentLow = Math.round(rent.rentRangeLow || rent.rent * 0.9);
      out.rentHigh = Math.round(rent.rentRangeHigh || rent.rent * 1.1);
    }
  } catch (e) { out._rentErr = e.message; }
  return out;
}

function insuranceEstimate(value) {
  // Rough landlord ACV estimate: $50k ACV / $1mm liability spec.
  const dwell = value && value > 0 ? Math.min(value, 250000) : 50000;
  const annual = Math.max(600, dwell / 1000 * 12 + 300);
  return { annual: Math.round(annual), monthly: +(annual / 12).toFixed(2) };
}

async function runResearch({ address, city, state, zip, full }) {
  const st = (state || '').toUpperCase();
  const zip5 = (zip || '').replace(/\D/g, '').slice(0, 5);
  const needsConfirm = [];

  const geo = await geocode(full);
  const flood = geo ? await floodZone(geo.lat, geo.lng) : null;
  const rc = await rentcast(full);

  if (!flood) needsConfirm.push('Flood zone (FEMA) — verify manually');
  if (!rc) {
    needsConfirm.push('Beds/baths/sqft, rent comps, property tax & owner — add RentCast key or look up');
  }

  const ins = insuranceEstimate(rc && rc.taxAnnual ? rc.taxAnnual * 60 : null);
  const rcastLink = 'https://app.rentcast.io/app?address=' + enc(full);

  return {
    ok: true,
    address: full,
    matched: geo ? geo.matched : null,
    county: geo ? geo.county : null,
    lat: geo ? geo.lat : null, lng: geo ? geo.lng : null,

    pin: (rc && rc.pin) || null,
    owner: (rc && rc.owner) || null,
    beds: (rc && rc.beds) || null,
    baths: (rc && rc.baths) || null,
    sqft: (rc && rc.sqft) || null,
    built: (rc && rc.built) || null,
    lot: (rc && rc.lot) || null,

    flood: flood ? flood.text : null,
    floodUrl: 'https://msc.fema.gov/portal/search?AddressQuery=' + enc(full),

    crime: null, // no free block-level crime API
    crimeUrl: zip5 ? ('https://crimegrade.org/safest-places-in-' + zip5 + '/')
                   : ('https://crimegrade.org/'),

    rentLow: (rc && rc.rentLow) || null,
    rentMid: (rc && rc.rentMid) || null,
    rentHigh: (rc && rc.rentHigh) || null,

    taxMonthly: (rc && rc.taxMonthly) || null,
    taxAnnual: (rc && rc.taxAnnual) || null,
    insMonthly: ins.monthly,
    insAnnual: ins.annual,

    // gated / no-API items — always confirm links
    countyRecordsUrl: 'https://publicrecords.netronline.com/state/' + st,
    listingSearchUrl: 'https://www.google.com/search?q=' + enc(full + ' for sale'),
    rentcastUrl: rcastLink,

    needsConfirm,
    rentcastActive: !!process.env.RENTCAST_API_KEY
  };
}

module.exports = { runResearch };
