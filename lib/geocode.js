/**
 * Server-side geocoding (address → lat/lng) via OpenStreetMap Nominatim.
 *
 * Used when a vehicle is created/updated without coordinates, and by the
 * backfill endpoint. Runs on the server so we can send a proper User-Agent
 * (required by Nominatim's usage policy) and cache/throttle centrally.
 *
 * Japanese addresses often fail to match at full house-number precision, so we
 * try progressively broader forms:
 *   1. the full address
 *   2. the address with a trailing block/number removed
 *   3. just the city/ward token (○○市 / ○○区 / ○○町)
 *
 * Returns { lat, lng } or null.
 */

const UA = 'BestCarRental/1.0 (vehicle map geocoding)';

// Simple in-process cache so repeated identical addresses don't re-hit the API.
const cache = new Map();

function candidates(address) {
  const a = String(address || '').trim();
  if (!a) return [];
  const list = [a];

  // Drop a trailing block/number like "1840-1", "１２３", "3丁目5-1"
  const noNumber = a.replace(/[\s　]*[0-9０-９]+([\-‐-‒–—―ー－]?[0-9０-９]+)*(号|番地?|丁目)?[^\p{L}]*$/u, '').trim();
  if (noNumber && noNumber !== a) list.push(noNumber);

  // Extract the city / ward / town token: "…○○市", "…○○区", "…○○町", "…○○村"
  const cityMatch = a.match(/([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー]{1,8}?[市区町村])/u);
  if (cityMatch && !list.includes(cityMatch[1])) list.push(cityMatch[1]);

  // Prefecture token as a last resort: "…○○都/道/府/県"
  const prefMatch = a.match(/([\p{Script=Han}]{2,4}[都道府県])/u);
  if (prefMatch && !list.includes(prefMatch[1])) list.push(prefMatch[1]);

  return [...new Set(list)];
}

async function queryNominatim(q) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=jp&accept-language=ja&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) return null;
  const data = await res.json();
  if (Array.isArray(data) && data[0]) {
    const lat = parseFloat(data[0].lat);
    const lng = parseFloat(data[0].lon);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  return null;
}

export async function geocodeAddress(address) {
  const key = String(address || '').trim().toLowerCase();
  if (!key) return null;
  if (cache.has(key)) return cache.get(key);

  let result = null;
  for (const q of candidates(address)) {
    try {
      result = await queryNominatim(q);
    } catch {
      result = null;
    }
    if (result) break;
    // Be polite to Nominatim between fallback attempts.
    await new Promise(r => setTimeout(r, 1100));
  }
  cache.set(key, result);
  return result;
}
