import { createClient } from "@supabase/supabase-js";
import { findUpcomingAuctionLots } from "@/lib/auction-watch";
import {
  AUCTION_WATCH_INTERVAL_DAYS,
  AUCTION_WATCH_BATCH,
} from "@/lib/comps";

// Weekly auction-watch. Runs daily (Vercel free cron); a per-coin "last checked"
// gate makes each watched coin refresh about once a week. Uses the Supabase
// secret key so it can act across all dealers and write their notifications.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    return Response.json(
      { ok: false, error: "Missing SUPABASE_SECRET_KEY" },
      { status: 500 },
    );
  }
  const admin = createClient(url, key, { auth: { persistSession: false } });

  const cutoff = new Date(
    Date.now() - AUCTION_WATCH_INTERVAL_DAYS * 86400000,
  ).toISOString();

  const { data: items } = await admin
    .from("inventory_items")
    .select(
      "id, title, series, year, mintmark, variety, metal, grade, designation, grading_service, dealer_id",
    )
    .eq("watch_auctions", true)
    .eq("status", "listed")
    .or(`auctions_checked_at.is.null,auctions_checked_at.lt.${cutoff}`)
    .limit(AUCTION_WATCH_BATCH);

  let processed = 0;
  let withHits = 0;
  for (const item of items ?? []) {
    const lots = await findUpcomingAuctionLots(item);

    await admin.from("auction_watch_hits").delete().eq("inventory_item_id", item.id);
    if (lots.length > 0) {
      await admin.from("auction_watch_hits").insert(
        lots.map((l) => ({
          inventory_item_id: item.id,
          lot_title: l.title,
          price_text: l.price,
          auction_house: l.auction_house,
          sale_date_text: l.sale_date,
          url: l.url,
        })),
      );
      withHits++;

      const { data: dealer } = await admin
        .from("dealers")
        .select("profile_id")
        .eq("id", item.dealer_id)
        .maybeSingle();
      if (dealer?.profile_id) {
        await admin.from("notifications").insert({
          profile_id: dealer.profile_id,
          kind: "auction_watch",
          title: "Comparable coins coming to auction",
          body: `${lots.length} upcoming lot${lots.length === 1 ? "" : "s"} for ${item.title ?? "your coin"}.`,
          link: `/dealer/inventory/${item.id}`,
        });
      }
    }

    await admin
      .from("inventory_items")
      .update({ auctions_checked_at: new Date().toISOString() })
      .eq("id", item.id);
    processed++;
  }

  return Response.json({ ok: true, processed, withHits });
}
