import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Browse other collectors' public collections. Read with the service-role
// client and only display-safe fields (display name + public set names), so no
// private data is exposed. The signed-in viewer's own collection is left out.

type PubSet = { id: string; name: string; collection_id: string };
type Collector = { profileId: string; name: string; setNames: string[] };

export default async function CollectionsBrowsePage() {
  const admin = createAdminClient();

  // The viewer's own profile, so we can leave their collection out.
  let myProfileId: string | null = null;
  {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      myProfileId = prof?.id ?? null;
    }
  }

  let collectors: Collector[] = [];
  if (admin) {
    const { data: sets } = await admin
      .from("collection_sets")
      .select("id, name, collection_id")
      .eq("is_public", true);
    const pubSets = (sets as PubSet[] | null) ?? [];

    if (pubSets.length) {
      const collectionIds = [...new Set(pubSets.map((s) => s.collection_id))];
      const { data: cols } = await admin
        .from("collections")
        .select("id, profile_id")
        .in("id", collectionIds);
      const colToProfile = new Map<string, string>();
      for (const c of cols ?? [])
        if (c.profile_id) colToProfile.set(c.id, c.profile_id);

      const byProfile = new Map<string, string[]>();
      for (const s of pubSets) {
        const pid = colToProfile.get(s.collection_id);
        if (!pid || pid === myProfileId) continue;
        const arr = byProfile.get(pid) ?? [];
        arr.push(s.name);
        byProfile.set(pid, arr);
      }

      const profileIds = [...byProfile.keys()];
      if (profileIds.length) {
        const { data: profs } = await admin
          .from("profiles")
          .select("id, display_name")
          .in("id", profileIds);
        const nameOf = new Map<string, string>();
        for (const p of profs ?? [])
          nameOf.set(p.id, p.display_name || "A collector");
        collectors = profileIds
          .map((pid) => ({
            profileId: pid,
            name: nameOf.get(pid) ?? "A collector",
            setNames: byProfile.get(pid) ?? [],
          }))
          .sort((a, b) => a.name.localeCompare(b.name));
      }
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Collections</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Browse other collectors&apos; public sets.
        </p>
      </div>

      {collectors.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed p-12 text-center text-sm text-muted-foreground">
          No public collections to show yet.
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {collectors.map((c) => (
            <Link
              key={c.profileId}
              href={`/u/${c.profileId}`}
              className="group rounded-2xl border border-border/60 bg-card p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="text-base font-semibold tracking-tight">
                {c.name}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {c.setNames.length} public{" "}
                {c.setNames.length === 1 ? "set" : "sets"}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {c.setNames.slice(0, 4).map((n, i) => (
                  <span
                    key={i}
                    className="rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground"
                  >
                    {n}
                  </span>
                ))}
                {c.setNames.length > 4 && (
                  <span className="px-1 text-xs text-muted-foreground">
                    +{c.setNames.length - 4} more
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
