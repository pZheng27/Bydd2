# SPEC.md — prototype product spec

Working name: **[Company]**. Replace throughout once chosen.

## 1. Purpose of the prototype

This is a demo and a learning tool, not the production product. It exists to:

1. Show the core mechanic end to end: collection → gaps → wants → routed to
   dealers → offer → (simulated) sale, including from unlisted inventory.
2. Show item agents repricing real inventory on real spot moves with a
   readable explanation of what they did.
3. Give a YC partner, a prospective technical cofounder, and ten pilot dealers
   something to click through.

If a feature doesn't serve one of those three, it's out of scope.

## 2. The 90-second demo (build toward this)

1. Collector logs in. Their Morgan dollar set shows 83 of 96 slots filled. The
   13 gaps are listed with the collector's grade target for each.
2. Collector clicks a gap (1893-S, VF20–VF35, budget $4,500). It becomes a want.
3. Switch to Dealer view. A request has arrived: "Collector wants 1893-S Morgan
   VF20–VF35, budget up to $4,500." The dealer has an 1893-S VF25 in inventory
   marked **unlisted**. One tap: "Offer at $4,200."
4. Back to Collector. Offer appears. Accept. Simulated checkout completes.
5. Marketplace: browse Morgans, open a listed 1881-S MS65. The listing shows
   "Drops 2% every 7 days, floor $350" and a small price history chart. Buy
   now → simulated checkout.
6. Dealer inventory view: a generic $20 Saint-Gaudens carries the rule "spot ×
   0.9675 oz + 4%". Spot ticked up this morning; the item's activity feed
   shows "Repriced $3,412 → $3,447 (gold +1.0%)". Below it: "Demand: 6 open
   wants for this type/grade; 2 listed marketplace-wide. 41 views this week."
7. Demand dashboard: a table of coin/grade rows with open wants vs. listed
   supply, sorted by the gap.

## 3. Users and roles

- **Collector**: has a collection, sets, wants; sends and receives offers.
- **Dealer**: has inventory (listed and unlisted), a "what I carry" profile,
  pricing rules, a request inbox; sends and receives offers.
- A single account can hold both roles (the founder does). Role switcher in
  the header.
- **Admin** (founder only): can view routing decisions, all agent events, and
  the demand dashboard across the whole marketplace.

## 4. Screens

### Collector
- `/collection` — set-by-set view. Each set shows slots as a grid: filled
  (with grade), gap (with target grade if set), or n/a. Overall completion %.
- `/collection/add` — two entry paths: (a) cert number → PCGS lookup → confirm;
  (b) pick from catalog (series → date → mintmark → variety) then enter grade,
  service, optional cert. No photo identification anywhere.
- `/wants` — open, matched, filled, cancelled. Create want from a gap or from
  scratch. Fields: coin type, grade min/max, designation (optional), budget
  max, notes, expiry (default 60 days).
- `/wants/[id]` — the want, the offers received, accept/decline/counter.
- `/offers` — all offers sent and received.

### Dealer
- `/dealer/inventory` — table with status (listed / unlisted / reserved /
  sold), grade, cost, current price, active rule, last agent event. Filters.
  Bulk CSV import.
- `/dealer/inventory/[id]` — item detail: pricing rule editor, activity feed
  (agent events), comps panel, demand panel.
- `/dealer/profile` — business name, location, "what I carry" categories,
  response stats (read-only).
- `/dealer/requests` — inbox of routed wants. Each row: coin, grade range,
  budget, "you have N matching items" badge, time received. Actions:
  **Offer** (pick item → price prefilled from rule → send), **Don't have it**,
  **Snooze**.
- `/dealer/offers` — offers sent/received, with parallel-offer groups shown.

### Marketplace (public to any logged-in user)
- `/market` — browse all listed items. Filters: series, date/mintmark,
  grade range, grading service, designation, price range, metal, "priced by
  rule" (items with an active pricing rule). Sort: newest, price, recently
  repriced. Search box over display name, cert, and variety. Grid or table.
