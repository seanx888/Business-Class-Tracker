// Countries whose Google Flights / airline site can be asked "what does this cost if I pay there?" (point of sale).
// The daily scan reads its own list from config/routes.json (pos.markets); the live search and the app use this one.
export const HOME_MARKET = { country: 'TW', currency: 'TWD' };

export const POS_MARKETS = [
  { country: 'VN', currency: 'VND' },
  { country: 'TH', currency: 'THB' },
  { country: 'PH', currency: 'PHP' },
  { country: 'ID', currency: 'IDR' },
  { country: 'MY', currency: 'MYR' },
  { country: 'SG', currency: 'SGD' },
  { country: 'KR', currency: 'KRW' },
  { country: 'JP', currency: 'JPY' },
  { country: 'IN', currency: 'INR' },
  { country: 'US', currency: 'USD' },
];

export const marketFor = (country) => POS_MARKETS.find((m) => m.country === String(country || '').toUpperCase()) || null;
