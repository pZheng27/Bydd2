import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/app-header";
import { DealerNav } from "@/components/dealer-nav";
import { type ActiveRole } from "@/app/actions";

export default async function DealerLayout({
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
    .select("id, email")
    .eq("user_id", user.id)
    .single();

  // Every account gets a dealer row the first time it enters the seller area.
  if (profile) {
    await supabase
      .from("dealers")
      .upsert(
        { profile_id: profile.id },
        { onConflict: "profile_id", ignoreDuplicates: true },
      );
  }

  const cookieStore = await cookies();
  const activeRole =
    (cookieStore.get("active_role")?.value as ActiveRole) ?? "dealer";

  return (
    <div className="min-h-screen">
      <AppHeader email={profile?.email ?? user.email ?? ""} activeRole={activeRole} />
      <DealerNav />
      <main className="p-6">{children}</main>
    </div>
  );
}
