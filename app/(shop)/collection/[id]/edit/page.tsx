import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { updateCollectionItem } from "../../actions";
import { GRADING_SERVICES } from "@/lib/coins";
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

export default async function EditCollectionItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { id } = await params;
  const { from } = await searchParams;
  const supabase = await createClient();
  const { data: item } = await supabase
    .from("collection_items")
    .select("*")
    .eq("id", id)
    .single();
  if (!item) notFound();

  const cancelHref = from ? `/collection?set=${from}` : `/collection/${id}`;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/collection" className="hover:underline">
          My Collection
        </Link>
        <span>/</span>
        <span className="truncate">{item.title || "Untitled Coin"}</span>
        <span>/</span>
        <span>Edit</span>
      </div>
      <h1 className="mt-1 text-2xl font-semibold">Edit Coin</h1>

      <form action={updateCollectionItem} className="mt-6 space-y-6">
        <input type="hidden" name="id" value={item.id} />
        {from && <input type="hidden" name="set" value={from} />}

        <Field
          label="Title"
          name="title"
          hint="Describe the coin, e.g. 1881-S Morgan Dollar MS65 PCGS"
        >
          <input
            id="title"
            name="title"
            required
            defaultValue={item.title ?? ""}
            className={inputCls}
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Grade" name="grade" hint="Sheldon number 1–70 (optional)">
            <input
              id="grade"
              name="grade"
              type="number"
              min="1"
              max="70"
              defaultValue={item.grade ?? ""}
              placeholder="e.g. 65"
              className={inputCls}
            />
          </Field>
          <Field label="Grading service" name="grading_service" hint="Optional">
            <select
              id="grading_service"
              name="grading_service"
              defaultValue={item.grading_service ?? ""}
              className={inputCls}
            >
              <option value="">—</option>
              {GRADING_SERVICES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Cert number" name="cert_number" hint="Optional">
            <input
              id="cert_number"
              name="cert_number"
              defaultValue={item.cert_number ?? ""}
              className={inputCls}
            />
          </Field>
          <Field
            label="Acquired price (USD)"
            name="acquired_price"
            hint="Optional — private to you"
          >
            <input
              id="acquired_price"
              name="acquired_price"
              type="number"
              step="0.01"
              defaultValue={
                item.acquired_price_cents != null
                  ? (item.acquired_price_cents / 100).toFixed(2)
                  : ""
              }
              placeholder="e.g. 3200.00"
              className={inputCls}
            />
          </Field>
        </div>

        <Field label="Description" name="notes" hint="Optional — shows on the coin's card in your collection">
          <textarea
            id="notes"
            name="notes"
            rows={3}
            defaultValue={item.notes ?? ""}
            className={inputCls}
          />
        </Field>

        <div className="flex items-center justify-end gap-3 border-t pt-4">
          <Link
            href={cancelHref}
            className="text-sm text-muted-foreground hover:underline"
          >
            Cancel
          </Link>
          <Button type="submit">Save Changes</Button>
        </div>
      </form>
    </div>
  );
}
