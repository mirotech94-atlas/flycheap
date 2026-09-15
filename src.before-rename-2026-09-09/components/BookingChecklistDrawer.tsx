'use client';

import { useEffect, useState } from 'react';
import { fmtDate } from '@/lib/utils';

const CHECKLIST_KEY = 'egyptair-checklist-v1';

type Item = { id: string; label: string; hint?: string };

const ITEMS: Item[] = [
  { id: 'passport-6mo',   label: 'All passports valid 6+ months past return date',
    hint: 'Egypt requires this; bring physical passports, not just photos.' },
  { id: 'visa',           label: 'Egypt e-visa or visa-on-arrival confirmed',
    hint: 'US passport holders can buy visa-on-arrival ($25 cash USD per person) or pre-buy at visa2egypt.gov.eg.' },
  { id: 'infant-added',   label: 'Infant explicitly added to the EgyptAir reservation',
    hint: 'Lap infant ticket is ~10% of adult fare; must be added at booking, not at the gate. Bring birth certificate.' },
  { id: '24hr-cancel',    label: 'Note the 24-hour DOT free-cancellation window',
    hint: 'Per US DOT rule, any flight booked ≥7 days before departure can be canceled within 24 hours for a full refund.' },
  { id: 'seats-selected', label: 'Seats selected — bassinet row if available',
    hint: 'EgyptAir 777-300ER bassinet seats: 31D/31G (rear bulkhead). Reserve via Manage Booking.' },
  { id: 'meals',          label: 'Special meals requested if needed',
    hint: 'Vegetarian, Halal (default on EgyptAir), child meal — request ≥48h before departure.' },
  { id: 'travel-insurance', label: 'Travel insurance considered (medical + trip-cancellation)' },
  { id: 'tsa-precheck',   label: 'TSA PreCheck / Global Entry numbers added to reservation' },
  { id: 'arrival-cash',   label: 'Bring USD cash for visa + tips ($200+ recommended)' },
  { id: 'cairo-pickup',   label: 'Cairo airport pickup arranged (Uber/Careem works at CAI)' },
];

export type ChecklistItinerary = {
  origin: string;
  destination: string;
  departDate: string;
  returnDate: string;
};

function storageKey(it: ChecklistItinerary) {
  return `${CHECKLIST_KEY}|${it.origin}-${it.destination}-${it.departDate}-${it.returnDate}`;
}

export function BookingChecklistDrawer({
  itinerary,
  onClose,
}: {
  itinerary: ChecklistItinerary | null;
  onClose: () => void;
}) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!itinerary) return;
    try {
      const raw = localStorage.getItem(storageKey(itinerary));
      setChecked(raw ? JSON.parse(raw) : {});
    } catch { setChecked({}); }
  }, [itinerary]);

  function toggle(id: string) {
    if (!itinerary) return;
    const next = { ...checked, [id]: !checked[id] };
    setChecked(next);
    try { localStorage.setItem(storageKey(itinerary), JSON.stringify(next)); } catch {}
  }

  function reset() {
    if (!itinerary) return;
    setChecked({});
    try { localStorage.removeItem(storageKey(itinerary)); } catch {}
  }

  if (!itinerary) return null;

  const doneCount = ITEMS.filter(i => checked[i.id]).length;
  const pct = Math.round((doneCount / ITEMS.length) * 100);

  return (
    <div className="fixed inset-0 z-50 flex justify-end no-print" role="dialog">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <aside className="relative bg-white dark:bg-slate-900 w-full max-w-md h-full overflow-auto shadow-lift border-l border-slate-200 dark:border-slate-700">
        <div className="sticky top-0 bg-gradient-to-r from-brand-700 to-brand-500 text-white px-5 py-4">
          <div className="text-[10px] uppercase tracking-[0.14em] text-white/70 font-semibold">Pre-flight</div>
          <div className="flex items-start justify-between gap-3 mt-1">
            <div>
              <h3 className="font-display font-bold text-lg leading-tight">Booking checklist</h3>
              <div className="text-xs text-white/80 mt-1">
                {itinerary.origin} → {itinerary.destination} · {fmtDate(itinerary.departDate)} → {fmtDate(itinerary.returnDate)}
              </div>
            </div>
            <button onClick={onClose} className="text-2xl leading-none px-2 hover:text-white/80" aria-label="Close">×</button>
          </div>
          <div className="mt-3">
            <div className="flex items-center justify-between text-[11px] text-white/80 mb-1">
              <span>{doneCount} of {ITEMS.length} done</span>
              <span>{pct}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/20 overflow-hidden">
              <div className="h-full bg-brand-gold transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>

        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {ITEMS.map(item => {
            const done = !!checked[item.id];
            return (
              <li key={item.id} className={`px-5 py-3 ${done ? 'opacity-60' : ''}`}>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={done}
                    onChange={() => toggle(item.id)}
                    className="mt-1 w-4 h-4 shrink-0"
                  />
                  <div className="flex-1">
                    <div className={`text-sm ${done ? 'line-through text-slate-400' : 'text-slate-800 dark:text-slate-100 font-medium'}`}>
                      {item.label}
                    </div>
                    {item.hint && (
                      <div className="text-[11px] text-slate-500 mt-1 leading-relaxed">{item.hint}</div>
                    )}
                  </div>
                </label>
              </li>
            );
          })}
        </ul>

        <div className="px-5 py-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3">
          <button onClick={reset} className="btn btn-sm btn-ghost text-slate-500" title="Clear progress for this itinerary">
            Reset
          </button>
          <span className="text-[11px] text-slate-400">Saved locally per itinerary</span>
        </div>
      </aside>
    </div>
  );
}
