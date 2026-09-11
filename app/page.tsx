import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RoleSwitcher } from "@/components/role-switcher";
import { signOut, type ActiveRole } from "@/app/actions";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Middleware normally handles this; guard here too.
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, email, is_collector, is_dealer, is_admin")
    .eq("user_id", user.id)
    .single();

  const cookieStore = await cookies();
  const active = (cookieStore.get("active_role")?.value as ActiveRole) ?? "collector";

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between gap-4 border-b px-6 py-3">
        <div className="flex items-center gap-4">
          <span className="font-semibold">Bydd</span>
          <RoleSwitcher active={active} />
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">{profile?.email ?? user.email}</span>
          <form action={signOut}>
            <button className="rounded-md border px-3 py-1.5 font-medium hover:bg-muted">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="p-6">
        {active === "collector" ? (
          <EmptyView
            title="Collector"
            lines={[
              "Your sets and collection will live here.",
              "Coming in Session 4: add coins, see set gaps, and create wants.",
            ]}
          />
        ) : (
          <EmptyView
            title="Dealer"
            lines={[
              "Your inventory and requests will live here.",
              "Coming in Session 2: list coins, manage inventory, and receive requests.",
            ]}
          />
        )}
      </main>
    </div>
  );
}

function EmptyView({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="mx-auto mt-10 max-w-2xl rounded-xl border border-dashed p-10 text-center">
      <h1 className="text-2xl font-semibold">{title} view</h1>
      <div className="mt-3 space-y-1 text-sm text-muted-foreground">
        {lines.map((l) => (
          <p key={l}>{l}</p>
        ))}
      </div>
    </div>
  );
}
