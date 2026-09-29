// Deep links that open a business-class search pre-filled on popular metasearch sites.
import { AIRLINES } from './airlines.js';

const yymmdd = (iso) => iso.slice(2, 4) + iso.slice(5, 7) + iso.slice(8, 10);

const CABIN_WORDS = { business: 'business class', first: 'first class', premium: 'premium economy', economy: 'economy' };

// `gl` (optional, ISO country) opens Google Flights as that country's market — used for foreign-site price checks.
export function googleFlightsUrl({ origin, destination, departDate, returnDate, currency = 'TWD', lang = 'zh-TW', gl, cabin = 'business' }) {
  const q = `Flights from ${origin} to ${destination} on ${departDate}` +
    (returnDate ? ` through ${returnDate}` : ' one way') + ` ${CABIN_WORDS[cabin] || CABIN_WORDS.business}`;
  const hl = lang.startsWith('zh') ? 'zh-TW' : lang.startsWith('ko') ? 'ko' : 'en';
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(q)}&curr=${currency}&hl=${hl}` + (gl ? `&gl=${String(gl).toUpperCase()}` : '');
}

export function skyscannerUrl({ origin, destination, departDate, returnDate, currency = 'TWD', lang = 'zh-TW' }) {
  const host = lang.startsWith('zh') ? 'www.skyscanner.com.tw' : lang.startsWith('ko') ? 'www.skyscanner.co.kr' : 'www.skyscanner.net';
  const path = `${origin.toLowerCase()}/${destination.toLowerCase()}/${yymmdd(departDate)}/` + (returnDate ? `${yymmdd(returnDate)}/` : '');
  return `https://${host}/transport/flights/${path}?adultsv2=1&cabinclass=business&rtn=${returnDate ? 1 : 0}&currency=${currency}`;
}

export function kayakUrl({ origin, destination, departDate, returnDate, lang = 'zh-TW' }) {
  const host = lang.startsWith('ko') ? 'www.kayak.co.kr' : 'www.kayak.com';
  return `https://${host}/flights/${origin}-${destination}/${departDate}` + (returnDate ? `/${returnDate}` : '') + '/business?sort=price_a';
}

export function airlineUrl(code) {
  return AIRLINES[code]?.url || null;
}

export function searchLinks(q) {
  return [
    { key: 'google', label: 'Google Flights', url: googleFlightsUrl(q) },
    { key: 'skyscanner', label: 'Skyscanner', url: skyscannerUrl(q) },
    { key: 'kayak', label: 'KAYAK', url: kayakUrl(q) },
  ];
}
