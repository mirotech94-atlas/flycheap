import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const ENV_KEYS = ['CLIENT_HOST', 'ADMIN_HOST', 'NEXT_PUBLIC_ADMIN_HOST', 'NEXT_PUBLIC_CLIENT_HOST', 'MARKETING_HOST'] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('hosts (no env set)', () => {
  it('defaults to the legacy hosts', async () => {
    vi.resetModules();
    const hosts = await import('@/lib/hosts');
    expect(hosts.CLIENT_HOST).toBe('flycheap.18dn.com');
    expect(hosts.ADMIN_HOST).toBe('admin.flycheap.18dn.com');
    expect(hosts.APP_URL).toBe('https://flycheap.18dn.com');
  });

  it('isOurHost recognizes our hosts and rejects others', async () => {
    vi.resetModules();
    const { isOurHost } = await import('@/lib/hosts');
    expect(isOurHost('my.flycheap.live')).toBe(true);
    expect(isOurHost('admin.flycheap.18dn.com:443')).toBe(true);
    expect(isOurHost('localhost:3000')).toBe(true);
    expect(isOurHost('flights.customer.com')).toBe(false);
  });

  it('MARKETING_HOSTS is empty when MARKETING_HOST is unset', async () => {
    vi.resetModules();
    const hosts = await import('@/lib/hosts');
    expect(hosts.MARKETING_HOSTS.size).toBe(0);
  });
});

describe('hosts (env override)', () => {
  it('CLIENT_HOST env overrides default and cleans scheme/slash', async () => {
    process.env.CLIENT_HOST = 'https://my.flycheap.live/';
    vi.resetModules();
    const hosts = await import('@/lib/hosts');
    expect(hosts.CLIENT_HOST).toBe('my.flycheap.live');
  });

  it('ADMIN_HOST env override is reflected in ADMIN_HOSTS', async () => {
    process.env.ADMIN_HOST = 'admin.flycheap.live';
    vi.resetModules();
    const hosts = await import('@/lib/hosts');
    expect(hosts.ADMIN_HOSTS.has('admin.flycheap.live')).toBe(true);
  });

  it('PUBLIC_CLIENT_HOST reads NEXT_PUBLIC_CLIENT_HOST, falling back to CLIENT_HOST', async () => {
    process.env.NEXT_PUBLIC_CLIENT_HOST = 'my.flycheap.live';
    vi.resetModules();
    const hosts = await import('@/lib/hosts');
    expect(hosts.PUBLIC_CLIENT_HOST).toBe('my.flycheap.live');
  });

  it('PUBLIC_CLIENT_HOST equals CLIENT_HOST when NEXT_PUBLIC_CLIENT_HOST is unset', async () => {
    vi.resetModules();
    const hosts = await import('@/lib/hosts');
    expect(hosts.PUBLIC_CLIENT_HOST).toBe(hosts.CLIENT_HOST);
  });

  it('MARKETING_HOST env is cleaned and reflected in MARKETING_HOSTS and OUR_HOSTS', async () => {
    process.env.MARKETING_HOST = 'https://flycheap.live/';
    vi.resetModules();
    const hosts = await import('@/lib/hosts');
    expect(hosts.MARKETING_HOST).toBe('flycheap.live');
    expect(hosts.MARKETING_HOSTS.has('www.flycheap.live')).toBe(true);
    expect(hosts.isOurHost('www.flycheap.live')).toBe(true);
  });
});
