/**
 * Synthetic hotel dataset for the /hotels page.
 *
 * Why this exists:
 *   Hotellook's public cache.json was retired for non-partners (returns 404
 *   on engine.hotellook.com). Until we wire a real per-hotel inventory API,
 *   the Kayak-style UX (filter rail, sort dropdown, map markers, provider
 *   comparison) needs a per-hotel data shape: name, lat/lng, price, rating,
 *   stars, amenities, distance from city center.
 *
 *   Re-tested 2026-05-18 from prod: every Hotellook public endpoint —
 *     - engine.hotellook.com/api/v2/cache.json (with location= or locationId=)
 *     - engine.hotellook.com/api/v2/lookup.json
 *     - engine.hotellook.com/api/v2/static/hotels.json
 *     - yasen.hotellook.com/tp/public/lookup.json
 *     - api.hotellook.com/v2/cache.json
 *   returns 404, with and without ?token=$TRAVELPAYOUTS_TOKEN. The hotel
 *   data API is now gated behind Travelpayouts partner-tier approval; we
 *   stay on the mock generator until that approval lands. Per-card click-
 *   throughs still work fine — `hotellookLink()` deeplinks to
 *   search.hotellook.com (the user-facing search UI), which is unaffected.
 *
 *   This module generates that shape **deterministically** from the
 *   destination code so:
 *     - refresh is stable (same destination → same hotels)
 *     - filters and sort can be tested without a real API
 *     - swapping to a real API later is a one-file change (drop the mock,
 *       export `getHotels(...)` from a real fetcher, keep the type).
 *
 * Provider prices: spec licenses mocking. Booking +5%, Hotels.com +8%,
 * Expedia +10% over the base Hotellook price.
 *
 * Amenity inference: when a hotel name/tag contains "Resort & Spa",
 * "All-inclusive", "Beach", etc, those amenity flags are set. See
 * AMENITY_RULES below.
 */

export const MOCK_HOTELS = true as const;

export type HotelAmenity =
  | 'all-inclusive'
  | 'pool'
  | 'beach'
  | 'breakfast'
  | 'wifi'
  | 'family'
  | 'spa'
  | 'shuttle';

export const ALL_AMENITIES: ReadonlyArray<{ id: HotelAmenity; label: string }> = [
  { id: 'all-inclusive', label: 'All-inclusive' },
  { id: 'pool', label: 'Pool' },
  { id: 'beach', label: 'Beach access' },
  { id: 'breakfast', label: 'Free breakfast' },
  { id: 'wifi', label: 'WiFi' },
  { id: 'family', label: 'Family-friendly' },
  { id: 'spa', label: 'Spa' },
  { id: 'shuttle', label: 'Airport shuttle' },
];

export type HotelProviderQuote = {
  provider: 'hotellook' | 'booking' | 'hotelscom' | 'expedia' | 'agoda' | 'trip';
  label: string;
  price: number;
};

export type Hotel = {
  id: string;
  name: string;
  area: string;
  stars: 1 | 2 | 3 | 4 | 5;
  rating: number;          // 0–10 (Hotellook style)
  reviewCount: number;
  price: number;           // base price USD/night
  currency: 'USD';
  lat: number;
  lng: number;
  distanceKm: number;      // from destination center
  amenities: HotelAmenity[];
  tagline: string;
  providerQuotes: HotelProviderQuote[];
};

