'use client';

/**
 * Globe HUD shared state.
 *
 * The HUD is always-on, persistent across pages. Anything in the app — the
 * chat concierge, the offers explorer, the search results — can push focus
 * targets, arcs, and "telemetry" readouts into this store and the globe
 * reacts. For non-flight chat replies we still spin up synthetic readouts so
 * the persona feels coherent (the bot "lives" on the globe HUD).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { FlightHudPayload } from './flightHud';

export type GlobeArc = {
  id: string;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  /** USD price; drives color from green→red. */
  price?: number;
  label?: string;
};

export type GlobePoint = {
  id: string;
  lat: number;
  lng: number;
  iata?: string;
  label?: string;
  price?: number;
  /** 0..1 — pulse intensity */
  intensity?: number;
};

export type GlobeReadout = {
  id: string;
  label: string;
  value: string;
  /** Optional unit suffix shown smaller after value. */
  unit?: string;
};

export type GlobeState = {
  /** Camera focus target — globe rotates here on change. */
  focus?: { lat: number; lng: number; altitude?: number };
  arcs: GlobeArc[];
  points: GlobePoint[];
  readouts: GlobeReadout[];
  /** Status line ticked across the bottom of the HUD. */
  statusLine: string;
  /** Persona pulse trigger — increment to make the globe "react". */
  pulse: number;
  /** True while the bot voice is speaking; HUD scanlines speed up. */
  speaking: boolean;
  /** True while the user mic is open; HUD shows REC indicator. */
  listening: boolean;
  /** Flight questions promoted into the HUD, newest first. */
  recentFlights: FlightHudPayload[];
};

type Ctx = GlobeState & {
  setFocus: (lat: number, lng: number, altitude?: number) => void;
  setArcs: (arcs: GlobeArc[]) => void;
  setPoints: (points: GlobePoint[]) => void;
  setReadouts: (readouts: GlobeReadout[]) => void;
  setStatusLine: (line: string) => void;
  pushPulse: () => void;
  setSpeaking: (b: boolean) => void;
  setListening: (b: boolean) => void;
  recordFlightHud: (hud: FlightHudPayload) => void;
  /** One-shot helper used by the chat widget after a model reply. */
  reactToReply: (text: string) => void;
};

const GlobeContext = createContext<Ctx | null>(null);

// IATA → [lng, lat]. A trimmed table — enough for the cities the chat
// tends to mention.
const IATA: Record<string, [number, number]> = {
  NYC:[-74.0,40.7], JFK:[-73.78,40.64], EWR:[-74.17,40.69], LAX:[-118.41,33.94],
  MIA:[-80.29,25.79], ATL:[-84.43,33.64], SFO:[-122.37,37.62], SEA:[-122.31,47.45],
  LAS:[-115.15,36.08], BOS:[-71.0,42.36], ORD:[-87.91,41.97], YYZ:[-79.63,43.68],
  LON:[-0.13,51.5], LHR:[-0.45,51.47], PAR:[2.35,48.85], CDG:[2.55,49.0],
  AMS:[4.76,52.31], FRA:[8.57,50.04], BER:[13.5,52.36], MAD:[-3.57,40.49],
  BCN:[2.18,41.4], ROM:[12.49,41.89], FCO:[12.25,41.8], MIL:[9.19,45.46],
  ATH:[23.94,37.94], IST:[28.81,40.97], ZRH:[8.55,47.45], VIE:[16.57,48.11],
  DUB:[-6.27,53.42], LIS:[-9.13,38.78],
  CAI:[31.4,30.12], DXB:[55.36,25.25], DOH:[51.61,25.27], JED:[39.16,21.68],
  AUH:[54.65,24.43], RUH:[46.7,24.96], BEY:[35.49,33.82], TLV:[34.88,32.0],
  CMN:[-7.59,33.37], NBO:[36.93,-1.32], JNB:[28.24,-26.13], CPT:[18.6,-33.97],
  TYO:[139.78,35.55], NRT:[140.39,35.77], HND:[139.78,35.55], HKG:[113.92,22.31],
  BKK:[100.75,13.69], SIN:[103.99,1.36], DEL:[77.1,28.55], BOM:[72.86,19.09],
  ICN:[126.45,37.46], PEK:[116.59,40.07], SYD:[151.18,-33.94], MEL:[144.84,-37.67],
  GRU:[-46.47,-23.43], EZE:[-58.53,-34.82], LIM:[-77.11,-12.02], MEX:[-99.07,19.43],
};

