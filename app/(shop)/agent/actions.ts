"use server";

import type Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { getAnthropic, PRICING_MODEL } from "@/lib/anthropic";
import { embeddedOne } from "@/lib/catalog";
import { fmtMoney } from "@/lib/format";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ChatMsg = { role: "user" | "assistant"; content: string };

export type OfferProposalItem = {
  itemId: string;
  title: string;
  dealerName: string;
};
export type OfferProposal = {
  items: OfferProposalItem[];
  priceCents: number;
  parallel: boolean;
  note: string | null;
};

export type BuyerChatResult =
  | { ok: true; reply: string; proposal?: OfferProposal }
  | { ok: false; error: string };

function usdToCents(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
}

async function myContext(supabase: SupabaseClient) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: prof } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!prof) return null;
  const { data: col } = await supabase
    .from("collections")
    .select("id")
    .eq("profile_id", prof.id)
    .maybeSingle();
  return { profileId: prof.id as string, collectionId: (col?.id as string) ?? null };
}

type SlotCoin = { id: string; name: string };
type MemberRow = { coin_type: SlotCoin | SlotCoin[] | null };

/** A plain-text summary of the collector's set gaps, with coin_type_ids so the
 *  agent can search listings for them. */
async function buildGapsSummary(
  supabase: SupabaseClient,
  collectionId: string | null,
): Promise<string> {
  if (!collectionId) return "The collector has no collection yet.";
  const { data: sets } = await supabase
    .from("collection_sets")
    .select("id, name, source_set_id")
    .eq("collection_id", collectionId)
    .not("source_set_id", "is", null);
  if (!sets?.length) return "The collector has no checklist (series) sets yet.";

  const lines: string[] = [];
  for (const s of sets) {
    const { data: memberRows } = await supabase
      .from("collection_set_members")
      .select("coin_type:coin_types(id, name)")
      .eq("collection_set_id", s.id);
    const members = ((memberRows ?? []) as unknown as MemberRow[])
      .map((m) => embeddedOne<SlotCoin>(m.coin_type))
      .filter((c): c is SlotCoin => !!c);
    if (!members.length) continue;

    const ids = members.map((c) => c.id);
    const { data: mine } = await supabase
      .from("collection_items")
      .select("coin_type_id")
      .eq("collection_id", collectionId)
      .in("coin_type_id", ids);
    const owned = new Set((mine ?? []).map((r) => r.coin_type_id));
    const missing = members.filter((c) => !owned.has(c.id));

    lines.push(
      `Set "${s.name}": owns ${members.length - missing.length}/${members.length}.` +
        (missing.length
          ? " Missing: " +
            missing
              .slice(0, 15)
              .map((c) => `${c.name} [coin_type_id=${c.id}]`)
              .join("; ") +
            (missing.length > 15 ? ` (+${missing.length - 15} more)` : "")
          : " Complete!"),
    );
  }
  return lines.length ? lines.join("\n") : "No checklist sets with coins yet.";
}

const SEARCH_TOOL: Anthropic.Tool = {
  name: "search_listings",
  description:
    "Search the marketplace for coins currently listed for sale, to find ones that fill the collector's gaps. Prefer coin_type_id (from the gaps list) for an exact match; or a free-text query; and an optional max price. Returns listings with their id, price, grade, and dealer.",
  input_schema: {
    type: "object",
    properties: {
      coin_type_id: { type: "string", description: "Catalog id of the wanted coin (from the gaps)." },
      query: { type: "string", description: "Free-text over title/series, e.g. 'Morgan Dollar'." },
      max_price_usd: { type: "number", description: "Only listings at or below this price." },
    },
    additionalProperties: false,
  },
};

const PROPOSE_TOOL: Anthropic.Tool = {
  name: "propose_offer",
  description:
    "Propose an offer for the collector to CONFIRM. This never sends on its own — the collector taps Confirm. Pass 1 listing id for a single offer, or up to 5 ids of the SAME coin from different dealers for a PARALLEL offer (first dealer to accept wins, the rest auto-cancel). All get the same price.",
  input_schema: {
    type: "object",
    properties: {
      inventory_item_ids: {
        type: "array",
        items: { type: "string" },
        description: "1–5 marketplace listing ids to offer on.",
      },
      price_usd: { type: "number", description: "Offer price per coin, in US dollars." },
      note: { type: "string", description: "Optional short note to the dealer(s)." },
    },
    required: ["inventory_item_ids", "price_usd"],
    additionalProperties: false,
  },
};

