import { createClient } from "@/lib/supabase/server";
import { DEALER_CATEGORIES } from "@/lib/categories";
import { saveDealerProfile } from "@/app/dealer/actions";
import { Button } from "@/components/ui/button";

export default async function DealerProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
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
    .select("*")
    .eq("profile_id", profile!.id)
    .single();

  const selected = new Set<string>(dealer?.categories ?? []);
  const { saved } = await searchParams;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold">Dealer profile</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Your storefront details and the categories you carry.
      </p>

      {saved && (
        <p className="mt-4 rounded-md bg-muted px-3 py-2 text-sm">Saved ✓</p>
      )}

      <form action={saveDealerProfile} className="mt-6 space-y-6">
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="business_name">
            Business name
          </label>
          <input
            id="business_name"
            name="business_name"
            defaultValue={dealer?.business_name ?? ""}
            placeholder="e.g. Peter's Rare Coins"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="location">
            Location
          </label>
          <input
            id="location"
            name="location"
            defaultValue={dealer?.location ?? ""}
            placeholder="e.g. Austin, TX"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="space-y-2">
          <span className="text-sm font-medium">What I carry</span>
          <p className="text-xs text-muted-foreground">
            Pick the categories you deal in.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {DEALER_CATEGORIES.map((c) => (
              <label
                key={c}
                className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
              >
                <input
                  type="checkbox"
                  name="categories"
                  value={c}
                  defaultChecked={selected.has(c)}
                />
                <span>{c}</span>
              </label>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="accepts_requests"
            defaultChecked={dealer?.accepts_requests ?? true}
          />
          <span>Accept buyer requests routed to me</span>
        </label>

        <div className="flex items-center justify-between border-t pt-4">
          <p className="text-xs text-muted-foreground">
            Response stats are calculated automatically later — rate{" "}
            {dealer?.response_rate ?? "—"}, median{" "}
            {dealer?.median_response_minutes ?? "—"} min.
          </p>
          <Button type="submit">Save profile</Button>
        </div>
      </form>
    </div>
  );
}
