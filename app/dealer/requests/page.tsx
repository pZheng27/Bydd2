import { createClient } from "@/lib/supabase/server";
import { fmtMoney } from "@/lib/format";
import { embeddedOne } from "@/lib/catalog";
import { acceptRequest, declineRequest } from "./actions";
import { Button } from "@/components/ui/button";

type Want = {
  title: string | null;
  series: string | null;
  grade_min: number | null;
  grade_max: number | null;
  budget_cents: number | null;
  notes: string | null;
};
type RequestRow = {
  id: string;
  status: string;
  created_at: string;
  want: Want | Want[] | null;
};

function gradeRange(w: Want): string {
  if (w.grade_min != null && w.grade_max != null)
    return `Grade ${w.grade_min}–${w.grade_max}`;
  if (w.grade_min != null) return `Grade ${w.grade_min}+`;
  if (w.grade_max != null) return `Grade up to ${w.grade_max}`;
  return "Any grade";
}

export default async function DealerRequestsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("requests")
    .select(
      "id, status, created_at, want:wants(title, series, grade_min, grade_max, budget_cents, notes)",
    )
    .order("created_at", { ascending: false });

  const rows = ((data ?? []) as unknown as RequestRow[])
    .map((r) => ({ ...r, w: embeddedOne<Want>(r.want) }))
    .filter((r): r is RequestRow & { w: Want } => !!r.w);

  const open = rows.filter((r) => r.status === "sent" || r.status === "viewed");
  const resolved = rows.filter(
    (r) => r.status === "accepted" || r.status === "declined",
  );

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold">Requests</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Collectors looking for coins we think you might have — listed or in the
        back. Let them know if you&apos;ve got one.
      </p>

      {rows.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          No requests yet. When a collector wants a coin in your wheelhouse,
          it&apos;ll show up here.
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {open.length > 0 && (
            <div className="space-y-3">
              {open.map((r) => (
                <div key={r.id} className="rounded-xl border p-4">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    A collector is looking for
                  </div>
                  <div className="mt-1 text-lg font-semibold">
                    {r.w.title || r.w.series || "a coin"}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span>{gradeRange(r.w)}</span>
                    {r.w.budget_cents != null && (
                      <span>Budget up to {fmtMoney(r.w.budget_cents)}</span>
                    )}
                  </div>
                  {r.w.notes && (
                    <p className="mt-2 text-sm text-muted-foreground">
                      &ldquo;{r.w.notes}&rdquo;
                    </p>
                  )}
                  <div className="mt-4 flex items-center gap-3 border-t pt-3">
                    <span className="text-sm font-medium">Do you have one?</span>
                    <form action={acceptRequest}>
                      <input type="hidden" name="id" value={r.id} />
                      <Button type="submit" size="sm">
                        Yes, I have it
                      </Button>
                    </form>
                    <form action={declineRequest}>
                      <input type="hidden" name="id" value={r.id} />
                      <Button type="submit" size="sm" variant="outline">
                        Not right now
                      </Button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          )}

          {resolved.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground">
                Past requests
              </h2>
              <ul className="mt-2 divide-y rounded-xl border">
                {resolved.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                  >
                    <span>{r.w.title || r.w.series || "a coin"}</span>
                    {r.status === "accepted" ? (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-950 dark:text-green-300">
                        You have it
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Passed
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