type ListingRow = {
  id: string;
  title: string | null;
  series: string | null;
  grade: number | null;
  price_cents: number;
  dealer: { business_name: string | null; profile_id: string } | { business_name: string | null; profile_id: string }[] | null;
};

async function searchListings(
  supabase: SupabaseClient,
  myProfileId: string,
  input: { coin_type_id?: string; query?: string; max_price_usd?: number },
): Promise<string> {
  let q = supabase
    .from("inventory_items")
    .select("id, title, series, grade, price_cents, dealer:dealers(business_name, profile_id)")
    .eq("is_public", true)
    .eq("status", "listed")
    .limit(20);
  if (typeof input.coin_type_id === "string") q = q.eq("coin_type_id", input.coin_type_id);
  if (typeof input.query === "string" && input.query.trim())
    q = q.or(`title.ilike.%${input.query}%,series.ilike.%${input.query}%`);
  const maxCents = usdToCents(input.max_price_usd);
  if (maxCents != null) q = q.lte("price_cents", maxCents);

  const { data } = await q;
  const rows = ((data ?? []) as ListingRow[])
    .map((r) => ({ r, d: embeddedOne<{ business_name: string | null; profile_id: string }>(r.dealer) }))
    .filter((x) => x.d && x.d.profile_id !== myProfileId); // never the collector's own listing
  if (!rows.length) return "No matching listings found.";
  return JSON.stringify(
    rows.map((x) => ({
      inventory_item_id: x.r.id,
      title: x.r.title,
      series: x.r.series,
      grade: x.r.grade,
      price: fmtMoney(x.r.price_cents),
      dealer: x.d!.business_name ?? "a dealer",
    })),
  );
}

/** Resolve a propose_offer tool call into a validated proposal (never fires). */
async function buildProposal(
  supabase: SupabaseClient,
  myProfileId: string,
  input: { inventory_item_ids?: unknown; price_usd?: unknown; note?: unknown },
): Promise<{ proposal: OfferProposal | null; summary: string }> {
  const ids = Array.isArray(input.inventory_item_ids)
    ? input.inventory_item_ids.map(String).slice(0, 5)
    : [];
  const priceCents = usdToCents(input.price_usd);
  if (!ids.length || priceCents == null)
    return { proposal: null, summary: "Need at least one listing and a valid price." };

  const { data } = await supabase
    .from("inventory_items")
    .select("id, title, dealer:dealers(business_name, profile_id)")
    .in("id", ids)
    .eq("is_public", true)
    .eq("status", "listed");
  const items: OfferProposalItem[] = [];
  for (const r of (data ?? []) as ListingRow[]) {
    const d = embeddedOne<{ business_name: string | null; profile_id: string }>(r.dealer);
    if (!d || d.profile_id === myProfileId) continue; // skip own / invalid
    items.push({ itemId: r.id, title: r.title ?? "Coin", dealerName: d.business_name ?? "a dealer" });
  }
  if (!items.length)
    return { proposal: null, summary: "Those listings aren't available to offer on." };

  const note = typeof input.note === "string" ? input.note : null;
  const proposal: OfferProposal = { items, priceCents, parallel: items.length > 1, note };
  const summary = `Proposed ${fmtMoney(priceCents)}${items.length > 1 ? ` to ${items.length} dealers (parallel — first to accept wins)` : ""} on: ${items
    .map((i) => `${i.title} (${i.dealerName})`)
    .join(", ")}. Awaiting the collector's confirmation.`;
  return { proposal, summary };
}

