// Seed three placeholder "Demo Dealer" accounts with distinct LISTED inventory
// so routing visibly predicts different dealers (SPEC §8). Also makes the
// founder an admin so they can see /admin/routing. Idempotent: re-running
// reuses existing demo users/dealers and only adds inventory if a dealer has
// none. Run with: node scripts/seed-demo-dealers.mjs
//
// Uses the service-role key from .env.local — creates auth users via the admin
// API (profiles require a real auth user).
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/).filter((l) => l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY");
const admin = createClient(url, key, { auth: { persistSession: false } });

const FOUNDER_EMAIL = "zhengpeter26@gmail.com";

const DEALERS = [
  {
    email: "demo-morgan@bydd.demo",
    name: "Demo Dealer A — Morgan specialist",
    categories: ["Morgan & Peace Dollars"],
    response: 0.9,
    items: [
      { slug: "morgan-1878-cc", grade: 53, price: 90000 },
      { slug: "morgan-1880-cc", grade: 62, price: 65000 },
      { slug: "morgan-1881-cc", grade: 58, price: 60000 },
      { slug: "morgan-1882-cc", grade: 64, price: 70000 },
      { slug: "morgan-1883-cc", grade: 65, price: 80000 },
    ],
  },
  {
    email: "demo-gold@bydd.demo",
    name: "Demo Dealer B — Gold specialist",
    categories: ["Type Gold"],
    response: 0.6,
    items: [
      { series: "US Type Gold", title: "$20 Saint-Gaudens Double Eagle", metal: "gold", grade: 63, price: 280000 },
      { series: "US Type Gold", title: "$10 Liberty Eagle", metal: "gold", grade: 58, price: 120000 },
      { series: "US Type Gold", title: "$5 Indian Half Eagle", metal: "gold", grade: 55, price: 90000 },
      { series: "US Type Gold", title: "$2.50 Liberty Quarter Eagle", metal: "gold", grade: 60, price: 60000 },
    ],
  },
  {
    email: "demo-generalist@bydd.demo",
    name: "Demo Dealer C — Generalist",
    categories: ["Morgan & Peace Dollars", "Type Gold", "World", "Commemoratives"],
    response: 0.75,
    items: [
      { slug: "morgan-1890-cc", series: "Morgan Dollar", metal: "silver", grade: 50, price: 50000 },
      { series: "US Type Gold", title: "$20 Liberty Double Eagle", metal: "gold", grade: 58, price: 260000 },
      { series: "World", title: "1889 Great Britain Sovereign", metal: "gold", grade: 55, price: 70000 },
    ],
  },
];

async function findUserByEmail(email) {
  // A few demo users → one page is plenty.
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  return data.users.find((u) => u.email === email) ?? null;
}

async function ensureUser(email) {
  const existing = await findUserByEmail(email);
  if (existing) return existing;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    password: crypto.randomUUID() + "Aa1!",
  });
  if (error) throw error;
  return data.user;
}

// Founder → admin.
const fa = await admin.from("profiles").update({ is_admin: true }).eq("email", FOUNDER_EMAIL).select("id");
console.log(`founder admin: ${fa.data?.length ? "set" : "no profile matched " + FOUNDER_EMAIL}`);

// CC Morgan catalog ids (for exact links on Demo Dealer A / C).
const { data: morgans } = await admin.from("coin_types").select("id, slug, name").ilike("slug", "morgan-%-cc");
const bySlug = Object.fromEntries((morgans ?? []).map((m) => [m.slug, m]));

for (const d of DEALERS) {
  const user = await ensureUser(d.email);
  await admin.from("profiles").update({ is_dealer: true, display_name: d.name }).eq("user_id", user.id);
  const { data: prof } = await admin.from("profiles").select("id").eq("user_id", user.id).single();

  let { data: dealer } = await admin.from("dealers").select("id").eq("profile_id", prof.id).maybeSingle();
  const fields = { business_name: d.name, categories: d.categories, response_rate: d.response, accepts_requests: true };
  if (!dealer) {
    const ins = await admin.from("dealers").insert({ profile_id: prof.id, ...fields }).select("id").single();
    dealer = ins.data;
  } else {
    await admin.from("dealers").update(fields).eq("id", dealer.id);
  }

  const { count } = await admin.from("inventory_items").select("id", { count: "exact", head: true }).eq("dealer_id", dealer.id);
  if ((count ?? 0) === 0) {
    const rows = d.items.map((it) => {
      const ct = it.slug ? bySlug[it.slug] : null;
      return {
        dealer_id: dealer.id,
        coin_type_id: ct?.id ?? null,
        series: it.series ?? ct?.series ?? "Morgan Dollar",
        metal: it.metal ?? "silver",
        grade: it.grade,
        grading_service: "PCGS",
        title: it.title ?? ct?.name ?? "Coin",
        price_cents: it.price,
        status: "listed",
        is_public: true,
        listed_at: new Date().toISOString(),
      };
    });
    const { error } = await admin.from("inventory_items").insert(rows);
    console.log(`${d.name}: +${rows.length} listed items${error ? " (ERROR: " + error.message + ")" : ""}`);
  } else {
    console.log(`${d.name}: already has ${count} items, skipped`);
  }
}
console.log("done.");
