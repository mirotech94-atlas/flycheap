import type { Metadata } from 'next';
import AirbnbsPage from '../airbnbs/page';

// `/rentals` is the old vacation-rentals URL, kept alive as a thin alias so
// existing bookmarks/links keep working. The real page — now branded
// Airbnbs — lives at src/app/airbnbs/page.tsx.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Airbnbs | FlyCheap',
};

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function RentalsPage({ searchParams }: PageProps) {
  return <AirbnbsPage searchParams={searchParams} />;
}
