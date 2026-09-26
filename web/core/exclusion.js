// China / Hong Kong / Macau exclusion filter.
//
// Policy (strict, fail-closed):
//   ✗ any segment marketed OR operated by a carrier based in CN / HK / MO
//   ✗ any departure, arrival, layover or technical stop at a CN / HK / MO airport
//   ✗ any airport whose country cannot be verified (unknown ⇒ rejected)
//   ✓ China Airlines (CI, 中華航空) is Taiwanese and allowed.

import { isBlockedCarrierCode, isBlockedCarrierName, BLOCKED_CARRIERS } from './airlines.js';
import { airportCountry, CHINA_REGION_COUNTRIES } from './airports.js';

const BLOCKED_PLACE_NAME = /(hong\s?kong|macau|macao|香港|澳門|中國大陸|mainland china)/i;

function checkAirport(code, providedCountry, name, extra, failClosed, reasons, where) {
  const country = (providedCountry || airportCountry(code, extra) || '').toUpperCase() || null;
  if (country && CHINA_REGION_COUNTRIES.has(country)) {
    reasons.push({ type: 'AIRPORT', code, detail: `${where} ${code} (${country})` });
    return;
  }
  // A provider-supplied country must agree with our own knowledge of blocked airports.
  const known = airportCountry(code, extra);
  if (known && CHINA_REGION_COUNTRIES.has(known)) {
    reasons.push({ type: 'AIRPORT', code, detail: `${where} ${code} (${known})` });
    return;
  }
  if (name && BLOCKED_PLACE_NAME.test(name)) {
    reasons.push({ type: 'AIRPORT', code, detail: `${where} ${name}` });
    return;
  }
  if (!country && failClosed) {
    reasons.push({ type: 'UNVERIFIED', code: code || '?', detail: `${where} ${code || '?'} country unknown` });
  }
}

function checkCarrier(code, name, role, reasons) {
  if (code && isBlockedCarrierCode(code)) {
    reasons.push({ type: 'CARRIER', code, detail: `${role} ${code} ${BLOCKED_CARRIERS[code.toUpperCase()]}` });
  } else if (name && isBlockedCarrierName(name)) {
    reasons.push({ type: 'CARRIER', code: code || name, detail: `${role} ${name}` });
  }
}

/**
 * @param {object} itin normalized itinerary ({ legs: [{ segments, layovers }] })
 * @param {object} [opts]
 * @param {Map|object} [opts.countries] extra IATA → ISO country map (OurAirports / provider)
 * @param {boolean} [opts.failClosed=true] reject airports whose country is unknown
 * @returns {{ ok: boolean, category: 'ok'|'china'|'unverified', reasons: object[] }}
 */
export function checkItinerary(itin, opts = {}) {
  const { countries = null, failClosed = true } = opts;
  const reasons = [];
  const legs = itin?.legs || [];
  if (!legs.length || legs.some((l) => !l?.segments?.length)) {
    return { ok: false, category: 'unverified', reasons: [{ type: 'UNVERIFIED', code: '-', detail: 'empty itinerary' }] };
  }
  for (const leg of legs) {
    for (const s of leg.segments) {
      checkCarrier(s.carrier, s.carrierName, 'marketed by', reasons);
      checkCarrier(s.operatingCarrier, s.operatingName, 'operated by', reasons);
      checkAirport(s.from, s.fromCountry, s.fromName, countries, failClosed, reasons, 'departs');
      checkAirport(s.to, s.toCountry, s.toName, countries, failClosed, reasons, 'arrives');
      for (const st of s.stops || []) {
        checkAirport(st.airport, st.country, st.name, countries, failClosed, reasons, 'tech stop');
      }
    }
    for (const l of leg.layovers || []) {
      checkAirport(l.airport, l.country, l.name, countries, failClosed, reasons, 'layover');
    }
  }
  const china = reasons.some((r) => r.type !== 'UNVERIFIED');
  return {
    ok: reasons.length === 0,
    category: reasons.length === 0 ? 'ok' : china ? 'china' : 'unverified',
    reasons,
  };
}

// Convenience for the browser's defence-in-depth re-check of published deals.
export function isChinaFree(itin, countries) {
  return checkItinerary(itin, { countries, failClosed: false }).ok;
}
