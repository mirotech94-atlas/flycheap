import './board.css';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { loadBoard } from '@/lib/boardData';
import { boardSummary } from '@/lib/boardCard';
import { BoardCardView } from './BoardCardView';
import { FcPageHead, FcEmpty } from '@/components/fc/PageKit';

import type { Metadata } from 'next';

/**
 * The board.
 *
 * "Not a dashboard of charts. A list of watches, each one a card that answers
 *  the only question the user has: should I book yet?"
 *
 * So there is deliberately no globe, no KPI strip and no live feed here. The
 * charts still exist on the old dashboard for anyone who wants them; this
 * screen is the decision, and adding a second thing to look at is how it stops
 * being that.
 */

export const metadata: Metadata = {
  title: 'Your board — FlyCheap',
  description: 'Every route you are watching, and whether to book it yet.',
};

export const dynamic = 'force-dynamic';

export default async function BoardPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=%2Fboard');

  const cards = loadBoard(user.id);
  const summary = boardSummary(cards);

  return (
    <div className="space-y-6">
      {/* No "Check now" here on purpose. Amber marks fares and THE primary
          action, and on this page that is Book. An amber button in the header
          competes with every card for the one colour the price relies on;
          polling belongs on the watchlist, which is where you operate routes. */}
      <FcPageHead title="Your board" lede={lede(summary)} />

      {cards.length === 0 ? (
        <FcEmpty
          headline="Nothing on the board yet"
          body="Add a route and we start recording its price immediately. Once there is enough history to tell cheap from normal, this page tells you whether to book."
          cta="Add a route"
          href="/searches"
        />
      ) : (
        <>
          <div className="nc-board">
            {cards.map(c => <BoardCardView key={c.id} card={c} />)}
          </div>
          <p className="text-[12px] text-[var(--nc-on-dark-faint)]">
            Add, pause or reorder routes on{' '}
            <Link href="/searches" className="underline underline-offset-2">your watchlist</Link>.
          </p>
        </>
      )}
    </div>
  );
}

/**
 * The one line above the board.
 *
 * Says how many it could not answer for, rather than quietly counting those as
 * "not under target" and overstating what we know.
 */
function lede(s: ReturnType<typeof boardSummary>): string {
  if (s.watching === 0) return 'Nothing is being watched right now.';

  const parts = [`Watching ${s.watching} route${s.watching === 1 ? '' : 's'}.`];
  parts.push(
    s.buyNow > 0
      ? `${s.buyNow} worth booking today.`
      : 'Nothing we would tell you to book today.',
  );
  if (s.unanswerable > 0) {
    parts.push(
      `${s.unanswerable} we cannot judge yet — no target set, or not enough history.`,
    );
  }
  return parts.join(' ');
}
