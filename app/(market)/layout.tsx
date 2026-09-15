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

  // Signed-out visitors can still browse the marketplace; the header adapts.
  let email: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("email")
      .eq("user_id", user.id)
      .single();
    email = profile?.email ?? user.email ?? null;
  }

  return (
    <div className="min-h-screen">
      <AppHeader email={email} />
      <main className="p-6">{children}</main>
    </div>
  );
}
