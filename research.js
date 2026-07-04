// Research backend. FREE with no key: Census geocode + FEMA flood.
// OPTIONAL keys (each independent, key-optional):
//   GEMINI_API_KEY  -> Google Gemini (free tier) + Google Search: fills the whole
//                      report autonomously (property summary, PIN, legal, MLS/list
//                      price, comps, sale comps, tax, millage, crime, photos).
//   RENTCAST_API_KEY-> structured beds/baths/sqft, rent AVM, property tax, owner.
const enc = encodeURIComponent;

async function jget(url, opts) {
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error(url.split('?')[0] + ' -> HTTP ' + r.status);
  return r.json();
}

async function geocode(full) {
  const url = 'https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress?address=' +
    enc(full) + '&benchmark=Public_AR_Current&vintage=Current_Current&format=json';
  try {
    const j = await jget(url);
    const m = j.result && j.result.addressMatches && j.result.addressMatches[0];
    if (!m) return null;
    const g = m.geographies || {};
    const county = (g.Counties && g.Counties[0] && g.Counties[0].NAME) || null;
    return { matched: m.matchedAddress, lat: m.coordinates.y, lng: m.coordinates.x, county };
  } catch (e) { return null; }
}

async function floodZone(lat, lng) {
  const url = 'https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query' +
    '?geometry=' + lng + ',' + lat + '&geometryType=esriGeometryPoint&inSR=4326' +
    '&spatialRel=esriSpatialRelIntersects&outFields=FLD_ZONE,ZONE_SUBTY,SFHA_TF&returnGeometry=false&f=json';
  try {
    const j = await jget(url);
    const a = j.features && j.features[0] && j.features[0].attributes;
    if (!a) return null;
    const sfha = a.SFHA_TF === 'T';
    return {
      text: 'Zone ' + a.FLD_ZONE + (a.ZONE_SUBTY ? ' (' + a.ZONE_SUBTY + ')' : '') +
        (sfha ? ' — IN a Special Flood Hazard Area; flood insurance typically required.'
              : ' — not in a Special Flood Hazard Area; flood insurance not federally required.')
    };
  } catch (e) { return null; }
}

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
  } catch (e) {}
  try {
    const rent = await jget('https://api.rentcast.io/v1/avm/rent/long-term?address=' + enc(full), h);
    if (rent && rent.rent) {
      out.rentMid = Math.round(rent.rent);
      out.rentLow = Math.round(rent.rentRangeLow || rent.rent * 0.9);
      out.rentHigh = Math.round(rent.rentRangeHigh || rent.rent * 1.1);
    }
  } catch (e) {}
  return out;
}

// Google Gemini (free tier) with Google Search grounding.
async function gemini(full, dealType) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const prompt =
    'You are a real-estate due-diligence researcher. Use web search to research the US property at "' + full + '".' +
    ' Return ONLY a JSON object (no markdown fences, no prose) with these keys, using null when unknown:' +
    ' beds, baths, sqft, built, lot, style, owner, terms, condition, pin, legal, mls, listPrice, curTax, millage,' +
    ' delinquent, crime, rentLow, rentMid, rentHigh, rentComps, saleComps, compsNote, photos.' +
    ' rentLow/rentMid/rentHigh and millage must be numbers. rentComps is an array of [source, figure] pairs.' +
    ' saleComps is an array of [bd/ba, size, price, status]. photos is an array of direct image URLs.' +
    ' compsNote is a short market analysis + investor takeaway + sources. Deal type: ' + (dealType || 'slow flip') + '.';
  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const searchTool = /1\.5/.test(model) ? { google_search_retrieval: {} } : { google_search: {} };
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + key;
  const body = { contents: [{ parts: [{ text: prompt }] }], tools: [searchTool] };
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json();
    const c = j.candidates && j.candidates[0];
    let txt = c && c.content && c.content.parts ? c.content.parts.map(p => p.text || '').join('') : '';
    if (!txt) return { _err: (j.error && j.error.message) || 'no gemini text' };
    txt = txt.replace(/```json/gi, '').replace(/```/g, '').trim();
    const a = txt.indexOf('{'), b = txt.lastIndexOf('}');
    if (a < 0 || b < 0) return { _err: 'gemini returned non-JSON' };
    return JSON.parse(txt.slice(a, b + 1));
  } catch (e) { return { _err: e.message }; }
}

