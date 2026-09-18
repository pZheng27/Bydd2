import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCatalogSets } from "@/lib/catalog";
import { createCollectionSet } from "../actions";
import { Button } from "@/components/ui/button";

const inputCls =
  "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

export default async function NewSetPage() {
  const supabase = await createClient();
  const templates = await getCatalogSets(supabase);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/collection" className="hover:underline">
          My Collection
        </Link>
        <span>/</span>
        <span>New set</span>
      </div>
      <h1 className="mt-1 text-2xl font-semibold">Build a set</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Two kinds of set: start from a <span className="font-medium">template</span>{" "}
        (like the Carson City Morgans) to track owned vs. missing coins, or leave
        it empty to make a <span className="font-medium">freeform set</span> you
        drop your own coins into.
      </p>

      <form action={createCollectionSet} className="mt-6 space-y-6">
        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="name">
            Set name
          </label>
          <input
            id="name"
            name="name"
            required
            placeholder="e.g. My Carson City Morgans"
            className={inputCls}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="source_set_id">
            Template
          </label>
          <select
            id="source_set_id"
            name="source_set_id"
            defaultValue=""
            className={inputCls}
          >
            <option value="">Freeform — I&apos;ll add my own coins</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.member_count} coins)
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            {templates.length === 0
              ? "No catalog templates yet — leave this on Freeform and add your own coins."
              : "A template pre-fills the full checklist and tracks what you're missing. Freeform just holds the coins you pick."}
          </p>
        </div>

        <div className="flex items-center justify-end gap-3 border-t pt-4">
          <Link
            href="/collection"
            className="text-sm text-muted-foreground hover:underline"
          >
            Cancel
          </Link>
          <Button type="submit">Create set</Button>
        </div>
      </form>
    </div>
  );
}
