// Part C config: the ONLY sources the pricing assistant may search for comps,
// plus how it should use them. COMP_DOMAINS is a hard fence (it can reach
// nothing else); COMP_GUIDANCE is the dealer's rules, folded into the prompt.

// US: PCGS/NGC Auction Prices Realized (sold). World & ancient: Numisbids/biddr
// (live). Edit this list to change which sites are reachable at all.
export const COMP_DOMAINS = [
  "pcgs.com",
  "ngccoin.com",
  "numisbids.com",
  "biddr.com",
];

/** Max web searches the assistant may run per message (cost/latency cap). */
export const MAX_COMP_SEARCHES = 3;

/** Dealer's rules for HOW to gather and show comps — folded into the prompt. */
export const COMP_GUIDANCE = [
  "First classify the coin from its title/specs as US or World/Ancient.",
  "",
  "US coins — show REALIZED/SOLD auction prices ONLY, from pcgs.com and ngccoin.com Auction Prices Realized (the SOLD data, NOT the price guide). Prefer PCGS over NGC and always note which service each comp is. Do not show sold comps for world/ancient coins yet.",
  "",
  "World & ancient coins — show CURRENT/UPCOMING live auction listings ONLY, from numisbids.com and biddr.com. Prefer Numisbids over biddr, and never show the same lot from both (de-duplicate). Do not show realized/sold comps for world/ancient yet.",
  "",
  "For each comparable, show: price, grade + grading service, auction name + date, and a link. Show up to 3.",
  "A comparable must match: same date + mint mark + variety; grade exact or within +/-5 points; flag when the grading service differs.",
  "Recency for realized comps: last 12 months; expand to the last 60 months only if fewer than 3 results appear in the last 12.",
  "Never use eBay, raw/ungraded coins when comparing a graded coin, or problem/cleaned coins.",
].join("\n");
