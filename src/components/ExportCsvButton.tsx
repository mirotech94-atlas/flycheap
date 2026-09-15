'use client';

import { useSearchParams } from 'next/navigation';

export function ExportCsvButton({ count }: { count: number }) {
  const params = useSearchParams();
  const qs = params?.toString() ?? '';
  const href = `/api/best-deals/export${qs ? `?${qs}` : ''}`;
  return (
    <a
      href={href}
      className="btn btn-sm"
      title="Download the currently filtered deals as CSV (Excel-friendly)"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
      Export CSV{count ? ` (${count})` : ''}
    </a>
  );
}
