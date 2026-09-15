"use server";

import { revalidatePath } from "next/cache";
import type Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { getAnthropic, PRICING_MODEL } from "@/lib/anthropic";
import { evaluateRule, type EvaluateResult, type Metal } from "@/lib/domain/pricing";
import { itemSignals, effectiveGoldCents } from "@/lib/pricing-context";
import { COMP_DOMAINS, MAX_COMP_SEARCHES, COMP_GUIDANCE } from "@/lib/comps";
import { fmtMoney } from "@/lib/format";

type RuleParams = {
  metal?: string;
  fine_weight_oz?: number | null;
  pct_over_spot?: number | null;
  floor_cents?: number | null;
  max_daily_move_pct?: number | null;
  demand_bump_pct?: number | null;
  views_threshold?: number | null;
  watches_threshold?: number | null;
  use_comp?: boolean;
};

export type ChatResult =
  | { ok: true; reply: string; ruleChanged: boolean }
  | { ok: false; error: string };

// The one tool the agent uses: it configures the deterministic engine's knobs.
// All fields optional so the agent can make partial edits ("raise the floor").
const RULE_TOOL: Anthropic.Tool = {
  name: "set_pricing_rule",
  description:
    "Create or update this coin's automatic pricing rule. Include ONLY the fields the dealer wants to set or change; omitted fields keep their current value. The deterministic engine recomputes the price from these settings — you never set the price directly.",
  input_schema: {
    type: "object",
    properties: {
      metal: {
        type: "string",
        enum: ["gold", "silver", "copper", "nickel", "clad", "other"],
      },
      fine_weight_oz: {
        type: "number",
        description:
          "Pure precious-metal content in troy ounces (e.g. 0.9675 for a $20 Double Eagle, 0.5 for a half ounce).",
      },
      pct_over_spot: {
        type: "number",
        description: "Percent over the metal's melt value, e.g. 4 means 4%.",
      },
      floor_usd: {
        type: "number",
        description: "Hard minimum price in US dollars.",
      },
      demand_bump_pct: {
        type: "number",
        description: "Raise the price by this percent when the coin is popular.",
      },
      views_threshold: {
        type: "number",
        description: "Count as popular at or above this many views.",
      },
      watches_threshold: {
        type: "number",
        description: "Count as popular at or above this many watchers.",
      },
      use_comp: {
        type: "boolean",
        description: "If true, never price below recent comparable sales.",
      },
      max_daily_move_pct: {
        type: "number",
        description: "Cap how far the price may move in one update, as a percent.",
      },
    },
    additionalProperties: false,
  },
};

