# SESSIONS.md — step-by-step build order with Claude Code prompts

Order (revised 2026-09-11): skeleton → **seller side (manual entry)** →
**marketplace** → item agents → catalog & import → collector side → routing →
offers → demand dashboard & pilot.

> **Plan change (2026-09-11).** At the founder's request we build the **seller
> side first** and **enter inventory by hand** — no coin catalog or CSV import
> yet (catalogs get attached later) — and we add a **public marketplace** where
> any logged-in user can browse available items. So the original "Catalog &
> seed" session moves later (it now also links the hand-entered items to the
> catalog), and seller + marketplace come right after the skeleton. Until the
> catalog exists, an inventory item stores its own coin details and its
> `coin_type_id` is left empty; the catalog session backfills those links, which
> is what powers gap detection, routing, and demand. See SPEC.md §5
> (inventory_items) and §10.

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

## Session 2 — Marketplace

> Read CLAUDE.md and SPEC.md (§4 Marketplace, §6.4 checkout). We're on Session 2.
> Build `/market` with the filters, sort, and search in SPEC §4, showing only
> items that are listed and public — **any logged-in user can browse**. Build
> `/market/[itemId]` with photos, coin details, seller name and stats, price, and
> **Buy now** (Make offer and Add to wants come in later sessions — leave clear
> placeholders). Count views. Build the seller storefront
> `/market/sellers/[dealerId]`. Build `/checkout/buy/[itemId]` as a clearly
> labelled simulation that creates an `orders` row, marks the item sold, and
> cancels any pending offers on it, plus `/orders` for buyers and sellers. Then
> create a second test account so I can buy one of my own listed coins and see it
> as sold.

What you should be able to do after: a buyer can find a coin, read the listing,
and buy it (simulated); you see the sale. A working marketplace, minus real money.

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

## Session 4 — Catalog & inventory import (attach catalogs)

> Read CLAUDE.md and SPEC.md (§5, §9). We're on Session 4. Create migrations for
> `coin_types`, `set_templates`, `set_slots`, `guide_prices`, `sales_history`.
> Seed the five set templates in SPEC §9 with every date and mintmark; ask me
> which Morgan varieties to include first. Build the inventory.csv and sales.csv
> importers per §9 (tolerate blanks; show me rows you couldn't match instead of
> failing). Import my CSVs. Then add a way to link my existing hand-entered
> inventory items to catalog `coin_types` (backfill), and turn on `match_guide`
> and the guide/sales comps panel now that guide prices exist.

What you should be able to do after: the five sets exist, my CSVs import, and my
hand-entered items are linked to the catalog (unlocking gaps, routing, demand).

---

## Session 5 — Collector side

> Read CLAUDE.md and SPEC.md (§4 Collector, §6.1). We're on Session 5. Build the
> collector screens: `/collection` set-grid with completion %, `/collection/add`
> (cert lookup via PCGS or stub, and catalog pick), set- and slot-level
> grade/budget targets, "Make this a want" from any gap, `/wants` and
> `/wants/[id]` (the Add-to-wants button from the marketplace lands here now), and
> a "Sell this coin" action that copies a collection item into inventory and opens
> `/sell`. No photo identification anywhere. One screen at a time.

What you should be able to do after: enter your collection, see gaps, turn a gap
into a want, and sell a coin out of your collection.

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

## Session 7 — Offers

> Read CLAUDE.md and SPEC.md (§6.4). We're on Session 7. Build offers: from a
> request a dealer picks a matching item (price prefilled, editable) and sends;
> collectors accept/decline/counter on `/wants/[id]`; sellers accept/decline/counter
> marketplace offers from `/dealer/offers`; counters link to the original. Build
> parallel offers (one price to up to 5 dealers sharing a `parallel_group_id`;
> first acceptance wins, the rest cancelled "filled_elsewhere"; dealers see a
> "parallel" badge). Offers expire at 48h via cron. Build `/checkout/[offerId]`
> reusing the simulated checkout. Now turn on the daily `demand_update` and
> `recommendation` agent events and fill in the demand panel on item detail. Test
> the parallel case with the three demo dealers.

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

## Between sessions

Keep `NOTES.md` of everything that felt wrong (a rule edge case, a screen that
confused a dealer, routing that went to the wrong dealer). Bring it back and we'll
revise SPEC.md before the next session, so Claude Code always builds from a
corrected spec rather than from memory.
