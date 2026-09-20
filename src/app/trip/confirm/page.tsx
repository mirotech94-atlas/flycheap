import '../trip.css';
import { tripForConfirmToken } from '@/lib/tripChain';
import { answer } from './actions';

export const dynamic = 'force-dynamic';

// The root layout titles everything "Executive Dashboard"; this page is reached
// from a customer's inbox and its tab should say what it is.
export const metadata = {
  title: 'Did you get the fare? — FlyCheap',
  robots: { index: false, follow: false },
};

/**
 * "Did you get the Barcelona fare?"
 *
 * This page exists because the answer MUST NOT be a GET. Corporate mail
 * security — Proofpoint, Defender, Mimecast — fetches every link in a message
 * before the recipient sees it. A confirmation link that mutated on GET would
 * mark trips as booked for people who never opened the email, and then fire
 * hotel, transfer and insurance offers at them. That is precisely the failure
 * the chain's first rule exists to prevent, arriving through the back door.
 *
 * So the link lands here, and the answer is a form POST. Same lesson as
 * "never probe action URLs", from the other direction.
 */
export default async function TripConfirmPage(
  { searchParams }: { searchParams: Promise<{ t?: string; done?: string }> },
) {
  const sp = await searchParams;
  const token = sp.t ?? '';
  const trip = token ? tripForConfirmToken(token) : null;

  if (sp.done) {
    return (
      <Shell>
        <h1 className="nc-h1">
          {sp.done === 'booked' ? 'Brilliant — have a great trip.' : 'Noted, no rush.'}
        </h1>
        <p className="nc-lede">
          {sp.done === 'booked'
            ? 'We’ll follow up with a few things that make the trip easier — somewhere to stay, getting in from the airport. One email at a time, and you can turn them off in a click.'
            : 'We’ll keep watching this route and let you know how the fare moves.'}
        </p>
      </Shell>
    );
  }

  if (!trip) {
    return (
      <Shell>
        <h1 className="nc-h1">That link has expired.</h1>
        <p className="nc-lede">
          Confirmation links last 30 days and can only be used once. Nothing is wrong with your
          account — there is just nothing left to answer here.
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="nc-h1">Did you get the {trip.destination} fare?</h1>
      <p className="nc-lede">
        {trip.origin} → {trip.destination}
        {trip.depart_date ? ` · ${trip.depart_date}` : ''}
        {trip.fare_per_adult_usd ? ` · $${Math.round(trip.fare_per_adult_usd)} per adult` : ''}
      </p>
      <p className="nc-lede">
        It is the one thing we can&rsquo;t see, and it tells us which alerts are actually worth
        sending.
      </p>

      <form action={answer} className="nc-actions">
        <input type="hidden" name="token" value={token} />
        <button type="submit" name="answer" value="booked" className="nc-btn">
          Yes, I booked it
        </button>
        <button type="submit" name="answer" value="deciding" className="nc-btn-quiet">
          Still deciding
        </button>
      </form>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="fc-shell" data-theme="cabin">
      <div className="nc-confirm-card">{children}</div>
    </main>
  );
}
