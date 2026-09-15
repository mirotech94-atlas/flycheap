'use client';

import { useMemo } from 'react';
import { useGlobe } from '@/lib/globeStore';
import type { FlightHudPayload, FlightHudRoute } from '@/lib/flightHud';

function money(value: number | undefined): string {
  return typeof value === 'number'
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
    : '--';
}

function shortDate(value: string | undefined): string {
  if (!value) return '--';
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(date);
}

function routeLabel(route: FlightHudRoute): string {
  return `${route.origin} -> ${route.destination}`;
}

export function FlightConversationPanel() {
  const globe = useGlobe();
  const latest = globe.recentFlights[0];
  const routes = useMemo(
    () => globe.recentFlights.flatMap(item => item.routes.map(route => ({ item, route }))).slice(0, 10),
    [globe.recentFlights]
  );

  function activate(item: FlightHudPayload) {
    globe.recordFlightHud(item);
  }

  return (
    <section className="flight-conversation-panel motion-slide-up motion-delay-2" aria-label="Flight conversation HUD">
      <div className="flight-conversation-panel__globe" aria-hidden="true">
        <div className="flight-conversation-panel__sphere">
          <span className="flight-conversation-panel__orbit flight-conversation-panel__orbit--one" />
          <span className="flight-conversation-panel__orbit flight-conversation-panel__orbit--two" />
          <span className="flight-conversation-panel__orbit flight-conversation-panel__orbit--three" />
          {routes.slice(0, 6).map(({ route }, index) => (
            <span
              key={`${route.id}-${index}`}
              className="flight-conversation-panel__pin"
              style={{
                left: `${22 + (index * 13) % 58}%`,
                top: `${26 + (index * 19) % 48}%`,
              }}
              title={routeLabel(route)}
            />
          ))}
        </div>
      </div>

      <div className="flight-conversation-panel__body">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="eyebrow text-brand-600">Voice flight HUD</div>
            <h2 className="!mb-0 text-slate-900 dark:text-slate-100">Recent flight conversations</h2>
          </div>
          <div className="hidden md:grid grid-cols-3 gap-2 min-w-[320px]">
            <div className="flight-conversation-panel__stat">
              <span>Routes</span>
              <strong>{latest?.stats.count ?? 0}</strong>
            </div>
            <div className="flight-conversation-panel__stat">
              <span>Best</span>
              <strong>{money(latest?.stats.bestPerAdultUsd)}</strong>
            </div>
            <div className="flight-conversation-panel__stat">
              <span>Average</span>
              <strong>{money(latest?.stats.averagePerAdultUsd)}</strong>
            </div>
          </div>
        </div>

        {routes.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-200/70 dark:border-slate-700">
                  <th className="py-2 pr-3 font-semibold">Route</th>
                  <th className="py-2 pr-3 font-semibold">Dates</th>
                  <th className="py-2 pr-3 font-semibold">Flights</th>
                  <th className="py-2 pr-3 font-semibold text-right">Per adult</th>
                  <th className="py-2 pr-3 font-semibold text-right">Party</th>
                  <th className="py-2 pl-3 font-semibold text-right">HUD</th>
                </tr>
              </thead>
              <tbody>
                {routes.map(({ item, route }, index) => (
                  <tr key={`${item.id}-${route.id}-${index}`} className="border-b border-slate-100 dark:border-slate-800 last:border-0">
                    <td className="py-2.5 pr-3 font-semibold text-slate-900 dark:text-slate-100">{routeLabel(route)}</td>
                    <td className="py-2.5 pr-3 text-slate-600 dark:text-slate-300">
                      {shortDate(route.outboundDate)} {'->'} {shortDate(route.returnDate)}
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-xs text-slate-500">
                      {route.outboundFlightNo || '--'} / {route.returnFlightNo || '--'}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular font-semibold text-emerald-700">{money(route.perAdultUsd)}</td>
                    <td className="py-2.5 pr-3 text-right tabular text-slate-700 dark:text-slate-200">{money(route.partyTotalUsd)}</td>
                    <td className="py-2.5 pl-3 text-right">
                      <button
                        type="button"
                        onClick={() => activate(item)}
                        className="inline-flex items-center justify-center rounded-full border border-brand/25 px-3 py-1 text-xs font-semibold text-brand-700 hover:bg-brand/5"
                      >
                        Focus
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-4 text-sm text-slate-500 dark:text-slate-400">
            Ask FarePilot about a route or fare and this screen will keep the flight cards here.
          </div>
        )}
      </div>
    </section>
  );
}
