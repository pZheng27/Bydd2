// One-off: test which coin sites Claude's web_search can actually pull from.
// Runs a real realized-price query per domain and reports results found.
// Spends a little API credit. Run: set -a; . ./.env.local; set +a; node scripts/comps-test.mjs
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();
const DOMAINS = [
  "greatcollections.com",
  "stacksbowers.com",
  "pcgs.com",
  "ngccoin.com",
  "ha.com",
];
const QUERY =
  "Find recent realized auction or sold prices for an 1881-S Morgan Dollar graded MS65. For each result give the price, the sale name/date, and the source URL.";

for (const domain of DOMAINS) {
  const messages = [{ role: "user", content: QUERY }];
  const blocks = [];
  try {
    for (let i = 0; i < 5; i++) {
      const resp = await client.messages.create({
        model: "claude-sonnet-5",
        max_tokens: 2048,
        tools: [
          {
            type: "web_search_20260209",
            name: "web_search",
            max_uses: 2,
            allowed_domains: [domain],
          },
        ],
        messages,
      });
      blocks.push(...resp.content);
      messages.push({ role: "assistant", content: resp.content });
      if (resp.stop_reason === "pause_turn") continue;
      break;
    }
  } catch (e) {
    console.log(`\n=== ${domain} ===\nAPI ERROR: ${e.name} ${e.message}`);
    continue;
  }

  const searches = blocks.filter(
    (b) => b.type === "server_tool_use" && b.name === "web_search",
  ).length;
  const resultBlocks = blocks.filter((b) => b.type === "web_search_tool_result");
  const urls = [];
  const errors = [];
  for (const rb of resultBlocks) {
    if (Array.isArray(rb.content)) urls.push(...rb.content.map((r) => r.url));
    else if (rb.content?.error_code) errors.push(rb.content.error_code);
  }
  const text = blocks
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  console.log(`\n=== ${domain} ===`);
  console.log(
    `searches: ${searches} | results: ${urls.length} | errors: ${errors.join(",") || "none"}`,
  );
  console.log("sample urls: " + (urls.slice(0, 4).join("  |  ") || "(none)"));
  console.log("answer: " + (text.slice(0, 600) || "(no text)"));
}