// Destination center coordinates (used for map view + distance computation).
// Mirrors SatelliteExploreMap COORDS but extended with hotel-only destinations.
export const HOTEL_CITY_CENTERS: Record<string, { lat: number; lng: number; label: string }> = {
  CAI: { lat: 30.0444, lng: 31.2357, label: 'Cairo' },
  SSH: { lat: 27.9158, lng: 34.3300, label: 'Sharm El Sheikh' },
  HRG: { lat: 27.2579, lng: 33.8116, label: 'Hurghada' },
  RMF: { lat: 25.5571, lng: 34.5837, label: 'Marsa Alam' },
  LXR: { lat: 25.6872, lng: 32.6396, label: 'Luxor' },
  ASW: { lat: 24.0889, lng: 32.8998, label: 'Aswan' },
  HBE: { lat: 31.2001, lng: 29.9187, label: 'Alexandria' },
  MLE: { lat: 4.1755, lng: 73.5093, label: 'Maldives' },
  DPS: { lat: -8.4095, lng: 115.1889, label: 'Bali' },
  HKT: { lat: 7.8804, lng: 98.3923, label: 'Phuket' },
  CUN: { lat: 21.1619, lng: -86.8515, label: 'Cancun' },
  PUJ: { lat: 18.5601, lng: -68.3725, label: 'Punta Cana' },
  NAS: { lat: 25.0443, lng: -77.3504, label: 'Nassau' },
  OGG: { lat: 20.7984, lng: -156.3319, label: 'Maui' },
  HNL: { lat: 21.3099, lng: -157.8581, label: 'Honolulu' },
  JTR: { lat: 36.3932, lng: 25.4615, label: 'Santorini' },
  JMK: { lat: 37.4467, lng: 25.3289, label: 'Mykonos' },
  CFU: { lat: 39.6243, lng: 19.9217, label: 'Corfu' },
  HER: { lat: 35.3387, lng: 25.1442, label: 'Crete' },
  RHO: { lat: 36.4341, lng: 28.2176, label: 'Rhodes' },
  PMI: { lat: 39.5696, lng: 2.6502, label: 'Mallorca' },
  IBZ: { lat: 38.9067, lng: 1.4206, label: 'Ibiza' },
  TFS: { lat: 28.2916, lng: -16.6291, label: 'Tenerife' },
  AYT: { lat: 36.8969, lng: 30.7133, label: 'Antalya' },
  BJV: { lat: 37.0392, lng: 27.4305, label: 'Bodrum' },
  LCA: { lat: 34.9229, lng: 33.6233, label: 'Larnaca' },
  PFO: { lat: 34.7720, lng: 32.4297, label: 'Paphos' },
  DXB: { lat: 25.2048, lng: 55.2708, label: 'Dubai' },
  IST: { lat: 41.0082, lng: 28.9784, label: 'Istanbul' },
  LON: { lat: 51.5074, lng: -0.1278, label: 'London' },
  LHR: { lat: 51.5074, lng: -0.1278, label: 'London' },
  PAR: { lat: 48.8566, lng: 2.3522, label: 'Paris' },
  CDG: { lat: 48.8566, lng: 2.3522, label: 'Paris' },
  ROM: { lat: 41.9028, lng: 12.4964, label: 'Rome' },
  BCN: { lat: 41.3851, lng: 2.1734, label: 'Barcelona' },
  AMS: { lat: 52.3676, lng: 4.9041, label: 'Amsterdam' },
  NYC: { lat: 40.7128, lng: -74.0060, label: 'New York' },
  TYO: { lat: 35.6762, lng: 139.6503, label: 'Tokyo' },
  BKK: { lat: 13.7563, lng: 100.5018, label: 'Bangkok' },
  SIN: { lat: 1.3521, lng: 103.8198, label: 'Singapore' },
};

