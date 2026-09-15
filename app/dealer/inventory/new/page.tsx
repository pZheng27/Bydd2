import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { addInventoryItem } from "@/app/dealer/inventory/actions";
import { GRADING_SERVICES } from "@/lib/coins";
import { PhotoUploader } from "@/components/photo-uploader";
import { Button } from "@/components/ui/button";
import { aiConfigured } from "@/lib/anthropic";

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

export default async function AddInventoryItemPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user!.id)
    .single();
  const { data: dealer } = await supabase
    .from("dealers")
    .select("id")
    .eq("profile_id", profile!.id)
    .single();

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/dealer/inventory" className="hover:underline">
          Inventory
        </Link>
        <span>/</span>
        <span>Add item</span>
      </div>
      <h1 className="mt-1 text-2xl font-semibold">Add a coin</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Enter a title, add photos, set a price. It goes live on the marketplace
        automatically.
      </p>

      <form action={addInventoryItem} className="mt-6 space-y-6">
        <Field
          label="Title"
          name="title"
          hint="Describe the coin, e.g. 1881-S Morgan Dollar MS65 PCGS"
        >
          <input
            id="title"
            name="title"
            required
            placeholder="1881-S Morgan Dollar MS65 PCGS"
            className={inputCls}
          />
        </Field>

        <div className="space-y-2">
          <span className="text-sm font-medium">Photos</span>
          {dealer && <PhotoUploader dealerId={dealer.id} />}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Price (USD)" name="price">
            <input
              id="price"
              name="price"
              type="number"
              step="0.01"
              required
              placeholder="e.g. 3450.00"
              className={inputCls}
            />
          </Field>
          <Field label="Cost (USD)" name="cost" hint="Optional — private to you">
            <input
              id="cost"
              name="cost"
              type="number"
              step="0.01"
              placeholder="e.g. 3200.00"
              className={inputCls}
            />
          </Field>
          <Field label="Grading service" name="grading_service" hint="Optional">
            <select id="grading_service" name="grading_service" defaultValue="" className={inputCls}>
              <option value="">—</option>
              {GRADING_SERVICES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Cert number" name="cert_number" hint="Optional">
            <input id="cert_number" name="cert_number" className={inputCls} />
          </Field>
        </div>

        <Field label="Description" name="description" hint="Optional">
          <textarea id="description" name="description" rows={3} className={inputCls} />
        </Field>

        <Field
          label="Shipping note"
          name="shipping_note"
          hint="Optional, e.g. Ships insured within 2 business days"
        >
          <input id="shipping_note" name="shipping_note" className={inputCls} />
        </Field>

        {aiConfigured() && (
          <Field
            label="Pricing instructions (optional)"
            name="pricing_instructions"
            hint="The pricing assistant will set this up for you now. You can keep chatting to adjust it later."
          >
            <textarea
              id="pricing_instructions"
              name="pricing_instructions"
              rows={2}
              placeholder="e.g. 1 oz gold, 4% over spot, never below $2,600, nudge up when it gets popular"
              className={inputCls}
            />
          </Field>
        )}

        <div className="flex items-center justify-end gap-3 border-t pt-4">
          <Link
            href="/dealer/inventory"
            className="text-sm text-muted-foreground hover:underline"
          >
            Cancel
          </Link>
          <Button type="submit">Save &amp; list</Button>
        </div>
      </form>
    </div>
  );
}
