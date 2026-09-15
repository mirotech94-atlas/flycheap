const THEMES = {
  ocean:    ['#0a3a6b', '#1a6ba0'],
  tropical: ['#0a5a3a', '#1a8b60'],
  sunset:   ['#5a2a0a', '#8b4a1a'],
  aurora:   ['#1a0a5a', '#3a1a8b'],
  desert:   ['#5a3a0a', '#8b5a1a'],
  crimson:  ['#5a0a0a', '#8b2a1a'],
  midnight: ['#0a0a3a', '#1a2a6b'],
  sage:     ['#1a3a1a', '#2a6b2a'],
} as const;

type Theme = keyof typeof THEMES;

const IATA_THEME: Record<string, Theme> = {
  // US East
  ATL: 'crimson', JFK: 'ocean',  LGA: 'ocean',  EWR: 'ocean',
  BOS: 'ocean',   IAD: 'ocean',  BWI: 'ocean',  PHL: 'ocean',
  MIA: 'tropical', MCO: 'tropical', TPA: 'tropical', FLL: 'tropical',
  // US Midwest & South
  ORD: 'midnight', MDW: 'midnight', DTW: 'midnight', MSP: 'midnight',
  DFW: 'desert',  IAH: 'desert',  DEN: 'aurora',  CLT: 'ocean',
  BNA: 'sage',    MSY: 'tropical', STL: 'midnight', CMH: 'midnight',
  // US West
  LAX: 'sunset',  SFO: 'sage',   SEA: 'sage',   PDX: 'sage',
  LAS: 'sunset',  PHX: 'desert', SAN: 'sunset',  SLC: 'aurora',
  // US Hawaii
  HNL: 'tropical', OGG: 'tropical',
  // Canada
  YYZ: 'midnight', YUL: 'aurora',  YVR: 'sage',   YYC: 'aurora',
  // Mexico & Caribbean
  MEX: 'desert',  CUN: 'tropical', GDL: 'desert', MBJ: 'tropical',
  // UK & Ireland
  LHR: 'ocean',  LGW: 'ocean',  MAN: 'ocean',  DUB: 'sage',
  // Western Europe
  CDG: 'aurora',  ORY: 'aurora', FCO: 'crimson', ROM: 'crimson',
  MAD: 'desert',  BCN: 'crimson', LIS: 'sunset', AMS: 'midnight',
  BRU: 'midnight', FRA: 'midnight', MUC: 'midnight', HAM: 'midnight',
  ZRH: 'aurora',  GVA: 'aurora', VIE: 'aurora',
  // Northern Europe
  CPH: 'sage',   ARN: 'sage',   HEL: 'sage',   OSL: 'sage',
  // Eastern & Southern Europe
  ATH: 'crimson', IST: 'desert', PRG: 'aurora', WAW: 'midnight',
  BUD: 'aurora',  SOF: 'aurora',
  // Middle East
  DXB: 'desert',  AUH: 'desert', DOH: 'desert', RUH: 'desert',
  JED: 'desert',  MCT: 'desert', KWI: 'desert',
  // Africa
  CAI: 'desert',  ADD: 'sage',   NBO: 'tropical', JNB: 'desert',
  CPT: 'ocean',   LOS: 'tropical', CMN: 'desert',
  // South Asia
  DEL: 'desert',  BOM: 'sunset',  BLR: 'tropical', MAA: 'tropical',
  CMB: 'tropical', DAC: 'tropical',
  // East & SE Asia
  SIN: 'tropical', KUL: 'tropical', BKK: 'tropical', CGK: 'tropical',
  HKG: 'midnight', NRT: 'ocean',   HND: 'ocean',   ICN: 'midnight',
  PEK: 'midnight', SHA: 'midnight',
  // Oceania
  SYD: 'sage',   MEL: 'sage',   AKL: 'sage',   BNE: 'sage',
  // South America
  GRU: 'tropical', GIG: 'tropical', BOG: 'tropical', LIM: 'desert',
  EZE: 'midnight', SCL: 'desert',
};

const THEME_KEYS = Object.keys(THEMES) as Theme[];

export function getCityGradient(iata: string): { from: string; to: string } {
  const theme =
    IATA_THEME[iata] ??
    THEME_KEYS[
      ((iata.charCodeAt(0) ?? 65) * 31 +
        (iata.charCodeAt(1) ?? 65) * 7 +
        (iata.charCodeAt(2) ?? 65)) %
        THEME_KEYS.length
    ];
  const [from, to] = THEMES[theme];
  return { from, to };
}
