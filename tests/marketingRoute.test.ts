import { describe, it, expect } from 'vitest';
import { marketingDecision, welcomeRedirect } from '@/lib/marketingRoute';

const opts = { marketingHost: 'flycheap.live', clientHost: 'my.flycheap.live' };

describe('marketingDecision', () => {
  it('is a no-op when the marketing host feature is off', () => {
    expect(marketingDecision('flycheap.live', '/', { marketingHost: '', clientHost: 'my.flycheap.live' }))
      .toEqual({ kind: 'none' });
  });

  it('is a no-op for hosts unrelated to the marketing host', () => {
    expect(marketingDecision('some.other.host', '/', opts)).toEqual({ kind: 'none' });
  });

  it('redirects www to the canonical bare domain', () => {
    expect(marketingDecision('www.flycheap.live', '/pricing', opts))
      .toEqual({ kind: 'canonical-redirect', host: 'flycheap.live' });
  });

  it('rewrites / to /welcome', () => {
    expect(marketingDecision('flycheap.live', '/', opts))
      .toEqual({ kind: 'rewrite', pathname: '/welcome' });
  });

  it('passes through a marketing prefix path', () => {
    expect(marketingDecision('flycheap.live', '/pricing', opts)).toEqual({ kind: 'pass' });
  });

  it('passes through a nested marketing prefix path', () => {
    expect(marketingDecision('flycheap.live', '/guides/x', opts)).toEqual({ kind: 'pass' });
  });

  it('redirects /login to the client host', () => {
    expect(marketingDecision('flycheap.live', '/login', opts))
      .toEqual({ kind: 'app-redirect', host: 'my.flycheap.live' });
  });

  it('redirects /searches to the client host', () => {
    expect(marketingDecision('flycheap.live', '/searches', opts))
      .toEqual({ kind: 'app-redirect', host: 'my.flycheap.live' });
  });

  it('redirects /dashboard to the client host', () => {
    expect(marketingDecision('flycheap.live', '/dashboard', opts))
      .toEqual({ kind: 'app-redirect', host: 'my.flycheap.live' });
  });

  it('strips the port before matching the host', () => {
    expect(marketingDecision('flycheap.live:443', '/', opts))
      .toEqual({ kind: 'rewrite', pathname: '/welcome' });
  });
});

describe('welcomeRedirect', () => {
  const ourHosts = new Set(['my.flycheap.live', 'flycheap.live', 'www.flycheap.live']);
  const wOpts = { marketingHost: 'flycheap.live', ourHosts };

  it('redirects the client host /welcome to the marketing root', () => {
    expect(welcomeRedirect('my.flycheap.live', '/welcome', wOpts)).toBe('/');
  });

  it('redirects a nested /welcome/x to the matching marketing sub-path', () => {
    expect(welcomeRedirect('my.flycheap.live', '/welcome/x', wOpts)).toBe('/x');
  });

  it('is a no-op on the marketing host itself', () => {
    expect(welcomeRedirect('flycheap.live', '/welcome', wOpts)).toBeNull();
  });

  it('is a no-op when the marketing host feature is off', () => {
    expect(welcomeRedirect('my.flycheap.live', '/welcome', { marketingHost: '', ourHosts })).toBeNull();
  });

  it('is a no-op for a custom domain not in ourHosts', () => {
    expect(welcomeRedirect('custom.example.com', '/welcome', wOpts)).toBeNull();
  });
});
