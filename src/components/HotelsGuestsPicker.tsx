'use client';

import { useEffect, useRef, useState } from 'react';

export type Room = {
  adults: number;     // 1–4
  children: number[]; // age per child, 0–17; length 0–4
};

export type GuestsState = {
  rooms: Room[]; // max 5
};

/** Compact one-line summary, e.g. "2 rooms · 4 adults, 2 children". */
export function summarizeGuests(g: GuestsState): string {
  const rooms = g.rooms.length;
  const adults = g.rooms.reduce((s, r) => s + r.adults, 0);
  const children = g.rooms.reduce((s, r) => s + r.children.length, 0);
  const rPart = rooms === 1 ? '1 room' : `${rooms} rooms`;
  const aPart = `${adults} ${adults === 1 ? 'adult' : 'adults'}`;
  const cPart = children > 0 ? `, ${children} ${children === 1 ? 'child' : 'children'}` : '';
  return `${rPart} · ${aPart}${cPart}`;
}

/** Encode for URL: e.g. "2-0,2-2.4" = room1 (2 adults), room2 (2 adults, 2 kids aged 2 & 4) */
export function encodeGuests(g: GuestsState): string {
  return g.rooms.map(r => `${r.adults}-${r.children.join('.') || '0'}`).join(',');
}
export function decodeGuests(s: string | null | undefined): GuestsState | null {
  if (!s) return null;
  try {
    const rooms = s.split(',').slice(0, 5).map(r => {
      const [aRaw, cRaw] = r.split('-');
      const adults = Math.max(1, Math.min(4, Number(aRaw) || 1));
      const children = (cRaw && cRaw !== '0' ? cRaw.split('.') : [])
        .slice(0, 4)
        .map(x => Math.max(0, Math.min(17, Number(x) || 0)));
      return { adults, children };
    });
    return rooms.length ? { rooms } : null;
  } catch { return null; }
}

export function defaultGuests(adults = 2): GuestsState {
  return { rooms: [{ adults, children: [] }] };
}

/** Total adults across all rooms — used when building the Hotellook URL.
 *  Hotellook accepts ?adults=X&children=Y for ONE room only; multi-room
 *  searches collapse to totals (the spec notes the user-facing caveat). */
export function totalGuests(g: GuestsState): { adults: number; children: number; childAges: number[] } {
  let adults = 0;
  const childAges: number[] = [];
  for (const r of g.rooms) {
    adults += r.adults;
    childAges.push(...r.children);
  }
  return { adults, children: childAges.length, childAges };
}

export function HotelsGuestsPicker({
  value,
  onChange,
}: {
  value: GuestsState;
  onChange: (next: GuestsState) => void;
}) {
  const [open, setOpen] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const setRoom = (i: number, patch: Partial<Room>) => {
    const next = value.rooms.map((r, idx) => idx === i ? { ...r, ...patch } : r);
    onChange({ rooms: next });
  };
  const addRoom = () => {
    if (value.rooms.length >= 5) return;
    onChange({ rooms: [...value.rooms, { adults: 2, children: [] }] });
  };
  const removeRoom = (i: number) => {
    if (value.rooms.length <= 1) return;
    onChange({ rooms: value.rooms.filter((_, idx) => idx !== i) });
  };
  const setChildCount = (i: number, n: number) => {
    const r = value.rooms[i];
    const cur = r.children;
    const next = n > cur.length
      ? [...cur, ...Array(n - cur.length).fill(8)]
      : cur.slice(0, n);
    setRoom(i, { children: next });
  };
  const setChildAge = (roomIdx: number, childIdx: number, age: number) => {
    const r = value.rooms[roomIdx];
    const children = r.children.map((a, k) => k === childIdx ? Math.max(0, Math.min(17, age)) : a);
    setRoom(roomIdx, { children });
  };

  return (
    <div className="relative" ref={popRef}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full rounded border px-2 py-1 text-xs text-left"
        style={{ background: 'var(--bg-elevated, white)', color: 'var(--text)', borderColor: 'var(--border, #cbd5e1)' }}
      >
        {summarizeGuests(value)}
      </button>
      {open && (
        <div
          className="absolute z-30 mt-1 right-0 w-72 rounded-lg border shadow-lg p-3 space-y-3"
          style={{ background: 'var(--bg-elevated, white)', color: 'var(--text)', borderColor: 'var(--border, #cbd5e1)' }}
        >
          {value.rooms.map((r, i) => (
            <div key={i} className="space-y-2 pb-2 border-b last:border-0" style={{ borderColor: 'var(--border, rgba(148,163,184,0.25))' }}>
              <div className="flex items-center justify-between">
                <div className="text-xs font-medium">Room {i + 1}</div>
                {value.rooms.length > 1 && (
                  <button type="button" onClick={() => removeRoom(i)} className="text-[10px] underline" style={{ color: 'var(--text-muted, #64748b)' }}>
                    Remove
                  </button>
                )}
              </div>
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span>Adults</span>
                <div className="flex items-center gap-1.5">
                  <button type="button" onClick={() => setRoom(i, { adults: Math.max(1, r.adults - 1) })} className="w-6 h-6 rounded border" style={{ borderColor: 'var(--border, #cbd5e1)' }}>−</button>
                  <span className="tabular-nums w-4 text-center">{r.adults}</span>
                  <button type="button" onClick={() => setRoom(i, { adults: Math.min(4, r.adults + 1) })} className="w-6 h-6 rounded border" style={{ borderColor: 'var(--border, #cbd5e1)' }}>+</button>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span>Children</span>
                <div className="flex items-center gap-1.5">
                  <button type="button" onClick={() => setChildCount(i, Math.max(0, r.children.length - 1))} className="w-6 h-6 rounded border" style={{ borderColor: 'var(--border, #cbd5e1)' }}>−</button>
                  <span className="tabular-nums w-4 text-center">{r.children.length}</span>
                  <button type="button" onClick={() => setChildCount(i, Math.min(4, r.children.length + 1))} className="w-6 h-6 rounded border" style={{ borderColor: 'var(--border, #cbd5e1)' }}>+</button>
                </div>
              </div>
              {r.children.length > 0 && (
                <div className="grid grid-cols-2 gap-1.5">
                  {r.children.map((age, k) => (
                    <label key={k} className="text-[10px]" style={{ color: 'var(--text-muted, #64748b)' }}>
                      Child {k + 1} age
                      <input
                        type="number"
                        min={0}
                        max={17}
                        value={age}
                        onChange={(e) => setChildAge(i, k, Number(e.target.value))}
                        className="w-full mt-0.5 rounded border px-1 py-0.5 text-[11px]"
                        style={{ background: 'var(--bg-elevated, white)', color: 'var(--text)', borderColor: 'var(--border, #cbd5e1)' }}
                      />
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={addRoom}
              disabled={value.rooms.length >= 5}
              className="text-[11px] underline disabled:opacity-40"
              style={{ color: 'var(--text-muted, #64748b)' }}
            >
              + Add room {value.rooms.length >= 5 ? '(max 5)' : ''}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="text-[11px] btn btn-primary px-2 py-0.5">
              Done
            </button>
          </div>
          {value.rooms.length > 1 && (
            <div className="text-[10px]" style={{ color: 'var(--text-faint, #94a3b8)' }}>
              Multi-room: rate per room may vary on the provider&apos;s site.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
