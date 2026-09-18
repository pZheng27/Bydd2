import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { addInventoryItem } from "@/app/dealer/inventory/actions";
import { GRADING_SERVICES } from "@/lib/coins";
import { PhotoUploader } from "@/components/photo-uploader";
import { publicPhotoUrl } from "@/lib/photos";
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

type CollectionItem = {
  id: string;
  title: string | null;
  notes: string | null;
  photos: string[] | null;
  grading_service: string | null;
  cert_number: string | null;
  acquired_price_cents: number | null;
  grade: number | null;
  designation: string | null;
  metal: string | null;
  fine_weight_oz: number | null;
  series: string | null;
  year: number | null;
  mintmark: string | null;
  variety: string | null;
  coin_type_id: string | null;
};

export default async function AddInventoryItemPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
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
    .maybeSingle();

  let ci: CollectionItem | null = null;
  if (from) {
    const { data } = await supabase
      .from("collection_items")
      .select(
        "id, title, notes, photos, grading_service, cert_number, acquired_price_cents, grade, designation, metal, fine_weight_oz, series, year, mintmark, variety, coin_type_id",
      )
      .eq("id", from)
      .maybeSingle();
    ci = (data as CollectionItem) ?? null;
  }
  const prefillPhotos: string[] = ci?.photos ?? [];

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/dealer/inventory" className="hover:underline">
          Inventory
        </Link>
        <span>/</span>
        <span>{ci ? "List from collection" : "Add item"}</span>
      </div>
      <h1 className="mt-1 text-2xl font-semibold">
        {ci ? "List a coin from your collection" : "Add a coin"}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {ci
          ? "Your coin's details are filled in below. Set a price and it goes live on the marketplace."
          : "Enter a title, add photos, set a price. It goes live on the marketplace automatically."}
      </p>

      <form action={addInventoryItem} className="mt-6 space-y-6">
        {ci && (
          <>
            <input type="hidden" name="from_collection_item_id" value={ci.id} />
            {ci.grade != null && (
              <input type="hidden" name="grade" value={ci.grade} />
            )}
            {ci.designation && (
              <input type="hidden" name="designation" value={ci.designation} />
            )}
            {ci.metal && <input type="hidden" name="metal" value={ci.metal} />}
            {ci.fine_weight_oz != null && (
              <input
                type="hidden"
                name="fine_weight_oz"
                value={ci.fine_weight_oz}
              />
            )}
            {ci.series && <input type="hidden" name="series" value={ci.series} />}
            {ci.year != null && (
              <input type="hidden" name="year" value={ci.year} />
            )}
            {ci.mintmark && (
              <input type="hidden" name="mintmark" value={ci.mintmark} />
            )}
            {ci.variety && (
              <input type="hidden" name="variety" value={ci.variety} />
            )}
            {ci.coin_type_id && (
              <input type="hidden" name="coin_type_id" value={ci.coin_type_id} />
            )}
          </>
        )}

        <Field
          label="Title"
          name="title"
          hint="Describe the coin, e.g. 1881-S Morgan Dollar MS65 PCGS"
        >
          <input
            id="title"
            name="title"
            required
            defaultValue={ci?.title ?? ""}
            placeholder="1881-S Morgan Dollar MS65 PCGS"
            className={inputCls}
          />
        </Field>

        <div className="space-y-2">
          <span className="text-sm font-medium">Photos</span>
          {prefillPhotos.length > 0 && (
            <div className="flex flex-wrap gap-3">
              {prefillPhotos.map((p) => (
                <div key={p}>
                  <input type="hidden" name="photos" value={p} />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={publicPhotoUrl(p)}
                    alt=""
                    className="h-24 w-24 rounded-md border object-cover"
                  />
                </div>
              ))}
            </div>
          )}
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
              defaultValue={
                ci?.acquired_price_cents != null
                  ? (ci.acquired_price_cents / 100).toFixed(2)
                  : ""
              }
              placeholder="e.g. 3200.00"
              className={inputCls}
            />
          </Field>
          <Field label="Grading service" name="grading_service" hint="Optional">
            <select
              id="grading_service"
              name="grading_service"
              defaultValue={ci?.grading_service ?? ""}
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
              defaultValue={ci?.cert_number ?? ""}
              className={inputCls}
            />
          </Field>
        </div>

        <Field label="Description" name="description" hint="Optional">
          <textarea
            id="description"
            name="description"
            rows={3}
            defaultValue={ci?.notes ?? ""}
            className={inputCls}
          />
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
            href={ci ? `/collection/${ci.id}` : "/dealer/inventory"}
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
