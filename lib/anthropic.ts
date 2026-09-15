import Anthropic from "@anthropic-ai/sdk";

/**
 * Server-only Anthropic client factory. Returns null when no API key is set so
 * callers can degrade gracefully (show "AI not configured") instead of throwing.
 * The key lives only in the server environment — never expose it to the browser.
 */
export function getAnthropic(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return new Anthropic({ apiKey });
}

/** Whether the AI features are configured (key present). Safe to read on the server. */
export function aiConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

// Sonnet 5 is the cost/quality sweet spot for the pricing chat (~2.5x cheaper
// than Opus 5). Bump back to "claude-opus-5" if rule-setting accuracy needs it.
export const PRICING_MODEL = "claude-sonnet-5";
