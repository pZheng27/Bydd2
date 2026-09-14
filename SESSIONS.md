# SESSIONS.md — step-by-step build order with Claude Code prompts

Order (revised 2026-09-11): skeleton → **seller side (manual entry)** →
**buyer side (marketplace + buying + collection shell)** → item agents →
collector side → catalog & import → routing → offers (advanced) → demand
dashboard & pilot.

> **Plan change (2026-09-11).** At the founder's request we build the **seller
> side first** and **enter inventory by hand** — no coin catalog or CSV import
> yet (catalogs get attached later) — then a **buyer side**: a public
> marketplace where any logged-in account can browse, buy (simulated), make
> offers, and save coins to a watchlist, with a buyer dashboard tying it
> together. The original "Catalog & seed" session moves later (it now also links
> the hand-entered items to the catalog). Until the catalog exists, an inventory
> item stores its own coin details and its `coin_type_id` is left empty; the
> catalog session backfills those links, which powers gap detection, routing,
> and demand. See SPEC.md §5 (inventory_items, saved_items) and §10.
>
> **Roles:** the seller side is the **Dealer** view; the buyer side is the
> **Collector** view. Every buyer account is a collector too — it has a
> **collection built in** (auto-created), scaffolded in Session 2 and filled in
> (adding coins, sets, gaps, wants) in Session 5.

Each session: read CLAUDE.md and the relevant SPEC.md sections first; build one
screen/feature at a time and show it; and end with "Commit everything with a
clear message and confirm the deployed URL works."

---

## Session 0 — Skeleton ✅ done (2026-09-11)

Next.js 16 + Tailwind v4 + shadcn/ui scaffold, Supabase magic-link auth, a
`profiles` table (collector/dealer/admin flags) with RLS, a Collector/Dealer
role switcher over empty views, GitHub repo, and Vercel auto-deploy. Live at
https://bydd2.vercel.app.

---

## Session 1 — Seller side (manual entry)

> Read CLAUDE.md and SPEC.md (§4 Dealer, §5). We're on Session 1. First create
> migrations for the seller-side tables we need now: `dealers`, `inventory_items`
> (with `coin_type_id` **nullable** plus the manual descriptive fields —
> series, year, mintmark, variety, metal, fine_weight_oz — alongside grade,
> designation, grading_service, cert), and `pricing_rules` (schema only; the
> pricing logic is Session 3). Add a Supabase Storage bucket for item photos.
> Wire up the Supabase CLI so `npm run db:reset` runs migrations locally. Then
> build the seller screens in SPEC §4: `/dealer/profile` with the fixed category
> list; `/dealer/inventory` as a filterable table showing status
> (listed/unlisted/reserved/sold), grade, cost, price, with placeholder columns
> for active rule and last agent event; `/dealer/inventory/[id]` with placeholder
> panels for pricing rule, activity feed, comps, and demand; and
> `/dealer/requests` as an empty inbox. Build an **Add item** form where I type
> the coin's details by hand (no catalog pick, no CSV) — new items are unlisted
> by default. Then build `/sell` to list an item: upload photos to Storage,
> auto-generate the title from what I typed (editable), description, shipping
> note, price, Publish → status listed and public. There is no separate
> listed/unlisted toggle; listing happens only through `/sell`. Build one screen
> at a time and show me each.

What you should be able to do after: add several coins by hand, fill in your
dealer profile, open any item, and list one with photos.

---

## Session 2 — Buyer side (marketplace, buying, offers, saved, collection shell)

