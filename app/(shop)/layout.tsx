import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { aiConfigured } from "@/lib/anthropic";
import { AppHeader } from "@/components/app-header";
import { CollectorNav } from "@/components/collector-nav";
import { BuyerAgentWidget } from "@/components/buyer-agent-widget";

export default async function CollectorLayout({
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

  // Every buyer has a collection built in.
  if (profile) {
    await supabase
      .from("collections")
      .upsert(
        { profile_id: profile.id },
        { onConflict: "profile_id", ignoreDuplicates: true },
      );
  }

  return (
    <div className="min-h-screen">
      <AppHeader email={profile?.email ?? user.email ?? ""} />
      <CollectorNav />
      <main className="p-6">{children}</main>
      <BuyerAgentWidget configured={aiConfigured()} />
    </div>
  );
}