export function iataToLatLng(code: string): [number, number] | null {
  const c = code.toUpperCase();
  if (IATA[c]) {
    const [lng, lat] = IATA[c];
    return [lat, lng];
  }
  return null;
}

const SYNTHETIC_LABELS = [
  'SIGNAL', 'TELEMETRY', 'UPLINK', 'CACHE', 'INDEX',
  'ENTROPY', 'VARIANCE', 'CONFIDENCE', 'LATENCY', 'THROUGHPUT',
];

const RECENT_FLIGHTS_KEY = 'egyptair-recent-flight-hud-v1';

/** Generate fake-but-plausible readouts so non-flight replies still animate the HUD. */
function syntheticReadouts(): GlobeReadout[] {
  const pick = (n: number) => {
    const out: string[] = [];
    const pool = [...SYNTHETIC_LABELS];
    for (let i = 0; i < n && pool.length; i++) {
      out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    }
    return out;
  };
  const labels = pick(4);
  return labels.map((label, i) => ({
    id: `syn-${label}-${i}`,
    label,
    value: (Math.random() * 100).toFixed(label === 'LATENCY' ? 0 : 2),
    unit: label === 'LATENCY' ? 'ms' : label === 'THROUGHPUT' ? 'k/s' : '%',
  }));
}

export function GlobeProvider({ children }: { children: ReactNode }) {
  const [focus, setFocusState] = useState<GlobeState['focus']>({ lat: 30.12, lng: 31.4, altitude: 2.4 });
  const [arcs, setArcsState] = useState<GlobeArc[]>([]);
  const [points, setPointsState] = useState<GlobePoint[]>([]);
  const [readouts, setReadoutsState] = useState<GlobeReadout[]>(syntheticReadouts());
  const [statusLine, setStatusLineState] = useState<string>('// CONCIERGE LINK ONLINE — AWAITING QUERY');
  const [pulse, setPulse] = useState(0);
  const [speaking, setSpeakingState] = useState(false);
  const [listening, setListeningState] = useState(false);
  const [recentFlights, setRecentFlights] = useState<FlightHudPayload[]>([]);

  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Idle telemetry: gently drift readout values so the HUD always feels alive.
  useEffect(() => {
    tickerRef.current = setInterval(() => {
      setReadoutsState(prev =>
        prev.map(r => {
          const n = parseFloat(r.value);
          if (!Number.isFinite(n)) return r;
          const drift = (Math.random() - 0.5) * 1.8;
          const next = Math.max(0, Math.min(r.unit === 'ms' ? 400 : 100, n + drift));
          return { ...r, value: next.toFixed(r.unit === 'ms' ? 0 : 2) };
        })
      );
    }, 1100);
    return () => { if (tickerRef.current) clearInterval(tickerRef.current); };
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENT_FLIGHTS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) setRecentFlights(parsed.slice(0, 12));
    } catch {
      /* ignore corrupt local HUD state */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(RECENT_FLIGHTS_KEY, JSON.stringify(recentFlights.slice(0, 12)));
    } catch {
      /* storage may be unavailable in private browsing */
    }
  }, [recentFlights]);

  const setFocus = useCallback((lat: number, lng: number, altitude?: number) => {
    setFocusState({ lat, lng, altitude: altitude ?? 2.2 });
  }, []);
  const setArcs = useCallback((a: GlobeArc[]) => setArcsState(a), []);
  const setPoints = useCallback((p: GlobePoint[]) => setPointsState(p), []);
  const setReadouts = useCallback((r: GlobeReadout[]) => setReadoutsState(r), []);
  const setStatusLine = useCallback((s: string) => setStatusLineState(s), []);
  const pushPulse = useCallback(() => setPulse(p => p + 1), []);
  const setSpeaking = useCallback((b: boolean) => setSpeakingState(b), []);
  const setListening = useCallback((b: boolean) => setListeningState(b), []);

  const recordFlightHud = useCallback((hud: FlightHudPayload) => {
    const routes = hud.routes.slice(0, 8);
    if (!routes.length) return;

    setRecentFlights(prev => {
      const next = [hud, ...prev.filter(item => item.id !== hud.id)];
      return next.slice(0, 12);
    });

    const points: GlobePoint[] = [];
    const arcs: GlobeArc[] = [];
    for (const route of routes) {
      const origin = IATA[route.origin];
      const destination = IATA[route.destination];
      if (!origin || !destination) continue;
      points.push({
        id: `hud-origin-${route.id}`,
        lat: origin[1],
        lng: origin[0],
        iata: route.origin,
        label: route.origin,
        price: route.perAdultUsd,
        intensity: 0.85,
      });
      points.push({
        id: `hud-dest-${route.id}`,
        lat: destination[1],
        lng: destination[0],
        iata: route.destination,
        label: route.destination,
        price: route.perAdultUsd,
        intensity: 1,
      });
      arcs.push({
        id: `hud-arc-${route.id}`,
        startLat: origin[1],
        startLng: origin[0],
        endLat: destination[1],
        endLng: destination[0],
        price: route.perAdultUsd,
        label: `${route.origin} -> ${route.destination}${route.perAdultUsd ? ` · $${Math.round(route.perAdultUsd)}` : ''}`,
      });
    }

    const firstRoute = routes[0];
    const destination = IATA[firstRoute.destination];
    if (destination) setFocusState({ lat: destination[1], lng: destination[0], altitude: 1.85 });
    setPointsState(points);
    setArcsState(arcs);
    setReadoutsState([
      { id: 'hud-count', label: 'ROUTES', value: String(hud.stats.count) },
      { id: 'hud-best', label: 'BEST', value: hud.stats.bestPerAdultUsd ? `$${Math.round(hud.stats.bestPerAdultUsd)}` : '--' },
      { id: 'hud-avg', label: 'AVG', value: hud.stats.averagePerAdultUsd ? `$${Math.round(hud.stats.averagePerAdultUsd)}` : '--' },
      { id: 'hud-cap', label: 'CAP', value: hud.stats.maxPerAdultFilter ? `$${Math.round(hud.stats.maxPerAdultFilter)}` : '--' },
    ]);
    setStatusLineState(`// FLIGHT HUD · ${routes[0].origin} TO ${routes[0].destination} · ${routes.length} ROUTE${routes.length === 1 ? '' : 'S'} LOADED`);
    setPulse(p => p + 1);
  }, []);

  /**
   * After every model reply, animate the HUD even if the question wasn't
   * about flights. Pull any IATA codes out of the text and arc to them;
   * otherwise spin synthetic stats. Keeps the persona consistent.
   */
  const reactToReply = useCallback((text: string) => {
    const codes = Array.from(text.matchAll(/\b([A-Z]{3})\b/g))
      .map(m => m[1])
      .filter(c => IATA[c]);
    const unique = Array.from(new Set(codes));

    if (unique.length >= 1) {
      const [lng, lat] = IATA[unique[0]];
      setFocusState({ lat, lng, altitude: 2.0 });
      setStatusLineState(`// ROUTING TO ${unique[0]} · ${unique.length} NODE${unique.length > 1 ? 'S' : ''} HIGHLIGHTED`);

      const newPoints: GlobePoint[] = unique.map((c, i) => ({
        id: `reply-${c}`,
        lat: IATA[c][1],
        lng: IATA[c][0],
        iata: c,
        intensity: 1 - i * 0.15,
      }));
      setPointsState(newPoints);

      // If 2+ codes, draw arcs between consecutive pairs.
      const newArcs: GlobeArc[] = [];
      for (let i = 0; i < unique.length - 1; i++) {
        const [aLng, aLat] = IATA[unique[i]];
        const [bLng, bLat] = IATA[unique[i + 1]];
        newArcs.push({
          id: `reply-arc-${i}`,
          startLat: aLat, startLng: aLng,
          endLat: bLat,   endLng: bLng,
          label: `${unique[i]} → ${unique[i + 1]}`,
        });
      }
      if (newArcs.length) setArcsState(newArcs);
    } else {
      // Non-flight reply — still animate. Synthetic telemetry.
      setReadoutsState(syntheticReadouts());
      setStatusLineState('// CONCIERGE TELEMETRY · ' + text.slice(0, 60).toUpperCase().replace(/[^A-Z0-9 .,!?-]/g, ''));
    }
    setPulse(p => p + 1);
  }, []);

  const value = useMemo<Ctx>(() => ({
    focus, arcs, points, readouts, statusLine, pulse, speaking, listening, recentFlights,
    setFocus, setArcs, setPoints, setReadouts, setStatusLine, pushPulse,
    setSpeaking, setListening, recordFlightHud, reactToReply,
  }), [focus, arcs, points, readouts, statusLine, pulse, speaking, listening, recentFlights,
      setFocus, setArcs, setPoints, setReadouts, setStatusLine, pushPulse,
      setSpeaking, setListening, recordFlightHud, reactToReply]);

  return <GlobeContext.Provider value={value}>{children}</GlobeContext.Provider>;
}

export function useGlobe(): Ctx {
  const ctx = useContext(GlobeContext);
  if (!ctx) throw new Error('useGlobe must be used inside <GlobeProvider>');
  return ctx;
}