export async function sendBuyerMessage(
  history: ChatMsg[],
  userText: string,
): Promise<BuyerChatResult> {
  const text = (userText ?? "").trim();
  if (!text) return { ok: false, error: "Please type a message." };

  const supabase = await createClient();
  const ctx = await myContext(supabase);
  if (!ctx) return { ok: false, error: "Please sign in." };

  const anthropic = getAnthropic();
  if (!anthropic) return { ok: false, error: "The AI isn't configured yet (missing API key)." };

  const gaps = await buildGapsSummary(supabase, ctx.collectionId);

  const system = `You are the BUYER agent for a coin collector on Bydd, a rare-coin marketplace. You help them complete their sets by finding coins and drafting offers. You talk to the collector directly.

The collector's set gaps (what they own vs. what's missing), with catalog ids:
${gaps}

What you can do:
- search_listings — find coins for sale that fill a gap (search by coin_type_id from the gaps, or free text, with an optional budget).
- propose_offer — draft an offer for the collector to CONFIRM. A single listing = one offer. Up to 5 listings of the SAME coin from different dealers = a PARALLEL offer: one price to all, the first dealer to accept wins and the rest cancel automatically.

Rules:
- You NEVER send an offer yourself. propose_offer only drafts it; the collector taps Confirm.
- Respect any budget the collector states; propose at or below it.
- Recommend the next pieces to fill a set within their budget, matching gaps to real current listings (use search_listings — don't invent listings or prices).
- Keep replies short, concrete, and in plain collector language. When you propose an offer, say briefly why (which gap it fills, the price vs. asking).`;

  const messages: Anthropic.MessageParam[] = [
    ...history.slice(-16).map((h) => ({ role: h.role, content: h.content })),
    { role: "user", content: text },
  ];
  const tools = [SEARCH_TOOL, PROPOSE_TOOL];

  let proposal: OfferProposal | undefined;
  let finalText = "";
  try {
    for (let i = 0; i < 6; i++) {
      const resp = await anthropic.messages.create({
        model: PRICING_MODEL,
        max_tokens: 2048,
        system,
        tools,
        messages,
      });
      messages.push({ role: "assistant", content: resp.content });

      const toolUses = resp.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
      );
      if (resp.stop_reason === "tool_use" && toolUses.length > 0) {
        const results: Anthropic.ToolResultBlockParam[] = [];
        for (const tu of toolUses) {
          if (tu.name === "search_listings") {
            const out = await searchListings(supabase, ctx.profileId, tu.input as Record<string, never>);
            results.push({ type: "tool_result", tool_use_id: tu.id, content: out });
          } else if (tu.name === "propose_offer") {
            const { proposal: p, summary } = await buildProposal(
              supabase,
              ctx.profileId,
              tu.input as Record<string, never>,
            );
            if (p) proposal = p;
            results.push({ type: "tool_result", tool_use_id: tu.id, content: summary });
          } else {
            results.push({ type: "tool_result", tool_use_id: tu.id, content: "Unknown tool.", is_error: true });
          }
        }
        messages.push({ role: "user", content: results });
        continue;
      }

      finalText = resp.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      break;
    }
  } catch (err) {
    console.error("buyer agent error", err);
    return { ok: false, error: "The AI had trouble responding. Please try again." };
  }

  if (!finalText)
    finalText = proposal
      ? "Here's an offer to review."
      : "Sorry, I didn't catch that — could you rephrase?";
  return { ok: true, reply: finalText, proposal };
}

/**
 * Fire the offer(s) the collector confirmed. Re-validates each listing server
 * side; multiple items share a parallel_group_id (first acceptance wins).
 */
export async function confirmOffer(input: {
  itemIds: string[];
  priceCents: number;
  note?: string | null;
}): Promise<{ ok: boolean; sent: number; error?: string }> {
  const supabase = await createClient();
  const ctx = await myContext(supabase);
  if (!ctx) return { ok: false, sent: 0, error: "Please sign in." };

  const ids = (input.itemIds ?? []).slice(0, 5);
  const priceCents = Math.round(input.priceCents);
  if (!ids.length || !Number.isFinite(priceCents) || priceCents <= 0)
    return { ok: false, sent: 0, error: "Invalid offer." };

  const { data: itemsData } = await supabase
    .from("inventory_items")
    .select("id, dealer:dealers(profile_id)")
    .in("id", ids)
    .eq("is_public", true)
    .eq("status", "listed");
  const targets: { itemId: string; sellerProfileId: string }[] = [];
  for (const r of (itemsData ?? []) as ListingRow[]) {
    const d = embeddedOne<{ profile_id: string }>(r.dealer);
    if (d && d.profile_id !== ctx.profileId) targets.push({ itemId: r.id, sellerProfileId: d.profile_id });
  }
  if (!targets.length) return { ok: false, sent: 0, error: "Those listings are no longer available." };

  const parallelGroup = targets.length > 1 ? crypto.randomUUID() : null;
  const rows = targets.map((t) => ({
    inventory_item_id: t.itemId,
    from_profile_id: ctx.profileId,
    to_profile_id: t.sellerProfileId,
    price_cents: priceCents,
    message: input.note ?? null,
    parallel_group_id: parallelGroup,
  }));
  const { error } = await supabase.from("offers").insert(rows);
  if (error) return { ok: false, sent: 0, error: error.message };
  return { ok: true, sent: targets.length };
}
