import 'server-only';

// Minimal IATA → (lat, lng) for the airports we care about. Extend as needed.
// Source: openflights public data. Coordinates rounded to 4 decimals.
const COORDS: Record<string, [number, number]> = {
  JFK: [40.6398, -73.7789],
  EWR: [40.6925, -74.1687],
  LGA: [40.7773, -73.8726],
  BOS: [42.3656, -71.0096],
  PHL: [39.8729, -75.2437],
  LAX: [33.9425, -118.4081],
  ORD: [41.9786, -87.9048],
  IAD: [38.9531, -77.4565],
  MIA: [25.7959, -80.2870],
  ATL: [33.6407, -84.4277],
  CAI: [30.1219, 31.4056],
  LHR: [51.4706, -0.4619],
  CDG: [49.0097, 2.5479],
  DXB: [25.2532, 55.3657],
  IST: [41.2750, 28.7519],
  AMS: [52.3105, 4.7683],
  FRA: [50.0379, 8.5622],
  MAD: [40.4839, -3.5680],
  BCN: [41.2974, 2.0833],
  FCO: [41.8003, 12.2389],
  // Generic "NYC" / "LON" city codes used by Aviasales cache endpoints.
  NYC: [40.7128, -74.0060],
  LON: [51.5074, -0.1278],
  PAR: [48.8566, 2.3522],
};

const R_KM = 6371; // Earth radius
function toRad(d: number) { return (d * Math.PI) / 180; }

/** Great-circle distance in km between two IATA codes. 0 if either is unknown. */
export function distanceKm(a: string, b: string): number {
  const A = COORDS[a.toUpperCase()];
  const B = COORDS[b.toUpperCase()];
  if (!A || !B) return 0;
  const dLat = toRad(B[0] - A[0]);
  const dLng = toRad(B[1] - A[1]);
  const lat1 = toRad(A[0]);
  const lat2 = toRad(B[0]);
  const h = Math.sin(dLat / 2) ** 2 +
            Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Estimated CO₂ kg per passenger for a one-way segment of a given distance,
 * using a rough industry blend (90 g CO₂e per km economy short-haul, 75 g/km
 * long-haul because of cruise-efficiency, with a +9% radiative-forcing adder).
 * The number is intentionally conservative — useful for "1.4 t per person
 * round-trip" framing, not for accounting.
 */
export function co2KgPerPax(distanceKm: number): number {
  if (distanceKm <= 0) return 0;
  const longHaul = distanceKm > 3700;
  const gPerKm = longHaul ? 75 : 90;
  return Math.round((distanceKm * gPerKm * 1.09) / 1000);
}

/** Round-trip CO₂ for the whole party. */
export function partyCo2Kg(origin: string, destination: string, party: number): number {
  const d = distanceKm(origin, destination);
  if (d === 0) return 0;
  return co2KgPerPax(d) * 2 * party;
}
