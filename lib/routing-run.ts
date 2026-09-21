import type { SupabaseClient } from "@supabase/supabase-js";
import { routeWant, type Want, type DealerSignals } from "@/lib/domain/routing";
import { seriesToCategory } from "@/lib/categories";

const startOfTodayISO = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

/**
 * Route one open want: gather each dealer's signals (their listings + profile),
 * run the prediction engine, then write a request per chosen dealer, notify
 * them, and log one `routed` event with the full breakdown. Uses a service-role
 * client (acts across dealers). Safe to re-run — existing requests aren't
 * re-notified and a dealer's accept/decline is never overwritten.
 */
export async function runRoutingForWant(
  admin: SupabaseClient,
  wantId: string,
): Promise<void> {
  const { data: want } = await admin
    .from("wants")
    .select(
      "id, profile_id, coin_type_id, series, title, grade_min, grade_max, status",
    )
    .eq("id", wantId)
    .maybeSingle();
  if (!want || want.status !== "open") return;

  // Prefer the catalog series when the want is linked to the catalog.
  let series: string | null = want.series ?? null;
  if (want.coin_type_id) {
    const { data: ct } = await admin
      .from("coin_types")
      .select("series")
      .eq("id", want.coin_type_id)
      .maybeSingle();
    if (ct?.series) series = ct.series;
  }

  const wantForScore: Want = {
    coinTypeId: want.coin_type_id ?? null,
    series,
    category: seriesToCategory(series),
    gradeMin: want.grade_min ?? null,
    gradeMax: want.grade_max ?? null,
  };

  // Candidate dealers: accept requests, and not the collector's own dealer.
  const { data: dealerRows } = await admin
    .from("dealers")
    .select("id, profile_id, categories, response_rate, accepts_requests")
    .eq("accepts_requests", true);
  const dealers = (dealerRows ?? []).filter(
    (d) => d.profile_id !== want.profile_id,
  );
  if (dealers.length === 0) return;
  const dealerIds = dealers.map((d) => d.id);

  // Exact listed matches (grades) per dealer.
  const exactByDealer = new Map<string, { grades: number[]; ungraded: boolean }>();
  if (want.coin_type_id) {
    const { data: exact } = await admin
      .from("inventory_items")
      .select("dealer_id, grade")
      .eq("status", "listed")
      .eq("coin_type_id", want.coin_type_id)
      .in("dealer_id", dealerIds);
    for (const it of exact ?? []) {
      const e = exactByDealer.get(it.dealer_id) ?? { grades: [], ungraded: false };
      if (it.grade == null) e.ungraded = true;
      else e.grades.push(it.grade);
      exactByDealer.set(it.dealer_id, e);
    }
  }

  // Listed count in the same series per dealer (the specialist signal).
  const seriesByDealer = new Map<string, number>();
  if (series) {
    const { data: ser } = await admin
      .from("inventory_items")
      .select("dealer_id")
      .eq("status", "listed")
      .ilike("series", series)
      .in("dealer_id", dealerIds);
    for (const it of ser ?? [])
      seriesByDealer.set(it.dealer_id, (seriesByDealer.get(it.dealer_id) ?? 0) + 1);
  }

  // Requests already routed to each dealer today (fatigue guard).
  const todayByDealer = new Map<string, number>();
  const { data: today } = await admin
    .from("requests")
    .select("dealer_id")
    .gte("created_at", startOfTodayISO())
    .in("dealer_id", dealerIds);
  for (const r of today ?? [])
    todayByDealer.set(r.dealer_id, (todayByDealer.get(r.dealer_id) ?? 0) + 1);

  // Dealers who previously declined THIS want.
  const declined = new Set<string>();
  const { data: dec } = await admin
    .from("requests")
    .select("dealer_id")
    .eq("want_id", wantId)
    .eq("status", "declined");
  for (const r of dec ?? []) declined.add(r.dealer_id);

  const signals: DealerSignals[] = dealers.map((d) => {
    const e = exactByDealer.get(d.id);
    return {
      dealerId: d.id,
      acceptsRequests: true,
      exactListedGrades: e?.grades ?? [],
      exactListedUngraded: e?.ungraded ?? false,
      seriesListedCount: seriesByDealer.get(d.id) ?? 0,
      categories: (d.categories as string[]) ?? [],
      responseRate: d.response_rate ?? null,
      requestsToday: todayByDealer.get(d.id) ?? 0,
      declinedThisWant: declined.has(d.id),
    };
  });

  const result = routeWant(wantForScore, signals);

  // Persist: request rows (new ones notify the dealer) + one routed event.
  const { data: existing } = await admin
    .from("requests")
    .select("dealer_id, status")
    .eq("want_id", wantId);
  const priorByDealer = new Map<string, string>(
    (existing ?? []).map((r) => [r.dealer_id as string, r.status as string]),
  );
  const profileByDealer = new Map<string, string>(
    dealers.map((d) => [d.id as string, d.profile_id as string]),
  );
  const coinLabel = want.title || series || "a coin";

  for (const req of result.requests) {
    const prior = priorByDealer.get(req.dealerId);
    if (prior == null) {
      await admin.from("requests").insert({
        want_id: wantId,
        dealer_id: req.dealerId,
        score: req.score,
        breakdown: { lines: req.lines },
        status: "sent",
      });
      const pid = profileByDealer.get(req.dealerId);
      if (pid) {
        await admin.from("notifications").insert({
          profile_id: pid,
          kind: "request",
          title: "A collector is looking for a coin",
          body: `Do you have ${coinLabel}? A collector is looking for one.`,
          link: "/dealer/requests",
        });
      }
    } else if (prior === "sent") {
      await admin
        .from("requests")
        .update({ score: req.score, breakdown: { lines: req.lines } })
        .eq("want_id", wantId)
        .eq("dealer_id", req.dealerId);
    }
  }

  const summary =
    result.requests.length > 0
      ? `Routed "${coinLabel}" to ${result.requests.length} dealer${result.requests.length === 1 ? "" : "s"}.`
      : `No dealer qualified for "${coinLabel}" — ${result.reason ?? "left open."}`;
  await admin.from("agent_events").insert({
    want_id: wantId,
    kind: "routed",
    summary,
    payload: {
      want_id: wantId,
      requests: result.requests,
      considered: result.considered,
      reason: result.reason ?? null,
    },
  });
}