function n(v: unknown): number | null {
  if (v == null) return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

export async function sendChatMessage(
  itemId: string,
  userText: string,
): Promise<ChatResult> {
  const text = userText.trim();
  if (!itemId || !text) return { ok: false, error: "Please type a message." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in." };

  const { data: item } = await supabase
    .from("inventory_items")
    .select("id, title, price_cents, view_count, dealer_id")
    .eq("id", itemId)
    .single();
  if (!item) return { ok: false, error: "Item not found." };

  // Ownership check — the public read policy would let anyone read a listing.
  const { data: dealer } = await supabase
    .from("dealers")
    .select("id, profile_id")
    .eq("id", item.dealer_id)
    .maybeSingle();
  const { data: prof } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!dealer || !prof || dealer.profile_id !== prof.id) {
    return { ok: false, error: "This isn't your item." };
  }

  const anthropic = getAnthropic();
  if (!anthropic) {
    return { ok: false, error: "The AI isn't configured yet (missing API key)." };
  }

  // Current rule + live signals so the agent (and its previews) reflect reality.
  const { data: ruleRow } = await supabase
    .from("pricing_rules")
    .select("params")
    .eq("inventory_item_id", itemId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  let params: RuleParams = (ruleRow?.params as RuleParams) ?? {};

  const spotCents = await effectiveGoldCents(supabase);
  const { watches, compCents } = await itemSignals(supabase, {
    itemId,
    itemTitle: item.title,
    sellerProfileId: dealer.profile_id,
  });
  const views = item.view_count ?? 0;
  const { data: costRow } = await supabase
    .from("inventory_costs")
    .select("cost_cents")
    .eq("inventory_item_id", itemId)
    .maybeSingle();
  const costCents = costRow?.cost_cents ?? null;

  function preview(p: RuleParams): EvaluateResult | null {
    if (p.fine_weight_oz == null || spotCents == null) return null;
    return evaluateRule({
      currentPriceCents: item!.price_cents,
      rule: {
        kind: "spot_plus_pct",
        metal: (p.metal ?? "gold") as Metal,
        fineWeightOz: p.fine_weight_oz,
        pctOverSpot: p.pct_over_spot ?? 0,
      },
      context: { spotPerOzCents: spotCents, views, watches, compCents },
      guardrails: {
        floorCents: p.floor_cents ?? null,
        costCents,
        maxDailyMovePct: p.max_daily_move_pct ?? null,
      },
      signals: {
        demandBumpPct: p.demand_bump_pct ?? null,
        viewsThreshold: p.views_threshold ?? null,
        watchesThreshold: p.watches_threshold ?? null,
        useComp: p.use_comp ?? false,
      },
    });
  }

  async function applyRuleChange(input: Record<string, unknown>): Promise<string> {
    const next: RuleParams = { ...params };
    if (typeof input.metal === "string") next.metal = input.metal;
    if (n(input.fine_weight_oz) != null) next.fine_weight_oz = n(input.fine_weight_oz);
    if (n(input.pct_over_spot) != null) next.pct_over_spot = n(input.pct_over_spot);
    if (n(input.floor_usd) != null)
      next.floor_cents = Math.round((n(input.floor_usd) as number) * 100);
    if (n(input.demand_bump_pct) != null) next.demand_bump_pct = n(input.demand_bump_pct);
    if (n(input.views_threshold) != null) next.views_threshold = n(input.views_threshold);
    if (n(input.watches_threshold) != null)
      next.watches_threshold = n(input.watches_threshold);
    if (typeof input.use_comp === "boolean") next.use_comp = input.use_comp;
    if (n(input.max_daily_move_pct) != null)
      next.max_daily_move_pct = n(input.max_daily_move_pct);

    await supabase.from("pricing_rules").delete().eq("inventory_item_id", itemId);
    await supabase.from("pricing_rules").insert({
      inventory_item_id: itemId,
      kind: "spot_plus_pct",
      params: next,
      is_active: true,
    });
    params = next;

    if (next.fine_weight_oz == null) {
      return "Saved. I still need the coin's fine (pure metal) weight in troy ounces before I can compute a price — ask the dealer for it.";
    }
    if (spotCents == null) {
      return "Saved, but there's no live metal price available right now, so I can't preview the number.";
    }
    const pv = preview(next);
    if (!pv) return "Saved.";
    const held = [
      pv.applied.floor && "floor",
      pv.applied.cost && "cost",
      pv.applied.comp && "comps",
      pv.applied.dailyMove && "max move",
    ].filter(Boolean);
    const bits = [
      `New suggested price: ${fmtMoney(pv.priceCents)} (currently listed at ${fmtMoney(item!.price_cents)}).`,
    ];
    if (pv.applied.demand) bits.push("A demand bump is being applied.");
    if (held.length) bits.push(`Held by ${held.join(", ")}.`);
    bits.push(
      "Tell the dealer they can click \"Reprice now\" to apply it immediately, or it applies on the next daily update.",
    );
    return bits.join(" ");
  }

  // Load recent history and record the new user turn.
  const { data: hist } = await supabase
    .from("agent_chat_messages")
    .select("role, content")
    .eq("inventory_item_id", itemId)
    .order("created_at", { ascending: true })
    .limit(20);
  await supabase
    .from("agent_chat_messages")
    .insert({ inventory_item_id: itemId, role: "user", content: text });

  const ruleSummary = JSON.stringify({
    metal: params.metal ?? null,
    fine_weight_oz: params.fine_weight_oz ?? null,
    pct_over_spot: params.pct_over_spot ?? null,
    floor_usd: params.floor_cents != null ? params.floor_cents / 100 : null,
    demand_bump_pct: params.demand_bump_pct ?? null,
    views_threshold: params.views_threshold ?? null,
    watches_threshold: params.watches_threshold ?? null,
    use_comp: params.use_comp ?? false,
    max_daily_move_pct: params.max_daily_move_pct ?? null,
  });

  const system = `You are the pricing agent for ONE coin in a dealer's inventory on Bydd, a rare-coin marketplace. You talk with the DEALER (a professional numismatist) to set up and adjust this coin's automatic pricing.

How pricing works: a deterministic engine computes the price — you do NOT set the price directly. You configure the engine's settings with the set_pricing_rule tool and the engine does the math. Settings:
- metal + fine_weight_oz + pct_over_spot -> base price = live metal spot x fine weight x (1 + pct/100)
- floor_usd -> a hard minimum
- use_comp -> never price below recent comparable sales
- demand_bump_pct with views_threshold and/or watches_threshold -> raise the price when interest is high
- max_daily_move_pct -> cap how far the price can move per update
Only include the fields the dealer wants to change; the rest keep their current value.

Current state of this coin:
- Title: ${item.title || "Untitled coin"}
- Listed price: ${fmtMoney(item.price_cents)}
- Live gold spot: ${spotCents != null ? `${fmtMoney(spotCents)}/oz` : "unknown"}
- Views: ${views}; watchers: ${watches}; recent comparable sale: ${compCents != null ? fmtMoney(compCents) : "none on record"}
- Current rule settings: ${ruleSummary}

Guidelines:
- Keep replies short, concrete, and in plain dealer language. No code, no JSON.
- Use the dealer's own numbers. Never invent a weight, cost, or metal. If you need the fine (pure metal) weight or the metal to compute a price and it isn't known, ask for it.
- After you change settings, state the resulting suggested price (the tool result gives it to you) and that they can hit "Reprice now" or wait for the daily update.
- You only configure the engine; never claim you'll move the price yourself outside it.

Looking up comps: You can search approved sources with the web_search tool, but ONLY when the dealer asks about market value, recent sales, or "what are these going for" — not for routine rule edits. ${COMP_GUIDANCE} Findings are ADVISORY: summarize what you found with its source and date, and you may recommend a rule change, but do NOT call set_pricing_rule based only on web comps — ask the dealer to confirm first.`;

  const messages: Anthropic.MessageParam[] = [
    ...(hist ?? []).map((h) => ({
      role: h.role as "user" | "assistant",
      content: h.content as string,
    })),
    { role: "user", content: text },
  ];

  const tools = [
    RULE_TOOL,
    {
      type: "web_search_20260209",
      name: "web_search",
      max_uses: MAX_COMP_SEARCHES,
      allowed_domains: COMP_DOMAINS,
    },
  ] as Anthropic.MessageCreateParams["tools"];

  let ruleChanged = false;
  let finalText = "";
  try {
    for (let i = 0; i < 6; i++) {
      const resp = await anthropic.messages.create({
        model: PRICING_MODEL,
        max_tokens: 4096,
        thinking: { type: "adaptive" },
        output_config: { effort: "low" },
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
          if (tu.name === "set_pricing_rule") {
            ruleChanged = true;
            const summary = await applyRuleChange(
              tu.input as Record<string, unknown>,
            );
            results.push({
              type: "tool_result",
              tool_use_id: tu.id,
              content: summary,
            });
          } else {
            results.push({
              type: "tool_result",
              tool_use_id: tu.id,
              content: "Unknown tool.",
              is_error: true,
            });
          }
        }
        messages.push({ role: "user", content: results });
        continue;
      }

      // The web_search server tool can make the model pause mid-turn; its
      // results are already in resp.content, so just let the turn continue.
      if (resp.stop_reason === "pause_turn") {
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
    console.error("pricing chat error", err);
    return { ok: false, error: "The AI had trouble responding. Please try again." };
  }

  if (!finalText) {
    finalText = ruleChanged
      ? "Updated the pricing settings."
      : "Sorry, I didn't catch that — could you rephrase?";
  }

  await supabase
    .from("agent_chat_messages")
    .insert({ inventory_item_id: itemId, role: "assistant", content: finalText });
  revalidatePath(`/dealer/inventory/${itemId}`);

  return { ok: true, reply: finalText, ruleChanged };
}
