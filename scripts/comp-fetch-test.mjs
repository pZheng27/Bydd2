// One-off: can the app's tools read the realized price off a Numisbids lot?
// Tests (1) web_fetch on the exact URL, (2) web_search for the lot.
// Spends a little API credit. set -a; . ./.env.local; set +a; node scripts/comp-fetch-test.mjs
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();
const URL = "https://www.numisbids.com/n.php?lot=2375&p=lot&sid=5828";

async function run(label, tool, prompt) {
  const messages = [{ role: "user", content: prompt }];
  const blocks = [];
  try {
    for (let i = 0; i < 5; i++) {
      const r = await client.messages.create({
        model: "claude-sonnet-5",
        max_tokens: 1200,
        tools: [tool],
        messages,
      });
      blocks.push(...r.content);
      messages.push({ role: "assistant", content: r.content });
      if (r.stop_reason === "pause_turn") continue;
      break;
    }
  } catch (e) {
    console.log(`\n=== ${label} ===\nAPI ERROR: ${e.name} ${e.message}`);
    return;
  }
  const errors = [];
  for (const b of blocks) {
    if (b.type === "web_fetch_tool_result" && b.content?.error_code)
      errors.push("fetch:" + b.content.error_code);
    if (b.type === "web_search_tool_result" && b.content?.error_code)
      errors.push("search:" + b.content.error_code);
  }
  const text = blocks
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  console.log(`\n=== ${label} ===`);
  console.log("tool errors: " + (errors.join(", ") || "none"));
  console.log("answer: " + (text.slice(0, 700) || "(no text)"));
}

await run(
  "web_fetch on the exact lot URL",
  { type: "web_fetch_20260209", name: "web_fetch", max_uses: 2, allowed_domains: ["numisbids.com"] },
  `Fetch ${URL} and report the coin, the SOLD/realized/hammer price (quote it exactly), the auction house, and the date.`,
);

await run(
  "web_search on numisbids for the lot",
  { type: "web_search_20260209", name: "web_search", max_uses: 3, allowed_domains: ["numisbids.com"] },
  `Search numisbids.com for this lot: ${URL} . Report the coin and its realized/sold price (quote it exactly), auction house, and date.`,
);