/** Re-route every open want for a coin type — used when a new listing appears. */
export async function runRoutingForListedCoinType(
  admin: SupabaseClient,
  coinTypeId: string | null,
): Promise<void> {
  if (!coinTypeId) return;
  const { data: wants } = await admin
    .from("wants")
    .select("id")
    .eq("status", "open")
    .eq("coin_type_id", coinTypeId);
  for (const w of wants ?? []) await runRoutingForWant(admin, w.id);
}

/**
 * Re-route open wants that are going nowhere: no accepted request, and either no
 * requests at all or nothing sent in the last `days` days. For the weekly cron.
 */
export async function runRoutingForStaleWants(
  admin: SupabaseClient,
  days = 7,
): Promise<{ routed: number }> {
  const { data: wants } = await admin
    .from("wants")
    .select("id")
    .eq("status", "open");
  if (!wants?.length) return { routed: 0 };

  const ids = wants.map((w) => w.id);
  const { data: reqs } = await admin
    .from("requests")
    .select("want_id, status, created_at")
    .in("want_id", ids);

  const info = new Map<string, { latest: number; accepted: boolean }>();
  for (const r of reqs ?? []) {
    const cur = info.get(r.want_id) ?? { latest: 0, accepted: false };
    cur.accepted = cur.accepted || r.status === "accepted";
    cur.latest = Math.max(cur.latest, new Date(r.created_at).getTime());
    info.set(r.want_id, cur);
  }

  const cutoff = Date.now() - days * 86400000;
  let routed = 0;
  for (const w of wants) {
    const i = info.get(w.id);
    if (i?.accepted) continue;
    if (!i || i.latest < cutoff) {
      await runRoutingForWant(admin, w.id);
      routed++;
    }
  }
  return { routed };
}
