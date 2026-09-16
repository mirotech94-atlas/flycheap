import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildProviderChain, providerCatalog } from '@/lib/ai/providers';

describe('AI provider registry', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    for (const k of ['GROQ_API_KEY','ANTHROPIC_API_KEY','OPENAI_API_KEY','OPENROUTER_API_KEY','GEMINI_API_KEY','GOOGLE_API_KEY','CF_API_TOKEN','CF_ACCOUNT_ID','CLOUDFLARE_API_TOKEN','CLOUDFLARE_ACCOUNT_ID','OLLAMA_BASE_URL']) delete process.env[k];
  });
  afterEach(() => { process.env = { ...saved }; });

  it('only includes configured providers, ordered free-first', () => {
    process.env.GROQ_API_KEY = 'g';
    process.env.ANTHROPIC_API_KEY = 'a';
    const chain = buildProviderChain();
    expect(chain[0].model).toBe('openai/gpt-oss-120b');
    expect(chain[1].model).toBe('openai/gpt-oss-20b'); // 2nd groq model, own daily bucket
    // Anthropic comes after both Groq models
    expect(chain.some(s => s.provider.startsWith('anthropic'))).toBe(true);
    const groqIdx = chain.findIndex(s => s.provider.startsWith('groq'));
    const anthIdx = chain.findIndex(s => s.provider.startsWith('anthropic'));
    expect(groqIdx).toBeLessThan(anthIdx);
    // Unconfigured providers are absent
    expect(chain.some(s => s.provider.startsWith('gemini') || s.provider.startsWith('openrouter'))).toBe(false);
  });

  it('lights up a provider once its key is present', () => {
    process.env.GROQ_API_KEY = 'g';
    process.env.OPENROUTER_API_KEY = 'or';
    const chain = buildProviderChain();
    const or = chain.find(s => s.provider.startsWith('openrouter'));
    expect(or).toBeTruthy();
    expect(or!.baseUrl).toContain('openrouter.ai');
    expect(or!.headers?.['X-Title']).toBe('FlyCheap');
  });

  it('caps attempts per provider and total', () => {
    process.env.GROQ_API_KEY = 'g';
    const chain = buildProviderChain({ maxPerProvider: 1, maxTotal: 5 });
    expect(chain.filter(s => s.provider.startsWith('groq')).length).toBe(1);
    expect(chain.length).toBeLessThanOrEqual(5);
  });

  it('catalog reports configured flags without leaking keys', () => {
    process.env.GROQ_API_KEY = 'sk-secret-value-123';
    const cat = providerCatalog();
    expect(cat.find(p => p.id === 'groq')!.configured).toBe(true);
    expect(cat.find(p => p.id === 'gemini')!.configured).toBe(false);
    // The catalog exposes no key material.
    expect(JSON.stringify(cat)).not.toContain('sk-secret-value-123');
    expect(cat.find(p => p.id === 'cloudflare')!.note).toMatch(/CF_ACCOUNT_ID/);
  });
});
