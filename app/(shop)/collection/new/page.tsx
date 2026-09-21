import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { addCollectionItem } from "../actions";
import { GRADING_SERVICES } from "@/lib/coins";
import { embeddedOne } from "@/lib/catalog";
import { AddToSetField, type SetOption } from "@/components/add-to-set-field";
import { PhotoUploader } from "@/components/photo-uploader";
import { Button } from "@/components/ui/button";

const inputCls =
  "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

type SetRow = { id: string; name: string; source_set_id: string | null };
type MemberRow = {
  collection_set_id: string;
  sort_order: number | null;
  coin_type: { id: string; name: string } | { id: string; name: string }[] | null;
};

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

export default async function AddCollectionItemPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let collectionId: string | null = null;
  let setOptions: SetOption[] = [];

  if (user) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (prof) {
      const { data: col } = await supabase
        .from("collections")
        .select("id")
        .eq("profile_id", prof.id)
        .maybeSingle();
      collectionId = col?.id ?? null;

      if (collectionId) {
        const { data: setRows } = await supabase
          .from("collection_sets")
          .select("id, name, source_set_id")
          .eq("collection_id", collectionId)
          .order("created_at", { ascending: true });
        const sets = (setRows as SetRow[]) ?? [];

        // For series sets, fetch their coin slots so the form can offer them.
        const seriesIds = sets.filter((s) => s.source_set_id).map((s) => s.id);
        const coinsBySet = new Map<string, { id: string; name: string }[]>();
        if (seriesIds.length) {
          const { data: memberRows } = await supabase
            .from("collection_set_members")
            .select("collection_set_id, sort_order, coin_type:coin_types(id, name)")
            .in("collection_set_id", seriesIds);
          const grouped = new Map<string, { ord: number; c: { id: string; name: string } }[]>();
          for (const m of ((memberRows ?? []) as unknown as MemberRow[])) {
            const ct = embeddedOne<{ id: string; name: string }>(m.coin_type);
            if (!ct) continue;
            const arr = grouped.get(m.collection_set_id) ?? [];
            arr.push({ ord: m.sort_order ?? Number.POSITIVE_INFINITY, c: ct });
            grouped.set(m.collection_set_id, arr);
          }
          for (const [sid, arr] of grouped) {
            arr.sort((a, b) => a.ord - b.ord || a.c.name.localeCompare(b.c.name));
            coinsBySet.set(sid, arr.map((x) => x.c));
          }
        }

        setOptions = sets.map((s) => ({
          id: s.id,
          name: s.name,
          kind: s.source_set_id ? "series" : "freeform",
          coins: coinsBySet.get(s.id) ?? [],
        }));
      }
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/collection" className="hover:underline">
          My Collection
        </Link>
        <span>/</span>
        <span>Add coin</span>
      </div>
      <h1 className="mt-1 text-2xl font-semibold">Add a coin you own</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Enter what you know, and choose which set it belongs to. Adding it to a
        checklist set marks that coin as owned.
      </p>

      <form action={addCollectionItem} className="mt-6 space-y-6">
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

        <AddToSetField sets={setOptions} />

        <div className="space-y-2">
          <span className="text-sm font-medium">Photos</span>
          {collectionId && <PhotoUploader prefix={collectionId} />}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Grade" name="grade" hint="Sheldon number 1–70 (optional)">
            <input
              id="grade"
              name="grade"
              type="number"
              min="1"
              max="70"
              placeholder="e.g. 65"
              className={inputCls}
            />
          </Field>
          <Field label="Grading service" name="grading_service" hint="Optional">
            <select
              id="grading_service"
              name="grading_service"
              defaultValue=""
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
            <input id="cert_number" name="cert_number" className={inputCls} />
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
              placeholder="e.g. 3200.00"
              className={inputCls}
            />
          </Field>
        </div>

        <Field label="Notes" name="notes" hint="Optional">
          <textarea id="notes" name="notes" rows={3} className={inputCls} />
        </Field>

        <div className="flex items-center justify-end gap-3 border-t pt-4">
          <Link
            href="/collection"
            className="text-sm text-muted-foreground hover:underline"
          >
            Cancel
          </Link>
          <Button type="submit">Add to collection</Button>
        </div>
      </form>
    </div>
  );
}
