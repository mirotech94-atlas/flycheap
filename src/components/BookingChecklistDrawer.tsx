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
      <div className="absolute inset-0" style={{ background: 'var(--ink)', opacity: 0.6 }} onClick={onClose} />
      <aside
        className="relative w-full max-w-md h-full overflow-auto"
        style={{ background: 'var(--surface)', borderLeft: '1px solid var(--rule-strong)' }}
      >
        <div className="sticky top-0" style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--rule)', padding: '16px 20px' }}>
          <div className="ed-eyebrow">Pre-flight</div>
          <div className="flex items-start justify-between gap-3 mt-1">
            <div>
              <h3 className="ed-h2" style={{ fontSize: 19, marginBottom: 2 }}>Booking checklist</h3>
              <div className="ed-panel-note" style={{ marginTop: 4 }}>
                {itinerary.origin} → {itinerary.destination} · {fmtDate(itinerary.departDate)} → {fmtDate(itinerary.returnDate)}
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              style={{ fontSize: 22, lineHeight: 1, padding: '0 4px', color: 'var(--muted)', background: 'transparent', border: 0, cursor: 'pointer' }}
            >×</button>
          </div>
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1" style={{ fontSize: 11, color: 'var(--muted)' }}>
              <span>{doneCount} of {ITEMS.length} done</span>
              <span>{pct}%</span>
            </div>
            <div style={{ height: 4, background: 'var(--rule)', overflow: 'hidden' }}>
              <div style={{ height: '100%', background: 'var(--accent)', width: `${pct}%`, transition: 'width 160ms' }} />
            </div>
          </div>
        </div>

        <ul>
          {ITEMS.map(item => {
            const done = !!checked[item.id];
            return (
              <li key={item.id} style={{ padding: '12px 20px', borderTop: '1px solid var(--rule)', opacity: done ? 0.6 : 1 }}>
                <label className="flex items-start gap-3" style={{ cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={done}
                    onChange={() => toggle(item.id)}
                    className="mt-1 shrink-0"
                    style={{ accentColor: 'var(--accent)', width: 15, height: 15 }}
                  />
                  <div className="flex-1">
                    <div style={{ fontSize: 13.5, textDecoration: done ? 'line-through' : 'none', color: done ? 'var(--muted)' : 'var(--ink)', fontWeight: done ? 400 : 500 }}>
                      {item.label}
                    </div>
                    {item.hint && (
                      <div className="ed-field-hint">{item.hint}</div>
                    )}
                  </div>
                </label>
              </li>
            );
          })}
        </ul>

        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--rule)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <button onClick={reset} className="ed-btn ed-btn-secondary" title="Clear progress for this itinerary">
            Reset
          </button>
          <span className="ed-panel-note" style={{ marginTop: 0 }}>Saved locally per itinerary</span>
        </div>
      </aside>
    </div>
  );
}