// Per-destination flavour: hotel-name building blocks + neighborhood seeds.
// Mediterranean and beach destinations skew toward "Resort", "Beach", "Spa";
// city destinations skew toward "Hotel", "Plaza", "House".
type Flavour = {
  prefixes: string[];
  suffixes: string[];
  areas: string[];
  beachy: boolean;
};
const FLAVOURS: Record<string, Flavour> = {
  CAI:  { prefixes: ['Nile', 'Cairo', 'Pyramids', 'Marriott', 'Four Seasons', 'Kempinski', 'Sofitel', 'Ramses', 'Tahrir'], suffixes: ['Hotel', 'Tower', 'Plaza', 'Palace', 'Residence', 'Garden'], areas: ['Downtown', 'Zamalek', 'Giza', 'Garden City', 'Maadi', 'Heliopolis', 'New Cairo'], beachy: false },
  SSH:  { prefixes: ['Royal', 'Reef', 'Coral', 'Sunrise', 'Rixos', 'Cleopatra', 'Savoy', 'Sultan', 'Hilton', 'Sheraton', 'Marriott'], suffixes: ['Resort & Spa', 'Beach Resort', 'All-Inclusive', 'Bay Resort', 'Garden', 'Palace', 'Dive Lodge'], areas: ['Naama Bay', 'Sharks Bay', 'Nabq Bay', 'Ras Um El Sid', 'Hadaba', 'Soho Square'], beachy: true },
  HRG:  { prefixes: ['Steigenberger', 'Albatros', 'Hurghada', 'Red Sea', 'Sunny Days', 'Jasmine', 'Sindbad', 'Hilton', 'Pickalbatros'], suffixes: ['Resort & Spa', 'Beach Resort', 'Aqua Park', 'Palace', 'Garden', 'All-Inclusive'], areas: ['El Mamsha', 'Sahl Hasheesh', 'Makadi Bay', 'Sakkala', 'Soma Bay'], beachy: true },
  RMF:  { prefixes: ['Marina', 'Concorde', 'Three Corners', 'Akassia', 'Steigenberger'], suffixes: ['Dive Resort', 'Bay Resort', 'Beach', 'Coral Garden'], areas: ['Port Ghalib', 'Abu Dabbab', 'El Quseir'], beachy: true },
  MLE:  { prefixes: ['Soneva', 'Anantara', 'Conrad', 'Six Senses', 'Velaa', 'Baros', 'Niyama', 'Velassaru'], suffixes: ['Maldives', 'Island Resort', 'Lagoon', 'Atoll', 'Overwater'], areas: ['North Malé Atoll', 'South Malé Atoll', 'Baa Atoll', 'Ari Atoll'], beachy: true },
  DPS:  { prefixes: ['Bisma', 'Padma', 'Hanging Gardens', 'Bulgari', 'Mandapa', 'Alila'], suffixes: ['Resort', 'Villas', 'Estate', 'Spa Retreat'], areas: ['Seminyak', 'Ubud', 'Canggu', 'Nusa Dua', 'Uluwatu'], beachy: true },
  CUN:  { prefixes: ['Hyatt', 'Iberostar', 'Live Aqua', 'Hard Rock', 'Riu', 'Excellence', 'Le Blanc'], suffixes: ['All-Inclusive', 'Resort & Spa', 'Cancun', 'Beach Resort'], areas: ['Hotel Zone', 'Punta Cancun', 'Punta Nizuc', 'Downtown'], beachy: true },
  PUJ:  { prefixes: ['Hard Rock', 'Iberostar', 'Riu', 'Majestic', 'Barceló', 'Excellence'], suffixes: ['All-Inclusive', 'Resort & Spa', 'Punta Cana'], areas: ['Bávaro', 'Cap Cana', 'Uvero Alto'], beachy: true },
  JTR:  { prefixes: ['Canaves', 'Grace', 'Astra', 'Mystique', 'Cavo Tagoo'], suffixes: ['Suites', 'Resort & Spa', 'Boutique', 'Caldera'], areas: ['Oia', 'Imerovigli', 'Fira', 'Firostefani'], beachy: true },
  JMK:  { prefixes: ['Cavo Tagoo', 'Belvedere', 'Bill & Coo', 'Myconian'], suffixes: ['Suites', 'Boutique', 'Resort & Spa'], areas: ['Mykonos Town', 'Ornos', 'Platis Gialos', 'Psarou'], beachy: true },
  DXB:  { prefixes: ['Atlantis', 'Burj Al Arab', 'Address', 'Jumeirah', 'Anantara', 'Rixos', 'FIVE'], suffixes: ['The Palm', 'Downtown', 'Beach Resort', 'Marina', 'Tower'], areas: ['Downtown Dubai', 'Marina', 'JBR', 'Palm Jumeirah', 'Business Bay', 'Deira'], beachy: true },
  IST:  { prefixes: ['Çırağan', 'Pera', 'Four Seasons', 'Shangri-La', 'Raffles', 'Ritz-Carlton'], suffixes: ['Palace', 'Hotel', 'Bosphorus', 'Istanbul'], areas: ['Sultanahmet', 'Beyoğlu', 'Şişli', 'Beşiktaş', 'Karaköy'], beachy: false },
  LON:  { prefixes: ['The Savoy', 'Claridge', 'Connaught', 'Langham', 'Rosewood', 'Hilton', 'Marriott'], suffixes: ['Hotel', 'London', 'House', 'Park'], areas: ['Mayfair', 'Covent Garden', 'Shoreditch', 'South Bank', 'Kensington', 'Camden'], beachy: false },
  LHR:  { prefixes: ['The Savoy', 'Claridge', 'Connaught', 'Langham', 'Rosewood', 'Hilton', 'Marriott'], suffixes: ['Hotel', 'London', 'House', 'Park'], areas: ['Mayfair', 'Covent Garden', 'Shoreditch', 'South Bank', 'Kensington', 'Camden'], beachy: false },
  PAR:  { prefixes: ['Le Bristol', 'Ritz', 'Plaza Athénée', 'Le Meurice', 'Shangri-La', 'Lutetia'], suffixes: ['Paris', 'Hotel', 'Palace'], areas: ['Le Marais', 'Saint-Germain', 'Montmartre', 'Latin Quarter', 'Champs-Élysées', 'Bastille'], beachy: false },
  CDG:  { prefixes: ['Le Bristol', 'Ritz', 'Plaza Athénée', 'Le Meurice', 'Shangri-La', 'Lutetia'], suffixes: ['Paris', 'Hotel', 'Palace'], areas: ['Le Marais', 'Saint-Germain', 'Montmartre', 'Latin Quarter', 'Champs-Élysées', 'Bastille'], beachy: false },
  BCN:  { prefixes: ['W', 'Hotel Arts', 'Mandarin Oriental', 'Majestic', 'Casa Fuster'], suffixes: ['Barcelona', 'Hotel', 'Boutique', 'Palace'], areas: ['Gothic Quarter', 'Eixample', 'Barceloneta', 'El Born', 'Gràcia', 'Poble-sec'], beachy: true },
  ROM:  { prefixes: ['Hassler', 'St. Regis', 'De Russie', 'Eden', 'Palazzo'], suffixes: ['Roma', 'Hotel', 'Palace'], areas: ['Centro Storico', 'Trastevere', 'Vaticano', 'Spagna', 'Monti'], beachy: false },
};
const GENERIC_FLAVOUR: Flavour = {
  prefixes: ['Grand', 'Royal', 'Central', 'Plaza', 'Hilton', 'Marriott', 'Sheraton', 'Sofitel'],
  suffixes: ['Hotel', 'Resort', 'Plaza', 'Tower', 'Garden'],
  areas: ['City Center', 'Old Town', 'Riverside', 'Business District', 'Beach', 'Airport'],
  beachy: false,
};

