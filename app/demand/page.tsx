import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fmtMoney } from "@/lib/format";

export const dynamic = "force-dynamic";

// SPEC §6.5 grade buckets (assigned by an upper bound).
const BUCKETS: { label: string; max: number }[] = [
  { label: "1–20", max: 20 },
  { label: "21–40", max: 40 },
  { label: "41–58", max: 58 },
  { label: "60–63", max: 63 },
  { label: "64–66", max: 66 },
  { label: "67–70", max: 70 },
];
const BUCKET_ORDER = new Map(BUCKETS.map((b, i) => [b.label, i]));

function bucketForGrade(g: number | null): string {
  if (g == null) return "Any grade";
  for (const b of BUCKETS) if (g <= b.max) return b.label;
  return "67–70";
}
function bucketForWant(min: number | null, max: number | null): string {
  if (min == null && max == null) return "Any grade";
  const lo = min ?? max!;
  const hi = max ?? min!;
  return bucketForGrade(Math.round((lo + hi) / 2));
}
function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

type Agg = {
  coinTypeId: string;
  bucket: string;
  wants: number;
  listed: number;
  budgets: number[];
};

function Tile({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border p-4">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="mt-0.5 text-sm font-medium">{label}</div>
    </div>
  );
}

export default async function DemandPage() {
  // Any signed-in user may see aggregate demand; block signed-out (middleware
  // already redirects, but guard defensively).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const admin = createAdminClient();
  if (!admin) {
    return (
      <div className="mx-auto max-w-5xl">
        <h1 className="text-2xl font-semibold">Demand</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Demand data is unavailable — the service key isn&apos;t configured.
        </p>
      </div>
    );
  }

  const [wantsRes, itemsRes] = await Promise.all([
    admin
      .from("wants")
      .select("coin_type_id, grade_min, grade_max, budget_cents")
      .eq("status", "open")
      .not("coin_type_id", "is", null),
    admin
      .from("inventory_items")
      .select("coin_type_id, grade")
      .eq("status", "listed")
      .eq("is_public", true)
      .not("coin_type_id", "is", null),
  ]);
  const wants = wantsRes.data ?? [];
  const items = itemsRes.data ?? [];

  const coinTypeIds = [
    ...new Set([
      ...wants.map((w) => w.coin_type_id as string),
      ...items.map((i) => i.coin_type_id as string),
    ]),
  ];
  const { data: cts } = coinTypeIds.length
    ? await admin.from("coin_types").select("id, name").in("id", coinTypeIds)
    : { data: [] };
  const nameById = new Map((cts ?? []).map((c) => [c.id, c.name as string]));

  const map = new Map<string, Agg>();
  const key = (ct: string, b: string) => `${ct}|${b}`;
  const get = (ct: string, b: string) => {
    const k = key(ct, b);
    let a = map.get(k);
    if (!a) {
      a = { coinTypeId: ct, bucket: b, wants: 0, listed: 0, budgets: [] };
      map.set(k, a);
    }
    return a;
  };
  for (const w of wants) {
    const a = get(w.coin_type_id, bucketForWant(w.grade_min, w.grade_max));
    a.wants++;
    if (w.budget_cents != null) a.budgets.push(w.budget_cents);
  }
  for (const it of items) get(it.coin_type_id, bucketForGrade(it.grade)).listed++;

  const rows = [...map.values()]
    .filter((a) => a.wants > 0)
    .map((a) => ({
      name: nameById.get(a.coinTypeId) ?? "Unknown coin",
      bucket: a.bucket,
      wants: a.wants,
      listed: a.listed,
      gap: a.wants - a.listed,
      medianBudget: median(a.budgets),
    }))
    .sort(
      (x, y) =>
        y.gap - x.gap ||
        y.wants - x.wants ||
        x.name.localeCompare(y.name) ||
        (BUCKET_ORDER.get(x.bucket) ?? 9) - (BUCKET_ORDER.get(y.bucket) ?? 9),
    );

  const totalWants = wants.length;
  const coinsInDemand = new Set(rows.map((r) => r.name)).size;
  const shortfalls = rows.filter((r) => r.gap > 0).length;

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-semibold">Demand</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        What collectors are looking for versus what&apos;s listed, by grade —
        sorted by the biggest shortfall (wanted minus listed). A positive gap
        means demand outstrips supply.
      </p>

      <div className="mt-6 grid grid-cols-3 gap-3">
        <Tile label="Open wants" value={totalWants} />
        <Tile label="Coins in demand" value={coinsInDemand} />
        <Tile label="Undersupplied" value={shortfalls} />
      </div>

      {rows.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          No open wants linked to the catalog yet. As collectors add wants,
          demand shows up here.
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Coin</th>
                <th className="px-3 py-2 text-left font-medium">Grade</th>
                <th className="px-3 py-2 text-right font-medium">Wanted</th>
                <th className="px-3 py-2 text-right font-medium">Listed</th>
                <th className="px-3 py-2 text-right font-medium">Gap</th>
                <th className="px-3 py-2 text-right font-medium">Median budget</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className="px-3 py-2">{r.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.bucket}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.wants}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {r.listed}
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-medium tabular-nums ${
                      r.gap > 0 ? "text-green-700 dark:text-green-400" : "text-muted-foreground"
                    }`}
                  >
                    {r.gap > 0 ? `+${r.gap}` : r.gap}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {r.medianBudget != null ? fmtMoney(r.medianBudget) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
