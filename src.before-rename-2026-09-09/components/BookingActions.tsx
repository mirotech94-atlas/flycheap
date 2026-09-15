'use client';

import { useState } from 'react';
import { BookButton } from './BookButton';
import { BookingChecklistDrawer } from './BookingChecklistDrawer';

export function BookingActions(opts: {
  origin: string;
  destination: string;
  departDate: string;
  returnDate: string;
  adults: number;
  infants: number;
  size?: 'sm' | 'md';
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <BookButton {...opts} onChecklist={() => setOpen(true)} />
      <BookingChecklistDrawer
        itinerary={open ? {
          origin: opts.origin,
          destination: opts.destination,
          departDate: opts.departDate,
          returnDate: opts.returnDate,
        } : null}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
