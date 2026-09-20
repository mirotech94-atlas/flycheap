import { describe, it, expect } from 'vitest';
import { rankBookOptions, TOLERANCE_USD, type BookOption } from '@/lib/bookPanel';

/**
 * The spec's rule has two halves and the tests exist to stop either one being
 * quietly dropped:
 *
 *   "Order those by expected commission among options within a small tolerance
 *    of the cheapest... If the cheapest pays nothing, still show it first —
 *    you sell honesty, and users will check."
 *
 * Dropping the first half leaves money on the table. Dropping the second turns
 * the panel into steering, and a user who feels steered is worth less than the
 * click.
 */

const opt = (name: string, priceUsd?: number | null): BookOption =>
  ({ name, short: name, href: `https://x/${name}`, color: '#000', priceUsd });

const EPC = { Aviasales: 0.10, Skyscanner: 0.25, Kayak: 0, Google: 0, Momondo: 0 };
const rank = (os: BookOption[]) => rankBookOptions(os, { epc: EPC }).map(o => o.name);

describe('the cheapest always leads', () => {
  it('puts the cheapest first even when it pays nothing', () => {
    // Google pays us zero and is $1 cheaper. It still leads.
    const out = rankBookOptions(
      [opt('Skyscanner', 485), opt('Google', 484), opt('Aviasales', 486)],
      { epc: EPC },
    );
    expect(out[0].name).toBe('Google');
    expect(out[0].reason).toBe('cheapest');
  });

  it('orders everything within tolerance of it by expected commission', () => {
    // 484 / 485 / 486 — all within $6, so behind the cheapest the best-paying
    // partner leads. This is the "$6 apart, leading with the one that pays"
    // case from the spec, worth real money and still honest.
    expect(rank([opt('Aviasales', 486), opt('Google', 484), opt('Skyscanner', 485)]))
      .toEqual(['Google', 'Skyscanner', 'Aviasales']);
  });

  it('does not promote a paying option that is materially dearer', () => {
    // Skyscanner pays best but is $40 more. Commission does not buy that.
    const out = rank([opt('Skyscanner', 524), opt('Google', 484), opt('Aviasales', 486)]);
    expect(out[0]).toBe('Google');
    expect(out[out.length - 1]).toBe('Skyscanner');
  });

  it('treats the tolerance boundary as inclusive', () => {
    const out = rank([opt('Google', 484), opt('Skyscanner', 484 + TOLERANCE_USD)]);
    expect(out).toEqual(['Google', 'Skyscanner']);
    const outside = rankBookOptions(
      [opt('Google', 484), opt('Skyscanner', 484 + TOLERANCE_USD + 0.01)],
      { epc: EPC },
    );
    expect(outside[1].reason).toBe('priced-higher');
  });

  it('sorts the beyond-tolerance tail by price, not by commission', () => {
    expect(rank([
      opt('Google', 484), opt('Skyscanner', 600), opt('Aviasales', 520), opt('Kayak', 550),
    ])).toEqual(['Google', 'Aviasales', 'Kayak', 'Skyscanner']);
  });
});

describe('when we cannot price the options', () => {
  it('falls back to expected commission', () => {
    // The usual case: these are deep links into other people's search pages,
    // not priced offers.
    expect(rank([opt('Google'), opt('Aviasales'), opt('Skyscanner')]))
      .toEqual(['Skyscanner', 'Aviasales', 'Google']);
  });

  it('keeps the incoming order when nothing has a measured EPC', () => {
    // No measurement must mean "change nothing", not "reshuffle on noise".
    const given = [opt('Google'), opt('Kayak'), opt('Momondo')];
    expect(rankBookOptions(given, { epc: {} }).map(o => o.name))
      .toEqual(['Google', 'Kayak', 'Momondo']);
    expect(rankBookOptions(given).map(o => o.name))
      .toEqual(['Google', 'Kayak', 'Momondo']);
  });

  it('puts unpriced options after priced ones rather than guessing they are cheap', () => {
    const out = rankBookOptions(
      [opt('Skyscanner'), opt('Google', 484), opt('Aviasales', 486)],
      { epc: EPC },
    );
    expect(out.map(o => o.name)).toEqual(['Google', 'Aviasales', 'Skyscanner']);
    expect(out[2].reason).toBe('unpriced');
  });
});

describe('ranking bookkeeping', () => {
  it('numbers every option from 1 so the click can record its position', () => {
    // Without this the spec's question — does ordering by commission cost us
    // clicks? — stays unanswerable.
    const out = rankBookOptions([opt('a', 1), opt('b', 2), opt('c', 3)], { epc: {} });
    expect(out.map(o => o.rank)).toEqual([1, 2, 3]);
  });

  it('never drops or duplicates an option', () => {
    const given = [opt('a', 500), opt('b'), opt('c', 501), opt('d')];
    const out = rankBookOptions(given, { epc: EPC });
    expect(out).toHaveLength(4);
    expect(new Set(out.map(o => o.name)).size).toBe(4);
  });

  it('is stable for equal scores, so the panel does not reshuffle between renders', () => {
    const given = [opt('a'), opt('b'), opt('c')];
    const once = rankBookOptions(given, { epc: {} }).map(o => o.name);
    const twice = rankBookOptions(given, { epc: {} }).map(o => o.name);
    expect(once).toEqual(twice);
  });

  it('ignores a nonsensical EPC rather than letting it decide', () => {
    const out = rankBookOptions(
      [opt('Google'), opt('Aviasales')],
      { epc: { Google: NaN, Aviasales: 0.1 } },
    );
    expect(out[0].name).toBe('Aviasales');
  });
});
