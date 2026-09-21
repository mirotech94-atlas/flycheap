'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { fmtDate, fmtRelative, fmtUSD, bookingLink } from '@/lib/utils';
import { SearchActions } from './SearchActions';
import { Sparkline } from './Sparkline';
import { useToast } from './Toaster';
import { buildPartnerLink, routeIdFor } from '@/lib/partnerLink';

type Search = {
  id: number;
  active: number;
  origin: string;
  destination: string;
  depart_date: string;
  date_mode?: 'exact' | 'any' | null;
  return_date: string;
  adults: number;
  infants: number;
  created_at: string;
  snoozed_until: string | null;
};

export type SearchEnrichment = {
  perAdultUsd: number | null;
  partyTotalUsd: number | null;
  threshold: number;
  history: Array<{ polled_at: string; price_per_adult_usd: number }>;
};

// /go redirect wrapper — every Book button must route through /go so the
// click hits affiliate_clicks before the external redirect. Mirrors the
// helper in src/app/page.tsx so we don't duplicate the route contract.
function trackedBookHref(s: Search, perAdultUsd: number): string {
  const dest = bookingLink({
    origin: s.origin, destination: s.destination,
    departDate: s.depart_date, returnDate: s.return_date,
    adults: s.adults, infants: s.infants,
  });
  return buildPartnerLink({
    partner: 'aviasales', product: 'flight', deeplink: dest,
    context: {
      surface: 'searches-tracked-table',
      routeId: routeIdFor({
        origin: s.origin, destination: s.destination,
        departDate: s.depart_date, returnDate: s.return_date,
      }),
      priceShownUsd: perAdultUsd,
    },
  });
}

/**
 * Drag-to-reorder watchlist. Uses the HTML5 DnD API (no extra dep). Sends a
 * PUT /api/searches/reorder with the new id sequence on drop.
 *
 * Drag handle is the leftmost cell — click anywhere else still passes through
 * to its child (e.g. the action buttons).
 */
export function DraggableSearchList({
  searches,
  enrichment = {},
}: {
  searches: Search[];
  /** Optional per-search current fare + 30d history. When provided, the list
   *  renders Sparkline + Book per row. Without it, the row is action-only. */
  enrichment?: Record<number, SearchEnrichment>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [, start] = useTransition();
  const [order, setOrder] = useState<number[]>(searches.map(s => s.id));
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [overId, setOverId] = useState<number | null>(null);
  const dirtyRef = useRef(false);

  const byId = new Map(searches.map(s => [s.id, s]));
  const ordered = order.map(id => byId.get(id)).filter(Boolean) as Search[];

  function onDragStart(e: React.DragEvent, id: number) {
    setDraggingId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(id));
  }
  function onDragOver(e: React.DragEvent, id: number) {
    e.preventDefault();
    if (draggingId == null || id === draggingId) return;
    setOverId(id);
  }
  function onDrop(e: React.DragEvent, dropId: number) {
    e.preventDefault();
    if (draggingId == null || draggingId === dropId) { reset(); return; }
    const next = [...order];
    const from = next.indexOf(draggingId);
    const to = next.indexOf(dropId);
    if (from < 0 || to < 0) { reset(); return; }
    next.splice(from, 1);
    next.splice(to, 0, draggingId);
    setOrder(next);
    dirtyRef.current = true;
    reset();
    void persist(next);
  }
  function reset() { setDraggingId(null); setOverId(null); }

  async function persist(ids: number[]) {
    try {
      const r = await fetch('/api/searches/reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        toast.error('Reorder failed', typeof j.error === 'string' ? j.error : `HTTP ${r.status}`);
        return;
      }
      toast.success('Order saved');
      start(() => router.refresh());
    } catch (e) {
      toast.error('Reorder failed', (e as Error).message);
    }
  }

  if (ordered.length === 0) return null;

  return (
    <table className="ed-table">
      <thead>
        <tr>
          <th className="w-6" />
          <th>#</th>
          <th>Status</th>
          <th>Route</th>
          <th>Dates</th>
          <th>Party</th>
          <th className="num">Per adult</th>
          <th className="num">30d price history</th>
          <th>Created</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {ordered.map(s => {
          const isDragging = draggingId === s.id;
          const isOver = overId === s.id;
          const en = enrichment[s.id];
          const fare = en?.perAdultUsd ?? null;
          const under = fare != null && en && fare < en.threshold;
          const hist = en?.history ?? [];
          return (
            <tr
              key={s.id}
              draggable
              onDragStart={(e) => onDragStart(e, s.id)}
              onDragOver={(e) => onDragOver(e, s.id)}
              onDragLeave={() => setOverId(null)}
              onDrop={(e) => onDrop(e, s.id)}
              onDragEnd={reset}
              style={{
                opacity: isDragging ? 0.45 : 1,
                outline: isOver ? '2px dashed var(--accent)' : 'none',
                outlineOffset: -2,
                cursor: 'grab',
              }}
            >
              <td className="select-none" style={{ color: 'var(--muted-2)' }} title="Drag to reorder">⋮⋮</td>
              <td className="num" style={{ color: 'var(--muted)' }}>{s.id}</td>
              <td>
                {s.active === 1
                  ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span className="ed-dot" aria-hidden /> active</span>
                  : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--muted-2)' }}><span className="ed-dot" style={{ background: 'var(--muted-2)' }} aria-hidden /> paused</span>}
              </td>
              <td className="font-semibold whitespace-nowrap">{s.origin} → {s.destination}</td>
              <td className="whitespace-nowrap" style={{ color: 'var(--ink-soft)' }}>
                {s.date_mode === 'any' ? (
                  <span title="We scan every month and alert on the cheapest window">
                    Any dates · cheapest window
                  </span>
                ) : (
                  <>{fmtDate(s.depart_date)} → {fmtDate(s.return_date)}</>
                )}
              </td>
              <td className="whitespace-nowrap">{s.adults}A + {s.infants}I</td>
              <td className="num whitespace-nowrap">
                {fare != null ? (
                  <span style={under ? { color: 'var(--green)' } : undefined}>
                    {fmtUSD(fare)}
                    {under && <span className="ed-mono" style={{ marginLeft: 4, color: 'var(--green)' }}>below</span>}
                  </span>
                ) : <span style={{ color: 'var(--muted-2)' }}>—</span>}
              </td>
              <td className="text-right">
                {hist.length > 1 ? (
                  <div className="inline-block w-[132px]"><Sparkline data={hist} threshold={en?.threshold} showMinMax /></div>
                ) : <span className="text-xs" style={{ color: 'var(--muted-2)' }}>no data</span>}
              </td>
              <td className="whitespace-nowrap" style={{ color: 'var(--muted)' }}>{fmtRelative(s.created_at)}</td>
              <td className="cta">
                <div className="flex items-center gap-1.5 justify-end">
                  {fare != null && (
                    <a
                      href={trackedBookHref(s, fare)}
                      target="_blank"
                      rel="noopener noreferrer sponsored"
                      className="ed-btn ed-btn-row"
                      title={`Book ${s.origin} → ${s.destination} via Aviasales`}
                    >
                      Book →
                    </a>
                  )}
                  <SearchActions id={s.id} active={s.active === 1} snoozedUntil={s.snoozed_until} />
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
