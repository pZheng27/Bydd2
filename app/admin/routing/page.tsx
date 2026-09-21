import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fmtMoney } from "@/lib/format";

export const dynamic = "force-dynamic";

type WantRow = {
  id: string;
  title: string | null;
  series: string | null;
  grade_min: number | null;
  grade_max: number | null;
  budget_cents: number | null;
  status: string;
  created_at: string;
};
type ReqRow = {
  want_id: string;
  dealer_id: string;
  score: number;
  status: string;
};
type DealerRow = { id: string; business_name: string | null };
type EventRow = { want_id: string | null; payload: { reason?: string | null } | null };

function gradeRange(w: WantRow): string {
  if (w.grade_min != null && w.grade_max != null) return `${w.grade_min}–${w.grade_max}`;
  if (w.grade_min != null) return `${w.grade_min}+`;
  if (w.grade_max != null) return `≤${w.grade_max}`;
  return "any";
}

function Tile({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-xl border p-4">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="mt-0.5 text-sm font-medium">{label}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export default async function AdminRoutingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();
  const { data: me } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!me?.is_admin) notFound();

  const admin = createAdminClient();
  if (!admin) {
    return (
      <div className="mx-auto max-w-5xl">
        <h1 className="text-2xl font-semibold">Routing &amp; demand</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Admin data unavailable — the service key isn&apos;t configured.
        </p>
      </div>
    );
  }

  const [wantsRes, reqsRes, dealersRes, eventsRes] = await Promise.all([
    admin
      .from("wants")
      .select("id, title, series, grade_min, grade_max, budget_cents, status, created_at")
      .order("created_at", { ascending: false }),
    admin.from("requests").select("want_id, dealer_id, score, status"),
    admin.from("dealers").select("id, business_name"),
    admin
      .from("agent_events")
      .select("want_id, payload")
      .eq("kind", "routed")
      .order("created_at", { ascending: false }),
  ]);

  const wants = (wantsRes.data as WantRow[]) ?? [];
  const reqs = (reqsRes.data as ReqRow[]) ?? [];
  const dealers = (dealersRes.data as DealerRow[]) ?? [];
  const events = (eventsRes.data as EventRow[]) ?? [];

  const dealerName = new Map(dealers.map((d) => [d.id, d.business_name || "Dealer"]));

  const reqByWant = new Map<string, ReqRow[]>();
  for (const r of reqs) {
    const a = reqByWant.get(r.want_id) ?? [];
    a.push(r);
    reqByWant.set(r.want_id, a);
  }

  // Latest routing reason per want (for wants that reached nobody).
  const reasonByWant = new Map<string, string | null>();
  for (const e of events)
    if (e.want_id && !reasonByWant.has(e.want_id))
      reasonByWant.set(e.want_id, e.payload?.reason ?? null);

  const perDealer = new Map<string, { sent: number; accepted: number; declined: number }>();
  for (const r of reqs) {
    const c = perDealer.get(r.dealer_id) ?? { sent: 0, accepted: 0, declined: 0 };
    if (r.status === "accepted") c.accepted++;
    else if (r.status === "declined") c.declined++;
    else c.sent++;
    perDealer.set(r.dealer_id, c);
  }

  const openWants = wants.filter((w) => w.status === "open");
  const unrouted = openWants.filter((w) => !(reqByWant.get(w.id)?.length));
  const dealersEngaged = new Set(reqs.map((r) => r.dealer_id)).size;

  const demand = new Map<string, number>();
  for (const w of openWants) {
    const k = w.series || w.title || "Unspecified";
    demand.set(k, (demand.get(k) ?? 0) + 1);
  }
  const demandRanked = [...demand.entries()].sort((a, b) => b[1] - a[1]);

  const statusChip = (s: string) =>
    s === "accepted"
      ? "text-green-700 dark:text-green-400"
      : s === "declined"
        ? "text-muted-foreground line-through"
        : "text-foreground";

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-semibold">Routing &amp; demand</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Every want, where it was routed, and which dealers are getting demand.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Open wants" value={openWants.length} hint={`${wants.length} total`} />
        <Tile label="Requests sent" value={reqs.length} />
        <Tile label="Dealers engaged" value={dealersEngaged} hint={`of ${dealers.length}`} />
        <Tile label="Unrouted" value={unrouted.length} hint="no dealer qualified" />
      </div>

      {/* Demand by coin/series */}
      <h2 className="mt-8 text-lg font-semibold">Top demand</h2>
      {demandRanked.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No open wants yet.</p>
      ) : (
        <div className="mt-2 space-y-2">
          {demandRanked.map(([k, n]) => (
            <div key={k} className="flex items-center gap-3">
              <div className="w-56 shrink-0 truncate text-sm">{k}</div>
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-foreground"
                  style={{ width: `${(n / demandRanked[0][1]) * 100}%` }}
                />
              </div>
              <div className="w-8 shrink-0 text-right text-sm tabular-nums">{n}</div>
            </div>
          ))}
        </div>
      )}

      {/* Wants & where they routed */}
      <h2 className="mt-8 text-lg font-semibold">Wants &amp; routing</h2>
      {wants.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          No wants yet. When a collector creates one, it&apos;ll route here.
        </p>
      ) : (
        <div className="mt-2 overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Want</th>
                <th className="px-3 py-2 text-left font-medium">Grade</th>
                <th className="px-3 py-2 text-left font-medium">Budget</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-left font-medium">Routed to</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {wants.map((w) => {
                const rs = (reqByWant.get(w.id) ?? []).sort((a, b) => b.score - a.score);
                return (
                  <tr key={w.id}>
                    <td className="px-3 py-2">{w.title || w.series || "a coin"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{gradeRange(w)}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {w.budget_cents != null ? fmtMoney(w.budget_cents) : "—"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{w.status}</td>
                    <td className="px-3 py-2">
                      {rs.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {rs.map((r) => (
                            <span
                              key={r.dealer_id}
                              className={`rounded-full border px-2 py-0.5 text-xs ${statusChip(r.status)}`}
                              title={`score ${r.score} · ${r.status}`}
                            >
                              {dealerName.get(r.dealer_id) ?? "Dealer"} · {r.score}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {reasonByWant.get(w.id) ?? "not routed"}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Per-dealer demand */}
      <h2 className="mt-8 text-lg font-semibold">Dealers</h2>
      <div className="mt-2 overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Dealer</th>
              <th className="px-3 py-2 text-right font-medium">Requests</th>
              <th className="px-3 py-2 text-right font-medium">Have it</th>
              <th className="px-3 py-2 text-right font-medium">Passed</th>
              <th className="px-3 py-2 text-right font-medium">Pending</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {dealers.map((d) => {
              const c = perDealer.get(d.id) ?? { sent: 0, accepted: 0, declined: 0 };
              const totalReq = c.sent + c.accepted + c.declined;
              return (
                <tr key={d.id}>
                  <td className="px-3 py-2">{d.business_name || "Dealer"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{totalReq}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-green-700 dark:text-green-400">
                    {c.accepted}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {c.declined}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{c.sent}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
