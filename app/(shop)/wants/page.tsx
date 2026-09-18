import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fmtMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";

type Want = {
  id: string;
  title: string | null;
  grade_min: number | null;
  grade_max: number | null;
  budget_cents: number | null;
  status: string;
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

export default async function WantsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let wants: Want[] = [];
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
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Wants</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Coins you&apos;re looking for. Dealers get matched to these in a later
            session.
          </p>
        </div>
        <Link href="/wants/new">
          <Button>Add a want</Button>
        </Link>
      </div>

      {wants.length > 0 ? (
        <ul className="mt-6 divide-y rounded-xl border">
          {wants.map((w) => (
            <li key={w.id}>
              <Link
                href={`/wants/${w.id}`}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">
                    {w.title || "Untitled want"}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {gradeText(w.grade_min, w.grade_max)}
                    {w.budget_cents != null
                      ? ` · up to ${fmtMoney(w.budget_cents)}`
                      : ""}
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[w.status] ?? "bg-muted text-muted-foreground"}`}
                >
                  {w.status}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-6 rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          No wants yet. Click <span className="font-medium">Add a want</span> to
          describe a coin you&apos;re looking for.
        </div>
      )}
    </div>
  );
}