> Read CLAUDE.md and SPEC.md (§4 Marketplace + Collector, §5
> offers/orders/saved_items/collections, §6.4). We're on Session 2 — the buyer
> side, which lives under the **Collector** role in the header switcher and is
> open to any logged-in account. Create migrations for `orders`, `offers`,
> `saved_items` (a buyer's watchlist), and auto-create a `collections` row per
> account (every buyer has a collection built in). Build `/market` with filters,
> sort, and search (SPEC §4), showing only listed & public items. Build
> `/market/[itemId]` with photos, coin details, seller name/stats, price, and
> three actions: **Buy now**, **Make offer** (a single offer to the seller), and
> **Save** (adds to the watchlist). Count views. Build `/market/sellers/[dealerId]`
> (storefront) and `/checkout/buy/[itemId]` as a labelled simulation that creates
> an `orders` row, marks the item sold, and cancels any pending offers on it.
> Build the **buyer hub** — the Collector view's home — tying together: recent
> purchases (`/orders`), sent offers, saved coins (`/saved`), and a **My
> Collection** section that is a placeholder for now (adding coins, sets, and
> gaps is Session 5). On the seller side, let sellers **accept or decline** a
> marketplace offer from `/dealer/offers`; accepting runs the simulated checkout
> into an order. (Counters, parallel offers, 48h expiry, offers from routed
> requests, and demand events come in Session 7.) Create a second test account so
> I can browse, save, offer on, and buy one of my listed coins. One screen at a
> time; show me each.

What you should be able to do after: from another account (its Collector view),
browse the marketplace, save a coin, make an offer (and accept it as the seller),
buy a coin via simulated checkout, and see purchases, offers, saved items, and an
empty My Collection in the buyer hub.

---

## Session 3 — Item agents

Split into three prompts, in order (see SPEC §6.3).

**3a — Spot and the first rule.** Spot poller (Vercel Cron every 15 min into
`spot_prices`; seed a drifting fake series if no API key). Implement
`evaluateRule` in `lib/domain/pricing` for `spot_plus_pct` and `floor` as pure,
unit-tested functions with the guardrails (never below floor/cost, never move
more than the item's max daily move). Rule editor on item detail for those two.
These use the item's own metal + fine_weight fields, so they work on hand-entered
inventory. Explain the math before writing tests.

**3b — Repricing job + activity feed.** Reprice every 15 min and immediately on
a >0.5% spot move or a rule edit; write a `repriced` `agent_events` row with a
one-sentence explanation; build the activity feed on item detail.

**3c — More rules + comps.** Add `step_down`, and add `match_guide` **stubbed**
until the catalog exists. Add the `rule_visible` panel + price-history chart on
the public listing, and this week's view count to the activity feed. Leave the
comps panel as a placeholder ("comps arrive with the catalog"). Write a plain
summary of how the agent works in NOTES.md.

What you should be able to do after: bullion-linked coins reprice on gold moves
and explain each change. Your first demo for other dealers.

---

## Session 3b — Conversational item agents + notifications

Builds on the Session 3 rule engine. Two related pieces:

> **Talk to the item.** A chat on each listing where the owner configures the
> item in plain English, powered by Claude (Anthropic TS SDK, tool use). Claude
> calls tools that write the deterministic system — `set_pricing_rule`,
> `set_price`, `set_status`, `update_listing`, `create_alert` — plus read tools
> (`get_spot`, `get_comps`). Guardrails live in the tools (never below
> cost/floor, owner-only); Claude configures, the engine executes. Server-side
> only; needs an Anthropic API key.
>
> **Notifications.** An `alerts` table + a checker cron + delivery (Resend email
> and an in-app inbox) — the home for alerts on **offers, sales, messages, and
> AI updates** (repricing, "gold dropped 3%", recommendations, and any alert set
> up by chatting with an item). Transactional events (offer/sale) and the
> buyer↔seller **messaging** (built during the buyer side) plug into this system.

What you should be able to do after: tell a coin how to price itself and set
alerts by chatting; get notified about offers, sales, messages, and agent moves.

---

## Session 4 — Collector side (manual-first)

> Read CLAUDE.md and SPEC.md (§4 Collector, §6.1). We're on Session 4. The
> collection shell (an auto-created `collections` row and the My Collection
> placeholder in the buyer hub) already exists from Session 2; this session fills
> it in. Because the coin catalog comes next (Session 5), build this
> **manual-first**, mirroring the seller side: `collection_items` and `wants`
> migrations (with `coin_type_id` nullable plus hand-entered descriptive fields);
> a `/collection` list where I add coins by hand; and `/wants` + `/wants/[id]`
> where I create a want by describing the coin (grade range, budget, notes) — the
> Add-to-wants button from the marketplace lands here. Add a "Sell this coin"
> action that copies a collection item into inventory and opens the sell flow.
> The **set grid, gap detection, and catalog/cert pick arrive in Session 5** once
> the catalog exists. No photo identification anywhere. One screen at a time.

What you should be able to do after: add coins to your collection by hand and
create wants — the set-completion grid and gap-to-want flow arrive with the
catalog next session.

---

## Session 5 — Catalog & inventory import (attach catalogs)

> Read CLAUDE.md and SPEC.md (§5, §9). We're on Session 5. Create migrations for
> `coin_types`, `set_templates`, `set_slots`, `guide_prices`, `sales_history`.
> Seed the five set templates in SPEC §9 with every date and mintmark; ask me
> which Morgan varieties to include first. Build the inventory.csv and sales.csv
> importers per §9 (tolerate blanks; show me rows you couldn't match instead of
> failing). Import my CSVs. Then link my hand-entered inventory, collection
> items, and wants to catalog `coin_types` (backfill), and turn on the collection
> **set grid + gap detection**, catalog/cert pick on add, `match_guide`, and the
> guide/sales comps panel.

What you should be able to do after: the five sets exist, my CSVs import, my
hand-entered items and collection are linked to the catalog, and the set grid +
gaps light up (unlocking routing and demand).

---

## Session 6 — Routing

> Read CLAUDE.md and SPEC.md (§6.2). We're on Session 6. Implement `routeWant` in
> `lib/domain/routing` exactly per §6.2 with unit tests for each scoring line, the
> top-3 cutoff, the fatigue guard, and the "no dealer qualifies" case. Run it when
> a want is created, when a new inventory item matches an open want, and weekly for
> open wants with no offers. Write a `requests` row per dealer and a `routed`
> agent event with the score breakdown. Send the request email via Resend. Fill in
> `/dealer/requests` with real requests and the "you have N matching items" badge,
> and build `/admin/routing`. Create three Demo Dealer accounts with different
> inventory so I can test who gets what.

What you should be able to do after: create a want and watch it arrive in the right
dealers' inboxes, with the reasoning visible in admin.

---

## Session 7 — Offers (advanced)

> Read CLAUDE.md and SPEC.md (§6.4). We're on Session 7. Basic single offers
> (buyer → seller on a listing, with accept/decline) already exist from Session 2;
> this session adds the rest of §6.4: counters that link to the original;
> **parallel offers** (one price to up to 5 dealers sharing a `parallel_group_id`;
> first acceptance wins, the rest cancelled "filled_elsewhere"; a "parallel"
> badge); 48-hour expiry via cron; offers a dealer sends **from a routed request**;
> and unifying acceptance through `/checkout/[offerId]`. Then turn on the daily
> `demand_update` and `recommendation` agent events and fill in the demand panel on
> item detail. Test the parallel case with the three demo dealers.

What you should be able to do after: run the core demo end to end (browse → want →
routed → offer → accept → simulated sale), including parallel-offer clearing.

---

## Session 8 — Demand dashboard & pilot

> Read CLAUDE.md and SPEC.md (§6.5, §2). We're on Session 8. Build `/demand` with
> the grade buckets, sortable by the gap between open wants and listed supply
> (dealers see "unlisted supply exists: yes/no", admin sees the count). Do a polish
> pass on the demo screens: consistent spacing, empty states, loading states, no
> dead buttons; make sure every simulated surface is labelled. Then walk me through
> inviting real dealers and collectors.

What you should be able to do after: run the full demo without touching the
database, then invite ten dealers and thirty collectors.

---

## Session 9 — Payments & fulfillment (post-pilot, once validated)

Deferred by design (SPEC §8, §11). Through the pilot, checkout stays
**simulated** and dealers/buyers settle payment and shipping **off-platform**.
Build this only after the core mechanic is validated with real dealers:

> Payments via **Stripe Connect** (seller onboarding + KYC, escrow/holds on
> high-value items, payouts, refunds, platform fee); buyer/seller protection and
> a disputes/returns flow; **shipping** labels + tracking (Shippo/EasyPost) with
> insurance; and coin authentication/verification. Card data is handled entirely
> by Stripe — never in our code. Replace the simulated checkout surfaces with the
> real flow while keeping the `orders` model.

---

## Between sessions

Keep `NOTES.md` of everything that felt wrong (a rule edge case, a screen that
confused a dealer, routing that went to the wrong dealer). Bring it back and we'll
revise SPEC.md before the next session, so Claude Code always builds from a
corrected spec rather than from memory.
