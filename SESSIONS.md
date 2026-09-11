# SESSIONS.md — step-by-step build order with Claude Code prompts

Order: skeleton → catalog & inventory → seller side → marketplace → item
agents → collector side → routing → offers → demand dashboard & pilot.

Before Session 0, finish SETUP.md (accounts and CSVs). Put `CLAUDE.md`,
`SPEC.md`, and this file in an empty folder. Open a terminal in that folder
and run `claude`. Paste the prompt for the session you're on. Every session
ends with: "Commit everything with a clear message and confirm the deployed
URL works."

---

## Session 0 — Skeleton

> Read CLAUDE.md and SPEC.md fully. We're starting Session 0 (SPEC §10).
> Scaffold the project with the exact stack in CLAUDE.md. Set up Supabase
> auth with magic-link email, a `profiles` table with collector/dealer/admin
> flags, and a header role switcher between Collector and Dealer views (both
> empty for now). Connect this folder to my GitHub repo and deploy to Vercel.
> Write README.md covering how to run, seed, and deploy. Ask me for
> environment keys one at a time when you need them. Explain each step in
> plain English. When done, walk me through Session 0's acceptance criteria.

What you should be able to do after: open the live URL, log in by email,
switch between two empty views.

---

## Session 1 — Catalog and inventory

> Read CLAUDE.md and SPEC.md. We're starting Session 1. Create migrations for
> every table in SPEC §5. Build seed data for the five set templates in SPEC
> §9 with every date and mintmark; ask me for the Morgan varieties to include
> before you write them. Build the inventory CSV importer and sales-history
> CSV importer per §9: tolerate blanks, and show me a list of rows you
> couldn't match to the catalog instead of failing. Import my `inventory.csv`
> and `sales.csv`. Show me the counts when done.

What you should be able to do after: see your real inventory in the
database (the table UI comes next session) and see the five sets exist.

---

## Session 2 — Seller side

> Read CLAUDE.md and SPEC.md. We're starting Session 2. Build the seller
> screens in SPEC §4: `/dealer/profile` with the fixed category list,
> `/dealer/inventory` as a filterable table showing status (listed / unlisted
> / reserved / sold), grade, cost, price, active rule, and last agent event,
> `/dealer/inventory/[id]` as an item detail page with placeholder panels for
> pricing rule, activity feed, comps, and demand, and `/dealer/requests` as an
> inbox that is empty for now. Then build the `/sell` listing flow: pick an
> inventory item, upload photos to Supabase Storage, auto-generate the title
> from coin type and grade (editable), description, shipping note, price, and
> Publish, which sets the item to listed and public. Imported inventory is
> unlisted by default; listing happens only through `/sell`, and there is no
> separate listed/unlisted toggle. Build one screen at a time and show me
> each before moving on.

What you should be able to do after: browse your inventory, list a coin
with photos, open an item, fill in your seller profile.

---

## Session 2b — Marketplace

> Read CLAUDE.md and SPEC.md. We're starting Session 2b, the marketplace.
> Build `/market` with the filters, sort, and search in SPEC §4, showing
> only items that are listed and public. Build `/market/[itemId]` with
> photos, coin details, PCGS verify link, seller name and stats, price, and
> three buttons: Buy now, Make offer (a single simple offer for now; counters
> and parallel offers come later), and Add to wants (creates a `wants` row
> for this coin type; the wants screen comes in Session 4, so just confirm it
> was saved). Count views. Build the seller storefront page
> `/market/sellers/[dealerId]`. Build `/checkout/buy/[itemId]` as a clearly
> labelled simulation that creates an order, marks the item sold, and cancels
> any pending offers on it, plus `/orders` for buyers and sellers. Then create
> a second test account for me so I can buy one of my own listed coins and
> see it appear as sold.

What you should be able to do after: a buyer can find a coin, read the
listing, and buy it; you see the sale. This is a working marketplace,
minus real money.

---

## Session 3 — Item agents

Split this into three prompts, in order.

**3a — Spot and the first rule**

> Read CLAUDE.md and SPEC.md. We're starting Session 3, part A. Build the
> spot price poller (SPEC §7) running every 15 minutes on Vercel Cron and
> storing into `spot_prices`; if I don't have an API key yet, seed a fake
> series that drifts ±1% so repricing visibly happens. Then implement
> `evaluateRule` in `lib/domain/pricing` for the `spot_plus_pct` and `floor`
> rules only, as pure functions with unit tests, including the guardrails:
> never below floor, never below cost, never move more than the item's max
> daily move. Build the pricing rule editor on the item detail page for those
> two rules. Explain the math to me in plain English before you write the
> tests so I can check it.

**3b — The repricing job and the activity feed**

> Session 3, part B. Build the repricing job: runs every 15 minutes, and
> immediately when spot moves more than 0.5% or a rule is edited. For every
> item with an active rule it calls `evaluateRule`; if the price changes it
> updates the item and writes an `agent_events` row of kind `repriced` whose
> `summary` is a single plain-English sentence stating old price, new price,
> what moved, and which rule produced it (see the example in SPEC §6.3).
> Build the activity feed on the item detail page from `agent_events`, newest
> first. Then attach a spot rule to ten of my gold items and show me the feed
> after the job runs.

