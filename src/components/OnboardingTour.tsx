'use client';

import { useEffect, useState } from 'react';

/**
 * First-login guided tour. Five steps highlighting the core flows.
 *
 * Marks itself complete via PUT /api/me/onboarded so it never shows twice.
 * Anchors to existing DOM nodes by querying for stable class/id selectors;
 * if a target is missing on the current page, the step still renders but
 * the spotlight just covers the viewport center.
 */
type Step = {
  selector?: string;
  title: string;
  body: string;
  placement?: 'center' | 'top' | 'bottom';
};

// A guided walk through every tab + the core flows. Each step anchors to a nav
// link or dashboard element by a stable selector; if the anchor isn't on the
// current page the step still renders, centered, with its explanation — so the
// tour never breaks even as the layout evolves.
const STEPS: Step[] = [
  {
    title: 'Welcome to FlyCheap 👋',
    body: 'You\'re in. Here\'s a 45-second tour of every tab and how things work. We monitor 1,000+ airlines around the clock and ping you the moment a fare drops below your target. Hit Skip any time.',
    placement: 'center',
  },
  {
    selector: '[href="/"]',
    title: 'Dashboard',
    body: 'Your home base — the cheapest fare across all your tracked routes right now, a live deals table, the mistake-fare radar, and route intelligence. Refreshed every 5 minutes.',
    placement: 'bottom',
  },
  {
    selector: '[href="/explore"]',
    title: 'Explore',
    body: 'See the cheapest flights from your home city to everywhere — color-coded on a world map. Great for "where can I go cheap next month?"',
    placement: 'bottom',
  },
  {
    selector: '[href="/offers"]',
    title: 'Offers',
    body: 'Cross-shop a specific route across every booking partner — Aviasales, Google Flights, Kayak, Skyscanner — so you book at the genuinely lowest price.',
    placement: 'bottom',
  },
  {
    selector: '[href="/searches"]',
    title: 'Watchlist — add routes',
    body: 'The heart of it: add any route (any 3-letter pair — JFK→LHR, LAX→NRT) and a target price. We poll every 5–30 minutes and alert you when it drops below your target.',
    placement: 'bottom',
  },
  {
    selector: '[href="/integrations"]',
    title: 'Integrations — Slack & Telegram',
    body: 'Get drop alerts where you already are. Open @flycheap_alerts_bot on Telegram and send "/watch JFK LIS 450", or run "/flycheap watch JFK LIS 450" in Slack. Every drop posts automatically.',
    placement: 'bottom',
  },
  {
    selector: '[href="/settings"]',
    title: 'Settings',
    body: 'Set your default target price, alert channels (email, SMS, WhatsApp), and party size. Pro unlocks unlimited routes + 5-minute polling.',
    placement: 'bottom',
  },
  {
    selector: '#fc-concierge-launcher',
    title: 'Ask FarePilot',
    body: 'Your AI concierge — voice + chat with full read access to your dashboard. Ask "cheapest week in August under $700/adult?" and it queries your data and answers instantly.',
    placement: 'top',
  },
  {
    title: 'You\'re all set ✈️',
    body: 'That\'s the tour. Start by adding a route in Watchlist, or just ask FarePilot to find you a deal. Happy travels!',
    placement: 'center',
  },
];

export function OnboardingTour({ shouldShow = false }: { shouldShow?: boolean }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    // Trigger on the prop OR the first-run flag the sign-up flow sets
    // (localStorage 'fc_show_tour' === '1'). Self-contained so the component
    // can just be mounted on the dashboard with no server round-trip.
    let show = shouldShow;
    try { if (localStorage.getItem('fc_show_tour') === '1') show = true; } catch { /* ignore */ }
    if (!show) return;
    // Delay so the page paints before the tour overlay appears.
    const t = setTimeout(() => setOpen(true), 900);
    return () => clearTimeout(t);
  }, [shouldShow]);

  useEffect(() => {
    if (!open) return;
    const s = STEPS[step];
    if (s.selector) {
      const el = document.querySelector(s.selector) as HTMLElement | null;
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setRect(el.getBoundingClientRect());
        return;
      }
    }
    setRect(null);
  }, [open, step]);

  // Recompute spotlight rect on resize / scroll while open.
  useEffect(() => {
    if (!open) return;
    function reposition() {
      const s = STEPS[step];
      if (!s.selector) return;
      const el = document.querySelector(s.selector) as HTMLElement | null;
      if (el) setRect(el.getBoundingClientRect());
    }
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open, step]);

  async function complete() {
    setOpen(false);
    try { localStorage.removeItem('fc_show_tour'); } catch { /* ignore */ }
    try {
      await fetch('/api/me/onboarded', { method: 'PUT' });
    } catch { /* swallow — the next attempt will catch it */ }
  }

  if (!open) return null;
  const s = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const pad = 8;
  const spotlight = rect ? {
    top: rect.top - pad,
    left: rect.left - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
  } : null;

  // Position the tooltip relative to the spotlight (or center if no anchor).
  const tooltipStyle = (() => {
    if (!spotlight) return { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };
    const below = spotlight.top + spotlight.height + 14;
    const above = spotlight.top - 14;
    const wantsAbove = s.placement === 'top';
    if (wantsAbove) return { left: spotlight.left, top: above, transform: 'translateY(-100%)' };
    return { left: spotlight.left, top: below };
  })();

  return (
    <div className="fixed inset-0 z-[80] no-print" aria-modal="true" role="dialog">
      {/* Dimmer with cut-out for the spotlight using a layered box-shadow trick. */}
      {spotlight ? (
        <div
          style={{
            position: 'absolute',
            top: spotlight.top, left: spotlight.left,
            width: spotlight.width, height: spotlight.height,
            borderRadius: 14,
            boxShadow: '0 0 0 9999px rgba(2,6,23,0.65)',
            outline: '2px solid rgba(212,175,55,0.85)',
            outlineOffset: 4,
            transition: 'all 280ms cubic-bezier(.2,.7,.3,1)',
            pointerEvents: 'none',
          }}
        />
      ) : (
        <div className="absolute inset-0" style={{ background: 'rgba(2,6,23,0.65)' }} />
      )}

      <div
        className="fc-glass absolute max-w-sm rounded-2xl shadow-lift border border-slate-200 dark:border-slate-700 p-4 text-sm motion-slide-up"
        style={{ ...tooltipStyle, width: 'min(380px, calc(100vw - 32px))' }}
      >
        <div className="flex items-start justify-between gap-3 mb-2">
          <div>
            <div className="eyebrow text-brand-700 dark:text-brand-300">Step {step + 1} of {STEPS.length}</div>
            <h3 className="font-bold text-base text-slate-900 dark:text-slate-100 mt-0.5">{s.title}</h3>
          </div>
          <button
            onClick={complete}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-lg leading-none"
            aria-label="Skip tour"
          >×</button>
        </div>
        <p className="text-slate-700 dark:text-slate-300 mb-3 leading-snug">{s.body}</p>

        <div className="flex items-center justify-between">
          <div className="flex gap-1">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`block w-1.5 h-1.5 rounded-full ${i === step ? 'bg-brand-600' : 'bg-slate-300 dark:bg-slate-600'}`}
              />
            ))}
          </div>
          <div className="flex gap-2">
            {step > 0 && (
              <button onClick={() => setStep(s => s - 1)} className="btn btn-sm">
                ← Back
              </button>
            )}
            <button
              onClick={() => isLast ? complete() : setStep(s => s + 1)}
              className="btn btn-sm btn-primary"
            >
              {isLast ? 'Finish' : 'Next →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