- `/market/[itemId]` — listing page: photos, coin type, grade, service, cert
  (with PCGS verify link), designation, seller name and response stats,
  price, **Buy now**, **Make offer**, **Add to wants** (creates a want for
  this coin type, useful when the price is too high). If the seller has made
  the rule visible: a "How this price moves" panel (e.g. "Tracks gold spot +
  4%" or "Drops 2% every 7 days, floor $3,100") and a price history chart from
  `agent_events`. Views are counted (`view_count`) and shown to the seller
  only.
- `/market/sellers/[dealerId]` — a seller's storefront: profile, categories,
  all their listed items.

### Selling
- Any account can enable selling (sets `is_dealer = true`, creates a
  `dealers` row). Collectors sell from their collection; dealers sell from
  inventory. Both are `inventory_items` under the hood.
- `/sell` — list an item: pick from inventory (or from collection, which
  copies the collection item into inventory), add photos (Supabase Storage),
  title auto-generated from coin type + grade (editable), description,
  shipping note, price, optional pricing rule, `rule_visible` toggle. Publish
  → `status = listed`, `is_public = true`.
- Unlisted items are never shown on `/market`; they're reachable only via
  routed requests and offers.

### Shared
- `/checkout/[offerId]` and `/checkout/buy/[itemId]` — simulated. Summary →
  "Complete purchase" → success. Marks item sold, cancels other pending
  offers on it, fills any matching want of the buyer's, creates an order. No
  charge. Every simulated screen says "SIMULATED — no funds move".
- `/orders` — buyer's purchases and seller's sales.
- `/demand` — demand dashboard (dealers and admin).

### Admin
- `/admin/routing` — every routing decision with scores per dealer.
- `/admin/events` — global agent event stream.

## 5. Data model

All tables have `id uuid`, `created_at`, `updated_at`. Money in integer cents.

**profiles** — `user_id` (auth), `display_name`, `email`, `is_collector`,
`is_dealer`, `is_admin`.

**coin_types** — the catalog. `series` (e.g. "Morgan Dollar"),
`denomination`, `year`, `mintmark` (nullable), `variety` (nullable, e.g.
"VAM-3", "1909-S VDB"), `display_name`, `pcgs_number` (nullable),
`metal` (gold/silver/copper/nickel/clad/other), `fine_weight_oz` (nullable,
for bullion-linked pricing), `is_key_date` bool.

**set_templates** — `name` ("Morgan Dollars, Date & Mintmark, 1878–1921"),
`series`, `description`.

**set_slots** — `set_template_id`, `coin_type_id`, `position`, `is_required`.

**collections** — `profile_id`, `name` (default "My Collection").

**collection_items** — `collection_id`, `coin_type_id`, `grade` int 1–70,
`designation` text null, `grading_service` enum (PCGS/NGC/CAC/ANACS/ICG/raw),
`cert_number` null, `acquired_cents` null, `notes`.

**collector_set_targets** — `collection_id`, `set_template_id`,
`default_grade_min`, `default_grade_max`, `default_budget_cents` null.
Per-slot overrides via `slot_targets` (`set_slot_id`, `grade_min`,
`grade_max`, `budget_cents`).

**wants** — `profile_id`, `coin_type_id`, `grade_min`, `grade_max`,
`designation` null, `budget_cents` null, `notes`, `status` enum
(open/matched/filled/cancelled/expired), `expires_at`,
`source` enum (gap/manual).

**dealers** — `profile_id`, `business_name`, `location`, `categories` text[]
(from a fixed list: e.g. "Morgan & Peace Dollars", "Early Copper", "Type
Gold", "Modern Bullion", "Seated Coinage", "Commemoratives", "World",
"Currency"), `response_rate` numeric, `median_response_minutes` int,
`accepts_requests` bool.

**inventory_items** — `dealer_id`, `coin_type_id`, `grade`, `designation`,
`grading_service`, `cert_number`, `cost_cents` null, `price_cents`,
`status` enum (listed/unlisted/reserved/sold), `is_public` bool (listed items
appear in search; unlisted never do), `location_note` (e.g. "Case 3, show
binder"), `title` (auto-generated, editable), `description`, `shipping_note`,
`photos` text[] (Storage paths), `rule_visible` bool (show pricing rule and
price history on the listing), `view_count` int, `listed_at`,
`max_daily_move_pct` numeric (guardrail, default 5).

**pricing_rules** — `inventory_item_id`, `kind` enum:
- `spot_plus_pct` — params `{ metal, fine_weight_oz, pct_over_spot }`
- `step_down` — params `{ pct_per_step, step_days, floor_cents }`
- `floor` — params `{ floor_cents }` (combinable; hard minimum)
- `match_guide` — params `{ source: "pcgs", offset_pct }` (price guide ±%)
`is_active`, `last_evaluated_at`.

**agent_events** — `inventory_item_id` null, `want_id` null, `kind` enum
(repriced, comp_seen, demand_update, routed, recommendation, offer_sent,
offer_received, rule_changed), `summary` text (human sentence), `payload`
jsonb, `created_at`.

**requests** — a want routed to one dealer. `want_id`, `dealer_id`, `score`
numeric, `score_breakdown` jsonb, `status` enum
(sent/viewed/offered/declined/snoozed/expired), `sent_at`, `responded_at`.

**offers** — `want_id` null, `request_id` null, `inventory_item_id`,
`from_profile_id`, `to_profile_id`, `price_cents`, `message`, `status` enum
(pending/accepted/declined/countered/cancelled/expired), `expires_at`
(default 48h), `parallel_group_id` uuid null, `counter_of_offer_id` null.

**orders** — simulated. `offer_id` null (null for Buy now), `inventory_item_id`,
`buyer_profile_id`, `seller_profile_id`, `amount_cents`, `kind` enum
(buy_now/offer), `status` (completed), `note` "SIMULATED — no funds moved".

**spot_prices** — `metal`, `price_cents_per_oz`, `fetched_at`, `source`.

**guide_prices** — `coin_type_id`, `grade`, `designation` null,
`value_cents`, `source` ("pcgs"), `as_of`. Cached lookups.

**sales_history** — founder's own past sales, imported. `coin_type_id`,
`grade`, `designation`, `sold_cents`, `sold_at`, `venue`. Used as comps.

## 6. Core logic (lives in `lib/domain/`, unit-tested)

### 6.1 Gap detection
For each set the collector tracks: slots − slots satisfied by any
collection item with matching `coin_type_id`. A slot is "filled" regardless
of grade; grade targets only affect the want created from the gap.

### 6.2 Routing (`routeWant(want) → Request[]`)
Score every dealer with `accepts_requests = true`:

- +100: has inventory item with exact `coin_type_id`, grade within range,
  status listed **or unlisted**
- +60: exact `coin_type_id`, grade outside range by ≤ 5 points
- +30: has ≥ 3 items in the same `series`
- +20: `categories` includes the series' category
- +0..15: `response_rate × 15`
- −25: dealer already received ≥ 5 requests today (fatigue guard)
- −100: dealer declined this same want previously

Send to the top 3 with score ≥ 20. Write a `requests` row per dealer and an
`agent_events` row of kind `routed` with the full breakdown. If no dealer
scores ≥ 20, leave the want open and record why.

Re-route when: a new inventory item matches an open want (immediate), or
every 7 days for open wants with no offers.

### 6.3 Pricing rules (`evaluateRule(item, rule, context) → newPrice | null`)
Runs on a cron every 15 minutes and immediately when spot changes > 0.5% or a
rule is edited. Context: latest spot, guide price, open want count, listed
supply count. Rules compose: compute candidate from the primary rule, then
apply any `floor`. If price changes, update item, write `agent_events`
(`repriced`) with a one-sentence summary, e.g. "Repriced $3,412 → $3,447:
gold moved +1.0% to $2,641/oz; rule is spot × 0.9675 oz + 4%."

Also, once a day per item, write a `demand_update` event: "6 open wants for
this type at VF20–VF35; 2 listed marketplace-wide." And a `recommendation`
when demand > supply and price < guide: "Consider raising toward guide
($4,600); demand exceeds supply."

### 6.4 Offers and clearing
- A dealer offers from a request: picks an item, price prefilled from current
  price, can edit; sends. Item becomes `reserved` while a pending offer is
  out? **No** — items stay available until acceptance (dealers can have several
  pending offers on one item). On acceptance, item → `sold`, any other pending
  offers on that item → `cancelled` with reason.
- A collector can send **parallel offers**: one price to up to 5 dealers'
  matching items at once, sharing a `parallel_group_id`. The first dealer to
  accept wins; the rest are cancelled instantly with reason
  "filled_elsewhere". Dealers see a "parallel" badge on such offers.
- Counters create a new offer with `counter_of_offer_id`; the original →
  `countered`.
- Offers expire at `expires_at`; a cron marks them.
- Accepting an offer redirects to simulated checkout; completing it creates
  an `orders` row and marks the want `filled`.

### 6.5 Demand dashboard
For each (`coin_type_id`, grade bucket) with ≥ 1 open want: open wants,
listed supply (public inventory items in grade bucket), unlisted supply
count (shown to admin only; dealers see "unlisted supply exists: yes/no"),
median budget, guide price. Grade buckets: 1–20, 21–40, 41–58, 60–63,
64–66, 67–70.

## 7. External integrations

- **PCGS Public API** — cert verification and price guide. Requires a key
  (founder obtains). Cache all responses in `guide_prices` / on the
  collection item. If the key isn't available yet, use a stub with a handful
  of hardcoded certs so the flow still works.
- **Spot prices** — any metals API with a free tier (e.g. metals.dev,
  goldapi.io). Poll every 15 min via cron; store in `spot_prices`. If no key,
  seed a fake series that drifts ±1% so repricing visibly happens.
- **Resend** — email on new request, new offer, offer accepted. Plain text
  is fine.
- **Not integrated**: eBay, Heritage, GreatCollections, Stripe, any photo ID.

## 8. Real vs. simulated

Real: coin catalog and set templates, founder's inventory and sales history,
PCGS lookups, spot prices, routing, pricing rules, offers, emails.

Simulated: checkout/payments, shipping, escrow, buyer/seller verification.
Every simulated surface says so in small text. Dealers other than the founder
are real people invited by the founder; until they join, seed placeholder
dealers clearly named "Demo Dealer A/B/C".

## 9. Seed data

Set templates and catalog for, at minimum:
- Morgan Dollars, date & mintmark (1878–1921), with the major varieties the
  founder specifies
- Peace Dollars (1921–1935)
- Lincoln Cents, Wheat reverse (1909–1958), incl. 1909-S VDB, 1914-D, 1922
  plain, 1955 DDO
- Mercury Dimes (1916–1945)
- U.S. Type Gold ($1 through $20, one slot per major type)

Founder supplies: inventory CSV (columns: series, year, mintmark, variety,
grade, designation, service, cert, cost, price, status, location_note) and a
sales-history CSV. Importers must tolerate blanks and report rows they
couldn't match to the catalog instead of failing.

## 10. Session plan and acceptance criteria

**S0 — Setup.** Repo, Next.js + Supabase + Tailwind + shadcn scaffold,
auth with magic link, role switcher, deployed to Vercel, `README.md` explains
run/seed/deploy. *Done when: founder can log in on the deployed URL and
switch between empty Collector and Dealer views.*

**S1 — Catalog & seed.** Migrations for all tables in §5. Catalog + set
templates for the five sets. Inventory and sales-history CSV importers.
*Done when: founder's real inventory shows in `/dealer/inventory` and
`/collection` renders the five sets with 0% filled.*

**S2 — Seller side.** Profile with categories. Inventory table with
listed/unlisted status, filters, and item detail page. `/sell` listing flow
with photos, auto title, description, price. Request inbox UI (empty until
S6). Imported inventory is unlisted by default; the only way an item becomes
listed is `/sell`. No manual listed/unlisted toggle. *Done when: founder can
list an item with photos, edit profile, open any item, and see an empty
inbox.*

**S2b — Marketplace.** `/market` browse with filters, search, and sort;
`/market/[itemId]` listing page with Buy now, Make offer (simple single
offer; parallel offers and counters come in S7), and Add to wants (creates
a want; the wants screen itself comes in S5); seller storefront page;
simulated Buy-now checkout; `/orders`; view counting. *Done when: a second
test account can browse the founder's listed coins, open one, buy it via
simulated checkout, and the founder sees the sale in `/orders` and the item
marked sold.*

**S3 — Item agents.** Spot poller. Pricing rules editor (`spot_plus_pct`,
`step_down`, `floor`, `match_guide`). `evaluateRule` with tests and
guardrails (floor, never below cost, max daily move). Cron every 15 min plus
triggers on spot move > 0.5% and rule edits. Activity feed with human
summaries; guide-price and sales-history comps panel. `rule_visible` toggle
renders the "How this price moves" panel and price history chart on the
public listing. Demand and recommendation events are stubbed until S7 (no
wants exist yet); view counts feed the activity feed now.
*Done when: demo steps 5–6 work with a real spot move (or the seeded drift)
on the founder's own inventory, and every reprice has a readable explanation
visible to the seller and, when enabled, to buyers.*

**S4 — Collector side.** Add by cert (PCGS or stub) and by catalog pick.
Gap grid. Set-level and slot-level grade/budget targets. Create want from
gap. `/wants` list and detail. "Sell from collection" path into `/sell`.
*Done when: demo steps 1–2 work with the founder's own collection, and the
Add-to-wants button from S2b lands on the wants screen.*

**S5 — Routing.** `routeWant` with tests. Cron re-routing. Email on new
request. Admin routing view. *Done when: creating a want as the collector
produces a request in the founder-dealer inbox within seconds, with the score
breakdown visible in admin, and the email arrives.*

**S6 — Offers.** Dealer offer from request, collector accept/decline/counter,
counters on marketplace offers, parallel offers with first-accept-wins,
expiry, offer checkout. Turn on the S3 demand and recommendation events now
that wants exist. *Done when: demo steps 3–4 work, and a parallel offer to
three demo dealers cancels the other two when one accepts.*

**S7 — Demand dashboard & pilot.** `/demand`. Polish pass on the six demo
screens. Invite ten real dealers and ~30 collectors. *Done when: the founder
can run the full 90-second demo without touching the database, and at least
five real dealers have logged in.*

## 11. Non-goals for the prototype

Payments, shipping labels and tracking, disputes, fraud, mobile apps, photo
identification, eBay or auction-house sync, other collectible categories,
SEO, marketing site, auctions (fixed price and offers only), seller
verification beyond founder invitation.