// Deterministic seeded PRNG so the same destination yields the same hotels.
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seedFromCode(code: string): number {
  let h = 2166136261;
  for (let i = 0; i < code.length; i++) {
    h ^= code.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Amenity inference rules — when no explicit amenity flags are present
 * (which is always the case here because the data is synthetic, but the
 * same rules apply if we later parse Hotellook hotel.description strings),
 * we look at the hotel's name + tagline for keywords.
 *
 *   "Resort & Spa"   → spa, pool, breakfast
 *   "All-Inclusive"  → all-inclusive, pool, breakfast, beach (if beachy dest)
 *   "Beach"          → beach, pool
 *   "Bay" / "Marina" → beach, pool
 *   "Palace"/"Grand" → spa, breakfast
 *   "Dive"           → beach, pool
 *   "Aqua Park"      → pool, family, beach
 *
 *   Family-friendly is inferred when the price is < median and stars >= 3
 *   ("affordable comfortable" — a common Kayak-style family filter heuristic).
 *
 *   WiFi is assumed for every 3★+ hotel (universal in 2026).
 *   Airport shuttle is set for hotels < 5km from city center OR explicit
 *   "Airport" area name.
 */
function inferAmenities(name: string, area: string, stars: number, distanceKm: number, price: number, medianPrice: number, beachy: boolean): HotelAmenity[] {
  const n = (name + ' ' + area).toLowerCase();
  const set = new Set<HotelAmenity>();
  if (n.includes('resort & spa') || n.includes('spa')) { set.add('spa'); set.add('pool'); set.add('breakfast'); }
  if (n.includes('all-inclusive')) { set.add('all-inclusive'); set.add('pool'); set.add('breakfast'); if (beachy) set.add('beach'); }
  if (n.includes('beach') || n.includes('bay') || n.includes('marina') || n.includes('reef') || n.includes('coral') || n.includes('lagoon') || n.includes('atoll') || n.includes('overwater')) {
    set.add('beach'); set.add('pool');
  }
  if (n.includes('palace') || n.includes('grand') || n.includes('plaza')) { set.add('breakfast'); if (stars >= 4) set.add('spa'); }
  if (n.includes('dive')) { set.add('beach'); set.add('pool'); }
  if (n.includes('aqua') || n.includes('aquapark')) { set.add('pool'); set.add('family'); set.add('beach'); }
  if (n.includes('garden') || n.includes('villa')) { set.add('pool'); }
  if (n.includes('airport') || distanceKm < 5) set.add('shuttle');
  if (stars >= 3) set.add('wifi');
  if (stars >= 3 && price < medianPrice) set.add('family');
  // Sun-and-sea destinations get pool/beach baseline.
  if (beachy && stars >= 3) { set.add('pool'); set.add('beach'); }
  return Array.from(set);
}

function buildProviderQuotes(base: number): HotelProviderQuote[] {
  // Every provider we support, cheapest first. Markups over the Hotellook
  // base are the documented mock fallback when only Hotellook returns a
  // real price — in production each provider returns its own quote.
  return [
    { provider: 'hotellook',  label: 'Hotellook',  price: Math.round(base) },
    { provider: 'agoda',      label: 'Agoda',      price: Math.round(base * 1.03) },
    { provider: 'booking',    label: 'Booking',    price: Math.round(base * 1.05) },
    { provider: 'trip',       label: 'Trip.com',   price: Math.round(base * 1.07) },
    { provider: 'hotelscom',  label: 'Hotels.com', price: Math.round(base * 1.08) },
    { provider: 'expedia',    label: 'Expedia',    price: Math.round(base * 1.10) },
  ];
}

const NIGHTLY_BASELINE: Record<string, number> = {
  CAI: 75, SSH: 95, HRG: 85, RMF: 110, LXR: 70, ASW: 65, HBE: 70,
  MLE: 480, DPS: 140, HKT: 110, CUN: 220, PUJ: 240, NAS: 280, OGG: 380, HNL: 320,
  JTR: 320, JMK: 380, CFU: 140, HER: 110, RHO: 120, PMI: 160, IBZ: 220,
  TFS: 130, AYT: 95, BJV: 140, LCA: 110, PFO: 110,
  DXB: 220, IST: 130, LON: 280, LHR: 280, PAR: 260, CDG: 260, ROM: 220, BCN: 200, AMS: 240,
  NYC: 320, TYO: 200, BKK: 90, SIN: 240,
};

export function getHotelsForDestination(destination: string, count = 18): Hotel[] {
  const code = destination.toUpperCase();
  const center = HOTEL_CITY_CENTERS[code];
  const flavour = FLAVOURS[code] ?? GENERIC_FLAVOUR;
  if (!center) return [];

  const rand = mulberry32(seedFromCode(code));
  const baseline = NIGHTLY_BASELINE[code] ?? 140;

  // First pass — generate raw price/coords/stars so we can compute median
  // (needed for the family-friendly amenity heuristic).
  const draft: Array<Omit<Hotel, 'amenities' | 'providerQuotes'>> = [];
  for (let i = 0; i < count; i++) {
    const stars = (rand() < 0.05 ? 2 : rand() < 0.25 ? 3 : rand() < 0.70 ? 4 : 5) as Hotel['stars'];
    const starMul = stars === 5 ? 1.8 : stars === 4 ? 1.15 : stars === 3 ? 0.75 : 0.5;
    const noise = 0.6 + rand() * 0.9;
    const price = Math.round(baseline * starMul * noise);
    const rating = Math.min(9.6, Math.max(6.2, 7.4 + (stars - 3) * 0.45 + (rand() - 0.5) * 1.2));
    const reviewCount = Math.round(80 + rand() * 2400);

    // Scatter hotels around city center: ~0–18 km, biased toward 1–5km.
    const distanceKm = +(Math.pow(rand(), 1.6) * 18).toFixed(1);
    const bearing = rand() * Math.PI * 2;
    // 1 degree latitude ≈ 111 km.
    const dLat = (distanceKm / 111) * Math.cos(bearing);
    const dLng = (distanceKm / (111 * Math.max(0.2, Math.cos((center.lat * Math.PI) / 180)))) * Math.sin(bearing);

    const prefix = flavour.prefixes[Math.floor(rand() * flavour.prefixes.length)];
    const suffix = flavour.suffixes[Math.floor(rand() * flavour.suffixes.length)];
    const area = flavour.areas[Math.floor(rand() * flavour.areas.length)];
    const name = `${prefix} ${suffix}`;
    const tagline = flavour.beachy
      ? ['Steps from the sand', 'Reef-house views', 'Sea-facing rooms', 'Walk to the marina', 'Pool + private beach'][Math.floor(rand() * 5)]
      : ['Walk to everything', 'Boutique stay', 'Skyline view', 'Quiet street, central', 'Local-favorite breakfast'][Math.floor(rand() * 5)];

    draft.push({
      id: `${code}-${i}-${prefix.replace(/\W/g, '')}`,
      name,
      area,
      stars,
      rating: +rating.toFixed(1),
      reviewCount,
      price,
      currency: 'USD',
      lat: +(center.lat + dLat).toFixed(5),
      lng: +(center.lng + dLng).toFixed(5),
      distanceKm,
      tagline,
    });
  }

  // Compute median price for the family-friendly heuristic.
  const sorted = [...draft].map(h => h.price).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] || baseline;

  return draft.map(h => ({
    ...h,
    amenities: inferAmenities(h.name, h.area, h.stars, h.distanceKm, h.price, median, flavour.beachy),
    providerQuotes: buildProviderQuotes(h.price),
  }));
}

/** Min/max price across the generated set — used to bound the filter rail's slider. */
export function priceBounds(hotels: Hotel[]): { min: number; max: number } {
  if (hotels.length === 0) return { min: 25, max: 1500 };
  let min = Infinity, max = -Infinity;
  for (const h of hotels) { if (h.price < min) min = h.price; if (h.price > max) max = h.price; }
  // Snap to $25 step.
  const snap = (v: number, dir: 'down' | 'up') => {
    const r = v / 25;
    return Math.max(25, Math.round(dir === 'down' ? Math.floor(r) : Math.ceil(r)) * 25);
  };
  return { min: snap(min, 'down'), max: snap(max, 'up') };
}
