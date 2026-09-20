'use client';

import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { crossShopLinks } from '@/lib/utils';
import { buildPartnerLink, routeIdFor, type PartnerId } from '@/lib/partnerLink';
import { rankBookOptions } from '@/lib/bookPanel';
import type { AffiliateSurface } from '@/lib/affiliate';

type Opts = {
  origin: string;
  destination: string;
  departDate: string;
  returnDate: string;
  adults: number;
  infants: number;
  size?: 'sm' | 'md';
  onChecklist?: () => void;
  /** Per-adult USD price — feeds the click log so revenue analytics can
   *  weight clicks by deal value. Optional; falls through to 0 when unset. */
  perAdultUsd?: number;
  /** Surface tag for affiliate analytics. e.g. 'dashboard-cheapest-card'.
   *  Whitelisted in src/lib/affiliate.ts AFFILIATE_SURFACES. */
  surface?: string;
  /** Expected commission per click, per partner, DERIVED from our own history
   *  (see lib/bookPanelEpc.ts). Passed down from a server component. Absent
   *  means "we have not measured this yet" and the panel keeps its existing
   *  order rather than reshuffling on noise. */
  epc?: Record<string, number>;
  /** The alert this panel was opened from, when it descends from one. */
  alertId?: number | null;
};

const PROVIDER_KEY: Record<string, string> = {
  'Aviasales (cached)': 'aviasales',
  'Google Flights':     'google',
  'Kayak':              'kayak',
  'Skyscanner':         'skyscanner',
  'Momondo':            'momondo',
  'EgyptAir flights':   'egyptair',
};

/**
 * Wrap an outbound provider URL for click tracking.
 *
 * This used to hand-roll its own `/go?...` query, which made it a SECOND link
 * builder on the product's main conversion surface — so every Book-panel click
 * went out with no sub_id, no product and no position, and none of it appeared
 * in the funnel's segments. The hostname guard in tests/partner-links.test.ts
 * did not catch it, because the hostnames here come from crossShopLinks; the
 * test now also fails any hand-rolled `/go?` outside the builder.
 */
function trackedLink(rawHref: string, provider: string, opts: Opts, rank: number, optionName: string): string {
  return buildPartnerLink({
    partner: provider as PartnerId,
    product: 'flight',
    deeplink: rawHref,
    context: {
      surface: (opts.surface ?? 'dashboard-cheapest-card') as AffiliateSurface,
      routeId: routeIdFor({
        origin: opts.origin, destination: opts.destination,
        departDate: opts.departDate, returnDate: opts.returnDate,
      }),
      priceShownUsd: opts.perAdultUsd ?? null,
      alertId: opts.alertId ?? null,
      // Position in the list and which one was taken. This is how we learn
      // whether ordering by expected commission costs us clicks — the spec is
      // explicit that this is the reason to record it.
      optionRank: rank,
      optionName,
    },
  });
}

export function BookButton(opts: Opts) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Pixel position of the open dropdown, anchored to the trigger via fixed
  // coords. Portaling to <body> escapes any ancestor `overflow:hidden`
  // (e.g. the map popup, the explore hero) that would otherwise clip the
  // menu.
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    setMenuPos({ top: r.bottom + 6, right: window.innerWidth - r.right });
    function onScrollOrResize() {
      if (!triggerRef.current) return;
      const r2 = triggerRef.current.getBoundingClientRect();
      setMenuPos({ top: r2.bottom + 6, right: window.innerWidth - r2.right });
    }
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open]);

  // Order by expected commission among options within a small tolerance of the
  // cheapest — and, when prices are known, the cheapest still leads even if it
  // pays nothing. With no measured EPC the ranking is a no-op and the panel
  // keeps the order crossShopLinks gave it.
  const ranked = rankBookOptions(crossShopLinks(opts), {
    epc: opts.epc,
    keyOf: l => PROVIDER_KEY[l.name] ?? 'aviasales',
  });
  // Re-route every provider link through the one builder, carrying its rank.
  const links = ranked.map(l => ({
    ...l,
    href: trackedLink(l.href, PROVIDER_KEY[l.name] ?? 'aviasales', opts, l.rank, l.short),
  }));

  // Ref to the portaled menu so clicks inside it don't close it (the menu is
  // no longer a DOM descendant of `ref` since we portal it to <body>).
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      const insideTrigger = ref.current?.contains(t);
      const insideMenu = menuRef.current?.contains(t);
      if (!insideTrigger && !insideMenu) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const sizeClass = opts.size === 'sm' ? 'text-xs' : 'text-sm';

  return (
    <div ref={ref} className="relative inline-flex">
      {/* Single click-trigger: opens the provider dropdown. The default
          provider (Aviasales) is just the first item — no separate primary
          link button alongside, per user feedback. */}
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => { e.preventDefault(); setOpen(o => !o); }}
        className={`btn btn-primary ${sizeClass} inline-flex items-center gap-1.5`}
        aria-label="Book — pick a provider"
        aria-expanded={open}
        title="Pick which company to book through"
      >
        <span>Book</span>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && mounted && menuPos && createPortal(
        <div
          ref={menuRef}
          className="fc-book-menu fixed w-60 rounded-xl shadow-lift border border-slate-200/30 dark:border-white/15 overflow-hidden"
          style={{
            top: menuPos.top,
            right: menuPos.right,
            // Sit above every other portal in the app (autocomplete z:9999,
            // theme dropdown z:10001, etc.). The visual is a translucent
            // glass-tinted card so siblings show through faintly — looks
            // layered instead of like a hard overlay.
            zIndex: 999999,
            background: 'rgba(10, 20, 38, 0.78)',
            backdropFilter: 'blur(18px) saturate(140%)',
            WebkitBackdropFilter: 'blur(18px) saturate(140%)',
            color: '#e8ecf4',
          }}
        >
          <div className="px-3 py-2 text-[10px] uppercase tracking-[0.14em] font-semibold text-slate-500 border-b border-slate-100 dark:border-slate-800">
            Compare same itinerary on
          </div>
          {links.map(l => {
            const isEgyptair = (PROVIDER_KEY[l.name] ?? '') === 'egyptair';
            return (
              <a
                key={l.name}
                href={l.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-2.5 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60"
                onClick={() => setOpen(false)}
              >
                <span className="w-1.5 h-1.5 rounded-full mt-1.5" style={{ background: l.color }} />
                <span className="flex-1">
                  <span className="block">
                    {isEgyptair ? '✈️ ' : ''}{l.name}
                  </span>
                  {isEgyptair && (
                    <span className="block text-[10px] text-slate-500 leading-tight mt-0.5">
                      EgyptAir (MS) flights only — booked via Aviasales
                    </span>
                  )}
                </span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-400 mt-1">
                  <path d="M7 17 17 7M7 7h10v10" />
                </svg>
              </a>
            );
          })}
          {opts.onChecklist && (
            <>
              <div className="border-t border-slate-100 dark:border-slate-800" />
              <button
                onClick={() => { setOpen(false); opts.onChecklist?.(); }}
                className="w-full text-left flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span className="flex-1">Pre-flight checklist</span>
                <span className="text-slate-400 text-xs">↗</span>
              </button>
            </>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
