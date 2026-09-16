import 'server-only';

// Single source of truth for "which LLM provider is active right now".
// Groq is the default/preferred provider; Anthropic is kept only as a
// fallback for when GROQ_API_KEY is unset, or as an explicit opt-out via
// LLM_PROVIDER=anthropic. Every call site that used to compute this inline
// (ops detector, Slack concierge, agents/shared/client) should call
// llmProvider() instead so the decision can never drift between them.

export type LlmProvider = 'groq' | 'anthropic' | 'none';

export function llmProvider(): LlmProvider {
  const provider = process.env.LLM_PROVIDER || (process.env.GROQ_API_KEY ? 'groq' : 'anthropic');
  if (provider === 'groq' && process.env.GROQ_API_KEY) return 'groq';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  return 'none';
}

/**
 * Groq model id for a role tier. 'smart' covers curator/insights/revenue/
 * storyteller/social-poster-shaped work; 'fast' covers verifier/digest-shaped
 * work (cheap, latency-sensitive calls).
 */
export function groqModel(tier: 'smart' | 'fast'): string {
  return tier === 'smart'
    ? process.env.AGENT_MODEL_GROQ_SMART || 'openai/gpt-oss-120b'
    : process.env.AGENT_MODEL_GROQ_FAST || 'openai/gpt-oss-20b';
}
