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

export const PRICING_MODEL = "claude-opus-5";
