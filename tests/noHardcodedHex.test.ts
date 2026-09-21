// tests/noHardcodedHex.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Constraint #2 of the editorial redesign: every colour is a CSS custom property.
 * A hardcoded hex in a component prop is unreachable by a token swap (the
 * FcGlobe accentColor="#d4af37" precedent), so this fails CI on any new one.
 *
 * ALLOWLIST is the migration ledger. Each entry is a file still carrying
 * literal hex and the count it carries. Tasks that convert a file must remove
 * its entry; the test ALSO fails if an allowlisted file is already clean, so
 * the list can only shrink.
 */
const ALLOWLIST: Record<string, number> = {
  // Third-party brand marks — Slack + Telegram logo paths. Legitimately literal.
  'src/app/integrations/page.tsx': 6,
  // ---- migration ledger: shrink to zero over Phases 1–3 ----
  // Counts below are the actual regex-matched baseline (run 2026-09-21), not the
  // grep -c estimate this file started from — see task-0.2-report.md for the RED evidence.
  'src/components/DemoCarousel.tsx': 59,
  'src/app/admin/layout.tsx': 24,
  'src/components/WorldMap.tsx': 16,
  'src/app/admin/_components/AdminSidebar.tsx': 13,
  'src/app/support/[ref]/page.tsx': 13,
  'src/app/admin/signups/page.tsx': 12,
  'src/app/guides/page.tsx': 12,
  'src/components/WhiteLabelSettings.tsx': 12,
  'src/app/admin/_components/ui.tsx': 11,
  'src/components/HotelsGuestsPicker.tsx': 11,
  'src/app/admin/users/page.tsx': 10,
  'src/components/InteractiveGlobe.tsx': 10,
  'src/components/Logo.tsx': 10,
  'src/app/m/verify/page.tsx': 9,
  'src/app/support/page.tsx': 9,
  'src/components/HotelsFilterChipsMobile.tsx': 9,
  'src/components/HotelsGrid.tsx': 9,
  'src/components/SvgGlobe.tsx': 9,
  'src/components/HotelsMap.tsx': 8,
  'src/app/admin/tickets/[ref]/page.tsx': 7,
  'src/app/routes/page.tsx': 7,
  'src/components/GlobeHUD.tsx': 7,
  'src/components/HotelsFilterRail.tsx': 7,
  'src/app/admin/health/page.tsx': 6,
  'src/components/PricingClient.tsx': 6,
  'src/components/charts.tsx': 5,
  'src/components/ExecKpiStrip.tsx': 5,
  'src/components/fc/SkyGradient.tsx': 5,
  'src/components/FcFareCalendar.tsx': 5,
  'src/app/admin/economics/page.tsx': 4,
  'src/components/Toaster.tsx': 4,
  'src/app/layout.tsx': 3,
  'src/app/onboarding/page.tsx': 3,
  'src/components/AdminChip.tsx': 3,
  'src/components/BestDealsCard.tsx': 3,
  'src/components/ClientSidebar.tsx': 3,
  'src/components/ExecutiveTopBar.tsx': 3,
  'src/components/FcKpiStrip.tsx': 3,
  'src/components/FcRouteDna.tsx': 3,
  'src/app/admin/queue/page.tsx': 2,
  'src/app/admin/tickets/page.tsx': 2,
  'src/components/AdminFarePilotWidget.tsx': 2,
  'src/components/HotelsPriceChart.tsx': 2,
  'src/app/admin/page.tsx': 1,
  'src/app/admin/users/RowMenu.tsx': 1,
  'src/components/BookButton.tsx': 1,
  'src/components/ConfirmDialog.tsx': 1,
  'src/components/LanguageMenu.tsx': 1,
};

const HEX = /#[0-9a-fA-F]{3,8}\b/g;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.tsx')) out.push(p);
  }
  return out;
}

function hexCount(file: string): number {
  // Count hex literals that appear as JSX prop values or inside style objects /
  // string literals — i.e. anything a token cannot reach at runtime.
  const src = readFileSync(file, 'utf8');
  return (src.match(HEX) || []).filter(h => [4, 5, 7, 9].includes(h.length)).length;
}

describe('no hardcoded hex in components', () => {
  const files = walk('src').map(f => f.replace(/\\/g, '/'));

  it('every .tsx outside the allowlist has zero hex literals', () => {
    const offenders = files
      .filter(f => !(f in ALLOWLIST))
      .map(f => [f, hexCount(f)] as const)
      .filter(([, n]) => n > 0);
    expect(offenders, `hex found in: ${offenders.map(([f, n]) => `${f} (${n})`).join(', ')}`).toEqual([]);
  });

  it('the allowlist only shrinks: every listed file still carries exactly its recorded count', () => {
    const stale = Object.entries(ALLOWLIST)
      .map(([f, n]) => [f, n, hexCount(f)] as const)
      .filter(([, n, actual]) => n !== actual);
    expect(stale, `update ALLOWLIST: ${stale.map(([f, n, a]) => `${f} recorded ${n}, actual ${a}`).join('; ')}`).toEqual([]);
  });
});
