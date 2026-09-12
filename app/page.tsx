import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/app-header";
import { type ActiveRole } from "@/app/actions";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("email")
    .eq("user_id", user.id)
    .single();

  const cookieStore = await cookies();
  const active =
    (cookieStore.get("active_role")?.value as ActiveRole) ?? "collector";

  return (
    <div className="min-h-screen">
      <AppHeader email={profile?.email ?? user.email ?? ""} activeRole={active} />
      <main className="p-6">
        {active === "dealer" ? <DealerHome /> : <CollectorHome />}
      </main>
    </div>
  );
}

function DealerHome() {
  const links = [
    {
      href: "/market",
      title: "Marketplace",
      desc: "Browse and buy coins from all dealers.",
    },
    {
      href: "/dealer/inventory",
      title: "Inventory",
      desc: "Add and manage the coins you carry.",
    },
    {
      href: "/dealer/profile",
      title: "Profile",
      desc: "Business name, location, and what you carry.",
    },
    {
      href: "/dealer/requests",
      title: "Requests",
      desc: "Buyer requests routed to you (later).",
    },
  ];
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold">Dealer</h1>
      <p className="mt-1 text-sm text-muted-foreground">Your seller workspace.</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="rounded-xl border p-4 transition-colors hover:bg-muted"
          >
            <div className="font-medium">{l.title}</div>
            <div className="mt-1 text-sm text-muted-foreground">{l.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function CollectorHome() {
  const links = [
    { href: "/market", title: "Marketplace", desc: "Browse and buy listed coins." },
    { href: "/saved", title: "Saved", desc: "Coins you've saved to watch." },
    { href: "/orders", title: "Orders", desc: "Your purchases and sales." },
    { href: "/offers", title: "Offers", desc: "Offers you've made." },
    { href: "/collection", title: "My Collection", desc: "Your collection (fills in later)." },
  ];
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold">Collector</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Browse the marketplace and manage your collection.
      </p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="rounded-xl border p-4 transition-colors hover:bg-muted"
          >
            <div className="font-medium">{l.title}</div>
            <div className="mt-1 text-sm text-muted-foreground">{l.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
