import { describe, it, expect, afterEach, vi } from 'vitest';

const ENV_KEYS = ['GROQ_API_KEY', 'ANTHROPIC_API_KEY', 'LLM_PROVIDER', 'AGENT_MODEL_GROQ_SMART', 'AGENT_MODEL_GROQ_FAST'] as const;
const saved: Record<string, string | undefined> = {};
for (const k of ENV_KEYS) saved[k] = process.env[k];

function resetEnv() {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
}

afterEach(() => {
  resetEnv();
});

async function freshImport() {
  vi.resetModules();
  return import('@/lib/llmProvider');
}

describe('llmProvider', () => {
  it('picks groq when GROQ_API_KEY is set and no override is given', async () => {
    delete process.env.LLM_PROVIDER;
    process.env.GROQ_API_KEY = 'groq-key';
    delete process.env.ANTHROPIC_API_KEY;
    const { llmProvider, groqModel } = await freshImport();
    expect(llmProvider()).toBe('groq');
    expect(groqModel('smart')).toBe('openai/gpt-oss-120b');
    expect(groqModel('fast')).toBe('openai/gpt-oss-20b');
  });

  it('falls back to anthropic when LLM_PROVIDER=anthropic is set explicitly', async () => {
    process.env.LLM_PROVIDER = 'anthropic';
    process.env.GROQ_API_KEY = 'groq-key';
    process.env.ANTHROPIC_API_KEY = 'anthropic-key';
    const { llmProvider } = await freshImport();
    expect(llmProvider()).toBe('anthropic');
  });

  it('returns none when neither key is configured', async () => {
    delete process.env.LLM_PROVIDER;
    delete process.env.GROQ_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    const { llmProvider } = await freshImport();
    expect(llmProvider()).toBe('none');
  });

  it('honours env overrides for the groq model ids', async () => {
    process.env.AGENT_MODEL_GROQ_SMART = 'openai/custom-smart';
    process.env.AGENT_MODEL_GROQ_FAST = 'openai/custom-fast';
    const { groqModel } = await freshImport();
    expect(groqModel('smart')).toBe('openai/custom-smart');
    expect(groqModel('fast')).toBe('openai/custom-fast');
  });
});
