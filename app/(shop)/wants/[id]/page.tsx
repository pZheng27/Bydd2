import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { updateWant, deleteWant } from "../actions";
import { Button } from "@/components/ui/button";

const inputCls =
  "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

function Field({
  label,
  name,
  children,
  hint,
}: {
  label: string;
  name?: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium" htmlFor={name}>
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default async function WantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: w } = await supabase
    .from("wants")
    .select("*")
    .eq("id", id)
    .single();
  if (!w) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/wants" className="hover:underline">
          Wants
        </Link>
        <span>/</span>
        <span className="truncate">{w.title || "Untitled want"}</span>
      </div>
      <h1 className="mt-1 text-2xl font-semibold">Edit want</h1>

      <form action={updateWant} className="mt-6 space-y-6">
        <input type="hidden" name="id" value={w.id} />
        <Field label="What are you looking for?" name="title">
          <input
            id="title"
            name="title"
            required
            defaultValue={w.title ?? ""}
            className={inputCls}
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Grade min" name="grade_min">
            <input
              id="grade_min"
              name="grade_min"
              type="number"
              min="1"
              max="70"
              defaultValue={w.grade_min ?? ""}
              className={inputCls}
            />
          </Field>
          <Field label="Grade max" name="grade_max">
            <input
              id="grade_max"
              name="grade_max"
              type="number"
              min="1"
              max="70"
              defaultValue={w.grade_max ?? ""}
              className={inputCls}
            />
          </Field>
          <Field label="Budget (USD)" name="budget">
            <input
              id="budget"
              name="budget"
              type="number"
              step="0.01"
              defaultValue={w.budget_cents != null ? w.budget_cents / 100 : ""}
              className={inputCls}
            />
          </Field>
        </div>

        <Field label="Notes" name="notes">
          <textarea
            id="notes"
            name="notes"
            rows={3}
            defaultValue={w.notes ?? ""}
            className={inputCls}
          />
        </Field>

        <Field label="Status" name="status">
          <select
            id="status"
            name="status"
            defaultValue={w.status}
            className={inputCls}
          >
            <option value="open">Open</option>
            <option value="filled">Filled</option>
            <option value="cancelled">Paused</option>
          </select>
        </Field>

        <div className="flex items-center justify-end gap-3 border-t pt-4">
          <Link
            href="/wants"
            className="text-sm text-muted-foreground hover:underline"
          >
            Cancel
          </Link>
          <Button type="submit">Save</Button>
        </div>
      </form>

      <form action={deleteWant} className="mt-3">
        <input type="hidden" name="id" value={w.id} />
        <button className="text-sm text-muted-foreground underline hover:text-destructive">
          Delete want
        </button>
      </form>
    </div>
  );
}
