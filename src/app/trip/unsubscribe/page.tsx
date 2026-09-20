import '../trip.css';
import { verifyCommercialUnsubscribe } from '@/lib/tripChain';
import { unsubscribeCommercial } from './actions';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Trip offer emails — FlyCheap',
  robots: { index: false, follow: false },
};

/**
 * Commercial-only unsubscribe.
 *
 * Deliberately separate from the fare-alert unsubscribe. Bundling them means one
 * annoyed click takes the alert channel with the marketing one — and the alert
 * channel is the product.
 *
 * Also a POST, for the same reason as the confirmation page: a mail scanner
 * fetching links must not be able to unsubscribe someone who never asked.
 */
export default async function CommercialUnsubscribePage(
  { searchParams }: { searchParams: Promise<{ u?: string; s?: string; done?: string }> },
) {
  const sp = await searchParams;
  const userId = Number(sp.u);
  const ok = Number.isFinite(userId) && !!sp.s && verifyCommercialUnsubscribe(userId, sp.s);

  if (sp.done) {
    return (
      <Shell>
        <h1 className="nc-h1">Done — no more trip offers.</h1>
        <p className="nc-lede">
          <strong>Your fare alerts are untouched.</strong> They are a separate subscription and they
          keep working exactly as before. If you meant to stop those too, you can do it from your
          alert settings.
        </p>
      </Shell>
    );
  }

  if (!ok) {
    return (
      <Shell>
        <h1 className="nc-h1">That unsubscribe link isn&rsquo;t valid.</h1>
        <p className="nc-lede">You can change every email preference from your account settings.</p>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="nc-h1">Stop trip offers?</h1>
      <p className="nc-lede">
        This turns off the hotel, transfer, insurance and eSIM emails that follow a booking.
        <strong> Your fare alerts are not affected</strong> — they are a separate subscription.
      </p>
      <form action={unsubscribeCommercial} className="nc-actions">
        <input type="hidden" name="u" value={String(userId)} />
        <input type="hidden" name="s" value={sp.s ?? ''} />
        {/* Quiet, not amber: amber marks the one thing a page wants you to do,
            and this is a choice we present rather than encourage. */}
        <button type="submit" className="nc-btn-quiet">Turn off trip offers</button>
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
