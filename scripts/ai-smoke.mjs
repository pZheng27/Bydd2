// Dev utility: verify the Anthropic key + model + tool schema WITHOUT spending
// credit. Uses count_tokens (free) — confirms auth, the model id, and that the
// pricing tool schema is accepted. Run with ANTHROPIC_API_KEY in the env.
//   (bash)  set -a; . ./.env.local; set +a; node scripts/ai-smoke.mjs
import Anthropic from "@anthropic-ai/sdk";

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("Missing ANTHROPIC_API_KEY in the environment.");
  process.exit(1);
}

const client = new Anthropic();
try {
  const r = await client.messages.countTokens({
    model: "claude-opus-5",
    system: "You are the pricing agent for a coin.",
    messages: [{ role: "user", content: "price it 5% over spot, floor $2,600" }],
    tools: [
      {
        name: "set_pricing_rule",
        description: "Configure the pricing rule.",
        input_schema: {
          type: "object",
          properties: {
            pct_over_spot: { type: "number" },
            floor_usd: { type: "number" },
          },
          additionalProperties: false,
        },
      },
    ],
  });
  console.log("✅ key + model + tool OK. input_tokens =", r.input_tokens);
} catch (e) {
  console.error("❌ smoke test failed:", e.name, e.message);
  process.exit(1);
}
