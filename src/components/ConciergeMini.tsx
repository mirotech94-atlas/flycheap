import Link from 'next/link';

export function ConciergeMini({ alerts }: { alerts: number }) {
  return (
    <Link href="/explore" className="fc-concierge" aria-label="Open concierge">
      <div className="fc-concierge-head">
        <div className="title">
          <span className="pulse" /> Concierge · {alerts} alert{alerts === 1 ? '' : 's'}
        </div>
        <span style={{ color: 'rgba(212,175,55,.9)', fontSize: 14 }}>▴</span>
      </div>
    </Link>
  );
}
