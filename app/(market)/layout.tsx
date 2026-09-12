import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/app-header";

/** Neutral layout for the marketplace (home), item pages, and checkout. */
export default async function MarketLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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

  return (
    <div className="min-h-screen">
      <AppHeader email={profile?.email ?? user.email ?? ""} />
      <main className="p-6">{children}</main>
    </div>
  );
}
