import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fmtMoney } from "@/lib/format";
import { embeddedOne } from "@/lib/catalog";
import { setWantStatus, deleteWant } from "./actions";
import { cancelStandingOffer } from "@/app/(shop)/agent/actions";
import { Button } from "@/components/ui/button";

type Want = {
  id: string;
  title: string | null;
  grade_min: number | null;
  grade_max: number | null;
  budget_cents: number | null;
  status: string;
};
type StandingRow = {
  id: string;
  max_price_cents: number;
  grade_min: number | null;
  grade_max: number | null;
  coin_type: { name: string } | { name: string }[] | null;
};

function gradeText(min: number | null, max: number | null): string {
  if (min != null && max != null) return `Grade ${min}–${max}`;
  if (min != null) return `Grade ${min}+`;
  if (max != null) return `Grade ≤${max}`;
  return "Any grade";
}

const STATUS_STYLES: Record<string, string> = {
  open: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  filled: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  cancelled: "bg-muted text-muted-foreground",
};
// "cancelled" is the paused/inactive state in the UI.
const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  filled: "Filled",
  cancelled: "Paused",
};

/** A one-click status form (fulfill / pause / reopen). */
function StatusButton({
  id,
  status,
  label,
}: {
  id: string;
  status: "open" | "filled" | "cancelled";
  label: string;
}) {
  return (
    <form action={setWantStatus}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <Button type="submit" size="xs" variant="outline">
        {label}
      </Button>
    </form>
  );
}

export default async function WantsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let wants: Want[] = [];
  let standing: StandingRow[] = [];
  if (user) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (prof) {
      const { data } = await supabase
        .from("wants")
        .select("id, title, grade_min, grade_max, budget_cents, status")
        .eq("profile_id", prof.id)
        .order("created_at", { ascending: false });
      wants = (data as Want[]) ?? [];

      const { data: so } = await supabase
        .from("standing_offers")
        .select("id, max_price_cents, grade_min, grade_max, coin_type:coin_types(name)")
        .eq("status", "active")
        .order("created_at", { ascending: false });
      standing = (so as StandingRow[]) ?? [];
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Wants</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Coins you&apos;re looking for — routed to dealers likely to have them.
            Fulfill, pause, or delete any want right here.
          </p>
        </div>
        <Link href="/wants/new">
          <Button>Add a want</Button>
        </Link>
      </div>

      {wants.length > 0 ? (
        <ul className="mt-6 divide-y rounded-xl border">
          {wants.map((w) => (
            <li
              key={w.id}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3"
            >
              <Link
                href={`/wants/${w.id}`}
                className="min-w-0 flex-1 hover:opacity-80"
              >
                <div className="truncate text-sm font-medium">
                  {w.title || "Untitled want"}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {gradeText(w.grade_min, w.grade_max)}
                  {w.budget_cents != null
                    ? ` · up to ${fmtMoney(w.budget_cents)}`
                    : ""}
                </div>
              </Link>

              <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[w.status] ?? "bg-muted text-muted-foreground"}`}
                >
                  {STATUS_LABELS[w.status] ?? w.status}
                </span>

                {w.status === "open" ? (
                  <>
                    <StatusButton id={w.id} status="filled" label="Fulfill" />
                    <StatusButton id={w.id} status="cancelled" label="Pause" />
                  </>
                ) : (
                  <StatusButton
                    id={w.id}
                    status="open"
                    label={w.status === "filled" ? "Reopen" : "Resume"}
                  />
                )}

                <form action={deleteWant}>
                  <input type="hidden" name="id" value={w.id} />
                  <Button
                    type="submit"
                    size="xs"
                    variant="ghost"
                    className="text-destructive"
                  >
                    Delete
                  </Button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-6 rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          No wants yet. Click <span className="font-medium">Add a want</span> to
          describe a coin you&apos;re looking for.
        </div>
      )}

      {standing.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold">Standing offers</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Set up with the buyer agent — these auto-offer when a matching coin
            lists at or below your price.
          </p>
          <ul className="mt-2 divide-y rounded-xl border">
            {standing.map((s) => {
              const name = embeddedOne<{ name: string }>(s.coin_type)?.name ?? "a coin";
              const grade =
                s.grade_min != null || s.grade_max != null
                  ? ` · grade ${s.grade_min ?? "any"}–${s.grade_max ?? "any"}`
                  : "";
              return (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                >
                  <span>
                    {name}{" "}
                    <span className="text-muted-foreground">
                      up to {fmtMoney(s.max_price_cents)}
                      {grade}
                    </span>
                  </span>
                  <form action={cancelStandingOffer}>
                    <input type="hidden" name="id" value={s.id} />
                    <button className="text-xs text-muted-foreground underline hover:text-destructive">
                      Cancel
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
