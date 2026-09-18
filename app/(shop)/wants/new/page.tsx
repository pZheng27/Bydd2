import Link from "next/link";
import { addWant } from "../actions";
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

export default async function NewWantPage({
  searchParams,
}: {
  searchParams: Promise<{ title?: string; coin_type_id?: string }>;
}) {
  const { title = "", coin_type_id = "" } = await searchParams;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/wants" className="hover:underline">
          Wants
        </Link>
        <span>/</span>
        <span>Add</span>
      </div>
      <h1 className="mt-1 text-2xl font-semibold">Add a want</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Describe the coin you&apos;re looking for. Dealers get matched to it in a
        later session.
      </p>

      <form action={addWant} className="mt-6 space-y-6">
        {coin_type_id && (
          <input type="hidden" name="coin_type_id" value={coin_type_id} />
        )}
        <Field
          label="What are you looking for?"
          name="title"
          hint="e.g. 1893-S Morgan Dollar, problem-free"
        >
          <input
            id="title"
            name="title"
            required
            defaultValue={title}
            placeholder="1893-S Morgan Dollar"
            className={inputCls}
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Grade min" name="grade_min" hint="1–70 (optional)">
            <input
              id="grade_min"
              name="grade_min"
              type="number"
              min="1"
              max="70"
              placeholder="e.g. 40"
              className={inputCls}
            />
          </Field>
          <Field label="Grade max" name="grade_max" hint="1–70 (optional)">
            <input
              id="grade_max"
              name="grade_max"
              type="number"
              min="1"
              max="70"
              placeholder="e.g. 55"
              className={inputCls}
            />
          </Field>
          <Field label="Budget (USD)" name="budget" hint="Most you'd pay">
            <input
              id="budget"
              name="budget"
              type="number"
              step="0.01"
              placeholder="e.g. 5000"
              className={inputCls}
            />
          </Field>
        </div>

        <Field label="Notes" name="notes" hint="Optional — eye appeal, toning, etc.">
          <textarea id="notes" name="notes" rows={3} className={inputCls} />
        </Field>

        <div className="flex items-center justify-end gap-3 border-t pt-4">
          <Link
            href="/wants"
            className="text-sm text-muted-foreground hover:underline"
          >
            Cancel
          </Link>
          <Button type="submit">Add want</Button>
        </div>
      </form>
    </div>
  );
}