function insuranceEstimate(value) {
  const dwell = value && value > 0 ? Math.min(value, 250000) : 50000;
  const annual = Math.max(600, dwell / 1000 * 12 + 300);
  return { annual: Math.round(annual), monthly: +(annual / 12).toFixed(2) };
}

async function runResearch({ address, city, state, zip, full, dealType }) {
  const st = (state || '').toUpperCase();
  const zip5 = (zip || '').replace(/\D/g, '').slice(0, 5);

  const geo = await geocode(full);
  const flood = geo ? await floodZone(geo.lat, geo.lng) : null;
  const rc = await rentcast(full);
  const gem = await gemini(full, dealType);
  const gemOk = gem && !gem._err;
  const G = gemOk ? gem : {};

  const taxAnnual = (rc && rc.taxAnnual) || null;
  const ins = insuranceEstimate(taxAnnual ? taxAnnual * 60 : null);

  const pick = (a, b) => (a !== undefined && a !== null && a !== '') ? a : b;

  return {
    ok: true,
    address: full, matched: geo ? geo.matched : null, county: geo ? geo.county : null,
    lat: geo ? geo.lat : null, lng: geo ? geo.lng : null,

    // property (RentCast structured wins, else Gemini)
    beds: pick(rc && rc.beds, G.beds), baths: pick(rc && rc.baths, G.baths),
    sqft: pick(rc && rc.sqft, G.sqft), built: pick(rc && rc.built, G.built),
    lot: pick(rc && rc.lot, G.lot), style: pick(G.style, null),
    owner: pick(rc && rc.owner, G.owner), terms: pick(G.terms, null), condition: pick(G.condition, null),
    pin: pick(rc && rc.pin, G.pin), legal: pick(G.legal, null),
    mls: pick(G.mls, null), listPrice: pick(G.listPrice, null),

    // flood: FEMA authoritative
    flood: flood ? flood.text : pick(G.flood, null),
    floodUrl: 'https://msc.fema.gov/portal/search?AddressQuery=' + enc(full),

    crime: pick(G.crime, null),
    crimeUrl: zip5 ? ('https://crimegrade.org/safest-places-in-' + zip5 + '/') : 'https://crimegrade.org/',

    // rent (RentCast AVM wins, else Gemini)
    rentLow: pick(rc && rc.rentLow, G.rentLow),
    rentMid: pick(rc && rc.rentMid, G.rentMid),
    rentHigh: pick(rc && rc.rentHigh, G.rentHigh),
    rentComps: Array.isArray(G.rentComps) ? G.rentComps : null,
    saleComps: Array.isArray(G.saleComps) ? G.saleComps : null,
    compsNote: pick(G.compsNote, null),
    photos: Array.isArray(G.photos) ? G.photos : null,

    taxAnnual: taxAnnual, taxMonthly: (rc && rc.taxMonthly) || null,
    curTax: pick(G.curTax, taxAnnual ? ('$' + taxAnnual + '/yr') : null),
    millage: (G.millage != null ? G.millage : null),
    delinquent: pick(G.delinquent, null),
    insMonthly: ins.monthly, insAnnual: ins.annual,

    countyRecordsUrl: 'https://publicrecords.netronline.com/state/' + st,
    listingSearchUrl: 'https://www.google.com/search?q=' + enc(full + ' for sale'),
    rentcastUrl: 'https://app.rentcast.io/app?address=' + enc(full),

    rentcastActive: !!process.env.RENTCAST_API_KEY,
    geminiActive: !!process.env.GEMINI_API_KEY,
    geminiError: gem && gem._err ? gem._err : null
  };
}

module.exports = { runResearch };
