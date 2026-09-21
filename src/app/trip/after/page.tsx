import { tripForConfirmToken, postTripNextStep } from '@/lib/tripChain';
import { queries } from '@/lib/db';
import { answerAfter } from './actions';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'How was the trip? — FlyCheap',
  robots: { index: false, follow: false },
};

/**
 * "Welcome back — did you travel, and what did you pay?"
 *
 * Same shape as /trip/confirm, for the same reason: the link lands here and
 * the answer is a form POST, because mail security scanners fetch every link
 * in a message before the recipient sees it.
 *
 * The retention prompt lives on this page and nowhere else. A route someone
 * has just flown is the strongest home-route candidate there is, and the
 * moment they land is the moment to ask — so the "keep watching this every
 * year" checkbox sits inside the same form, one POST, no second email.
 */
export default async function TripAfterPage(
  { searchParams }: { searchParams: Promise<{ t?: string; done?: string; home?: string }> },
) {
  const sp = await searchParams;
  const token = sp.t ?? '';
  const trip = token ? tripForConfirmToken(token) : null;

  if (sp.done) {
    const travelled = sp.done === 'yes';
    return (
      <Shell>
        <h1 className="ed-h2">{travelled ? 'Thanks — that helps more than you’d think.' : 'Noted. Sorry the trip didn’t happen.'}</h1>
        <p className="ed-sub">
          {travelled
            ? sp.home === '1'
              ? 'We’ll keep watching this route between trips and tell you when next year’s fares open cheap. It never expires.'
              : 'What you paid is now part of your savings for the year, and it tells us whether our advice on this route was any good.'
            : 'We won’t count it against anything. The watch stays as it was.'}
        </p>
      </Shell>
    );
  }

  if (!trip) {
    return (
      <Shell>
        <h1 className="ed-h2">That link has expired.</h1>
        <p className="ed-sub">
          These links last 30 days and can only be used once. Nothing is wrong with your
          account — there is just nothing left to answer here.
        </p>
      </Shell>
    );
  }

  const watch = trip.search_id ? queries.getSearchById(trip.search_id) : undefined;
  const isHomeRoute = !!watch?.is_home_route;
  const next = postTripNextStep({ travelled: true, hasWatch: !!watch, isHomeRoute });
  const perAdultHint = trip.fare_per_adult_usd
    ? `We alerted you at $${Math.round(trip.fare_per_adult_usd)} per adult.`
    : null;

  return (
    <Shell>
      <h1 className="ed-h2">Welcome back — how was {trip.destination}?</h1>
      <p className="ed-sub">
        {trip.origin} → {trip.destination}
        {trip.depart_date ? ` · ${trip.depart_date}` : ''}
        {trip.return_date ? ` to ${trip.return_date}` : ''}
      </p>
      <p className="ed-sub">
        Two quick things. Did the trip happen, and what did you actually pay for the flights?
        {perAdultHint ? ` ${perAdultHint}` : ''}
      </p>

      <form action={answerAfter}>
        <input type="hidden" name="token" value={token} />

        <label className="ed-field-block">
          <span className="ed-label">What you paid for the flights, in total (USD)</span>
          <input
            name="paid"
            type="text"
            inputMode="decimal"
            placeholder={trip.fare_per_adult_usd ? `e.g. ${Math.round(trip.fare_per_adult_usd * trip.adults)}` : 'e.g. 1840'}
            className="ed-input"
          />
          <span className="ed-field-hint">
            For everyone on the booking, not per person. Leave it blank if you’d rather not say —
            the trip still counts.
          </span>
        </label>

        {next === 'offer-home-route' && (
          <label className="ed-checkbox">
            <input type="checkbox" name="home_route" />
            <span>
              I fly this route every year — keep watching it
              <span className="ed-field-hint">
                A home route never expires. We keep watching between trips and tell you when
                next year’s fares open cheap.
              </span>
            </span>
          </label>
        )}
        {next === 'keep-watching' && (
          <p className="ed-field-hint">This is one of your home routes — we keep watching it between trips.</p>
        )}

        <div className="ed-actions" style={{ marginTop: 20, marginBottom: 0 }}>
          <button type="submit" name="travelled" value="yes" className="ed-btn ed-btn-primary">
            Yes, I travelled
          </button>
          <button type="submit" name="travelled" value="no" className="ed-btn ed-btn-secondary">
            Plans changed, I didn’t go
          </button>
        </div>
      </form>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="ed-panel ed-card">{children}</div>
  );
}