**3c — More rules and comps**

> Session 3, part C. Add the `step_down` and `match_guide` rules to
> `evaluateRule` with tests. Wire the PCGS price guide lookup (or the stub if
> my key isn't approved) into `guide_prices` with caching. Build the comps
> panel on the item detail page showing the guide value for this coin and
> grade plus my own past sales of the same type and grade from
> `sales_history`. Add the `rule_visible` toggle to the rule editor; when on,
> the public listing page shows a "How this price moves" panel describing the
> rule in plain words and a price history chart built from `repriced` events.
> Add this week's view count to the activity feed. Leave the demand panel as
> a placeholder that says "Demand data arrives once collectors join." Then
> write a plain-English summary of how the whole agent works for me to keep
> in NOTES.md.

What you should be able to do after: your bullion-linked coins reprice
themselves when gold moves, and every item tells you in a sentence what it
did and why. This is your first demo for other dealers.

---

## Session 4 — Collector side

> Read CLAUDE.md and SPEC.md. We're starting Session 4. Build the collector
> screens in SPEC §4: `/collection` showing each tracked set as a grid of
> slots (filled with grade, gap with target grade, or n/a) with a completion
> percentage; `/collection/add` with two paths, cert-number lookup via PCGS
> (or stub) with a confirm step, and catalog pick (series → date → mintmark →
> variety) then grade, service, optional cert; set-level and slot-level grade
> and budget targets; `/wants` list and `/wants/[id]` (the Add-to-wants
> button from the marketplace should now land here); "Make this a want" from
> any gap, prefilled from the slot's targets; and a "Sell this coin" action
> on any collection item that copies it into inventory and opens `/sell`.
> There is no photo identification anywhere. Build one screen at a time and
> show me each.

What you should be able to do after: enter your own collection, see your
gaps, turn a gap into a want, and sell a coin out of your collection.

---

## Session 5 — Routing

> Read CLAUDE.md and SPEC.md. We're starting Session 5. Implement `routeWant`
> in `lib/domain/routing` exactly per SPEC §6.2 with unit tests covering each
> scoring line, the top-3 cutoff, the fatigue guard, and the "no dealer
> qualifies" case. Run it when a want is created, when a new inventory item
> matches an open want, and weekly for open wants with no offers. Write a
> `requests` row per dealer and a `routed` agent event with the score
> breakdown. Send the request email via Resend. Fill in `/dealer/requests`
> with real requests and the "you have N matching items" badge, and build
> `/admin/routing`. Then create three "Demo Dealer" accounts with different
> inventory so I can test who gets what, and let me create wants as a
> collector and watch where they go.

What you should be able to do after: create a want as a collector and see it
arrive in the right dealers' inboxes, with the reasoning visible in admin.
Expect to spend time here telling Claude Code the scores feel wrong; that's
the point of the session.

---

## Session 6 — Offers

> Read CLAUDE.md and SPEC.md. We're starting Session 6. Build offers per SPEC
> §6.4: from a request, a dealer picks a matching item, price prefilled from
> its current price, edits, sends. Collectors accept, decline, or counter on
> `/wants/[id]`; sellers accept, decline, or counter marketplace offers from
> `/dealer/offers`; counters create a new offer linked to the original. Build
> parallel offers: a collector sends one price to up to 5 dealers' matching
> items sharing a `parallel_group_id`; first acceptance wins and the rest are
> cancelled instantly with reason "filled_elsewhere"; dealers see a "parallel"
> badge. Offers expire at 48 hours via cron. Build `/checkout/[offerId]`,
> reusing the simulated checkout from Session 2b, so accepting an offer
> creates an order, marks the item sold, cancels other pending offers on it,
> and marks the want filled. Now
> turn on the daily `demand_update` and `recommendation` agent events from
> SPEC §6.3 and fill in the demand panel on item detail. Test the parallel
> case with the three demo dealers and show me the cancellations.

What you should be able to do after: run demo steps 1 through 5 end to end.

---

## Session 7 — Demand dashboard and pilot

> Read CLAUDE.md and SPEC.md. We're starting Session 7. Build `/demand` per
> SPEC §6.5 with the grade buckets, sortable by the gap between open wants
> and listed supply; dealers see "unlisted supply exists: yes/no", admin sees
> the count. Then do a polish pass on the seven screens in the 90-second demo
> (SPEC §2): consistent spacing, empty states with helpful text, loading
> states, and no dead buttons. Make sure every simulated surface is labelled.
> Finally, walk me through inviting real users: how a dealer I invite gets
> an account and sets up their profile, and how a collector does the same.

What you should be able to do after: run the full 90-second demo without
touching the database, then invite ten dealers and thirty collectors.

---

## Between sessions

Keep `NOTES.md` of everything that felt wrong (routing that sent a request
to the wrong dealer, a rule edge case, a screen that confused a dealer).
Bring it back to me and we'll revise SPEC.md before the next session, so
Claude Code always builds from a corrected spec rather than from memory.
