// Part C config: the ONLY sources the pricing assistant may search for comps,
// plus how it should use them. Edit COMP_DOMAINS to change which sites it can
// draw from — it can reach NOTHING outside this list (enforced by the search
// tool, not just the prompt). Defaults are the sites most likely to expose
// public realized auction prices; replace with your own approved list.
export const COMP_DOMAINS = [
  "greatcollections.com",
  "stacksbowers.com",
  "pcgs.com",
  "ngccoin.com",
  "ha.com",
];

/** Max web searches the assistant may run per message (cost/latency cap). */
export const MAX_COMP_SEARCHES = 3;

/** Plain-English rules for HOW to use comps — folded into the system prompt. */
export const COMP_GUIDANCE =
  "Prefer realized/hammer auction prices over retail asking prices. Favor recent sales (roughly the last 12 months). Always cite the source site and the sale date. If a source returns nothing useful, say so rather than guessing.";
