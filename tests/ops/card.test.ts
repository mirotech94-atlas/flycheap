import { describe, it, expect } from 'vitest';
import { formatCard, formatResolved, truncate } from '@/lib/ops/card';

describe('formatCard', () => {
  it('renders every section in order', () => {
    const s = formatCard({
      title: 'Job failed: egyptair-jobs@digest',
      firstSeen: '2026-09-14 23:30:02',
      occurrences: 3,
      evidence: 'line1\nline2',
      diagnosis: 'SMTP creds expired.',
      footer: { kind: 'fixing', text: 'restarting egyptair-jobs@digest' },
    });
    expect(s.split('\n')[0]).toBe('🔴 *Job failed: egyptair-jobs@digest*');
    expect(s).toContain('*Since:* 2026-09-14 23:30 UTC · *Seen:* 3×');
    expect(s).toContain('*What I see:*\n```line1\nline2```');
    expect(s).toContain('*Diagnosis:* SMTP creds expired.');
    expect(s).toContain('*Fixing:* restarting egyptair-jobs@digest');
  });
  it('needs-you footer and missing diagnosis', () => {
    const s = formatCard({ title: 't', firstSeen: '2026-09-14 23:30:02', occurrences: 1, evidence: '', diagnosis: null, footer: { kind: 'needs_you', text: 'ANTHROPIC_API_KEY is unset' } });
    expect(s).toContain('*Diagnosis:* unavailable');
    expect(s).toContain('*Needs you:* ANTHROPIC_API_KEY is unset');
    expect(s).not.toContain('What I see');
  });
  it('truncates long evidence', () => {
    expect(truncate('a'.repeat(50), 10)).toBe('aaaaaaaaa…');
    expect(truncate('short', 10)).toBe('short');
  });
  it('resolved line', () => {
    expect(formatResolved('Job failed: x')).toBe('✅ Resolved — Job failed: x has been clear for 60 min.');
  });
});
