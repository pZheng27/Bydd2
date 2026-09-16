// Part C config: the ONLY sources the pricing assistant may search for comps,
// plus how it should use them. COMP_DOMAINS is a hard fence (it can reach
// nothing else); COMP_GUIDANCE is the dealer's rules, folded into the prompt.

// US: PCGS/NGC Auction Prices Realized (sold). World & ancient: Numisbids/biddr
// (SOLD lots = realized comps for pricing; UPCOMING lots = weekly auction-watch).
// Edit this list to change which sites are reachable at all.
export const COMP_DOMAINS = [
  "pcgs.com",
  "ngccoin.com",
  "numisbids.com",
  "biddr.com",
];

/** Max web searches the assistant may run per message (cost/latency cap). */
export const MAX_COMP_SEARCHES = 3;

/** Max lot-page fetches per message — used to read a realized price when the
 *  search snippet doesn't include it. */
export const MAX_COMP_FETCHES = 3;

/** Dealer's rules for HOW to gather and show comps — folded into the prompt. */
export const COMP_GUIDANCE = [
  "First classify the coin from its title/specs as US or World/Ancient.",
  "",
  "US coins — realized/SOLD auction comps from pcgs.com and ngccoin.com Auction Prices Realized (the SOLD data, NOT the price guide). Prefer PCGS over NGC and always note which service each comp is.",
  "",
  "World & ancient coins — search numisbids.com and biddr.com. Every lot there is either SOLD (it shows a realized/hammer price) or UPCOMING (a future auction not yet closed) — decide which for each lot:",
  "  - SOLD lots (with a realized price) ARE the realized comps: use these for pricing. Prefer Numisbids over biddr and never show the same lot from both (de-duplicate).",
  "  - UPCOMING lots are NOT pricing comps — they belong to the weekly auction-watch, so do not present them here as realized comps.",
  "",
  "IMPORTANT: web search returns only short snippets, which often omit the realized/hammer price. If a lot's price is not in the snippet, use web_fetch to open that lot's page and read the actual sold price before listing it. If it still isn't shown, say the realized price wasn't listed rather than guessing.",
  "",
  "For each comparable shown: price, grade + grading service, auction name + date, and a link. Show up to 3 realized/sold comps.",
  "A comparable must match: same date + mint mark + variety; grade exact or within +/-5 points; flag when the grading service differs.",
  "Recency for realized comps: last 12 months; expand to the last 60 months only if fewer than 3 results appear in the last 12.",
  "Never use eBay, raw/ungraded coins when comparing a graded coin, or problem/cleaned coins.",
].join("\n");
