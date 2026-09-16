import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropic, PRICING_MODEL } from "@/lib/anthropic";
import {
  AUCTION_WATCH_DOMAINS,
  MAX_COMP_SEARCHES,
  MAX_COMP_FETCHES,
} from "@/lib/comps";

export type AuctionLot = {
  title: string;
  price: string | null;
  auction_house: string | null;
  sale_date: string | null;
  url: string;
};

export type WatchItem = {
  title: string | null;
  series?: string | null;
  year?: number | null;
  mintmark?: string | null;
  variety?: string | null;
  metal?: string | null;
  grade?: number | null;
  designation?: string | null;
  grading_service?: string | null;
};

const REPORT_TOOL: Anthropic.Tool = {
  name: "report_upcoming_lots",
  description:
    "Report the comparable UPCOMING auction lots you found (lots in a current or future auction that have NOT sold yet). Call this exactly once with your final list — an empty array if you found none.",
  input_schema: {
    type: "object",
    properties: {
      lots: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            price: {
              type: "string",
              description:
                "current bid or estimate with currency, or empty if none shown",
            },
            auction_house: { type: "string" },
            sale_date: { type: "string" },
            url: { type: "string" },
          },
          required: ["title", "url"],
        },
      },
    },
    required: ["lots"],
  },
};

function specString(item: WatchItem): string {
  return [
    item.year != null && `year ${item.year}`,
    item.mintmark && `mint ${item.mintmark}`,
    item.variety && `variety ${item.variety}`,
    item.metal && `metal ${item.metal}`,
    item.grade != null &&
      `grade ${item.grade}${item.designation ? ` ${item.designation}` : ""}`,
    item.grading_service && `service ${item.grading_service}`,
  ]
    .filter(Boolean)
    .join("; ");
}

/**
 * Search Numisbids for UPCOMING auction lots comparable to a coin (for the
 * weekly auction-watch). Returns up to 5 lots; [] if none or AI not configured.
 */
export async function findUpcomingAuctionLots(
  item: WatchItem,
): Promise<AuctionLot[]> {
  const anthropic = getAnthropic();
  if (!anthropic || !item.title) return [];

  const specs = specString(item);
  const system = `You help a coin dealer's auction-watch. Find UPCOMING auction lots comparable to their coin, using ONLY numisbids.com. "Upcoming" means a lot in a current or future auction that has NOT sold yet (it shows an estimate or a current/starting bid, not a realized price) — never include already-sold lots. A comparable lot matches: same date + mint mark + variety; grade exact or within +/-5 points. Use web_search, and web_fetch to open a lot page when needed. Then call report_upcoming_lots once with up to 5 lots (empty array if none). Coin: ${item.title}${specs ? ` (${specs})` : ""}.`;

  const tools = [
    {
      type: "web_search_20260209",
      name: "web_search",
      max_uses: MAX_COMP_SEARCHES,
      allowed_domains: AUCTION_WATCH_DOMAINS,
    },
    {
      type: "web_fetch_20260209",
      name: "web_fetch",
      max_uses: MAX_COMP_FETCHES,
      allowed_domains: AUCTION_WATCH_DOMAINS,
    },
    REPORT_TOOL,
  ] as Anthropic.MessageCreateParams["tools"];

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `Find comparable upcoming auction lots for: ${item.title}`,
    },
  ];

  try {
    for (let i = 0; i < 8; i++) {
      const r = await anthropic.messages.create({
        model: PRICING_MODEL,
        max_tokens: 2048,
        output_config: { effort: "low" },
        system,
        tools,
        messages,
      });
      messages.push({ role: "assistant", content: r.content });

      const reportCall = r.content.find(
        (b): b is Anthropic.ToolUseBlock =>
          b.type === "tool_use" && b.name === "report_upcoming_lots",
      );
      if (reportCall) {
        const lots = (reportCall.input as { lots?: AuctionLot[] }).lots ?? [];
        return lots
          .filter((l) => l && l.title && l.url)
          .slice(0, 5)
          .map((l) => ({
            title: l.title,
            price: l.price || null,
            auction_house: l.auction_house || null,
            sale_date: l.sale_date || null,
            url: l.url,
          }));
      }
      if (r.stop_reason === "pause_turn") continue;
      break; // end_turn without a report → none found
    }
  } catch (e) {
    console.error("auction watch search error", e);
  }
  return [];
}
