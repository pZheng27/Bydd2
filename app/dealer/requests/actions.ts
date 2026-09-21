"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** Dealer says they have the coin. RLS scopes the update to their own request. */
export async function acceptRequest(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const supabase = await createClient();
  const { data: req } = await supabase
    .from("requests")
    .update({ status: "accepted" })
    .eq("id", id)
    .select("want_id")
    .single();

  // Let the collector know a dealer responded.
  if (req) {
    const { data: want } = await supabase
      .from("wants")
      .select("profile_id, title")
      .eq("id", req.want_id)
      .maybeSingle();
    const admin = createAdminClient();
    if (want && admin) {
      try {
        await admin.from("notifications").insert({
          profile_id: want.profile_id,
          kind: "request_accepted",
          title: "A dealer has your coin",
          body: `A dealer responded to your want${want.title ? ` for ${want.title}` : ""}.`,
          link: "/wants",
        });
      } catch (e) {
        console.error("notify collector failed", e);
      }
    }
  }
  redirect("/dealer/requests");
}

/** Dealer passes. This feeds routing's −100 "declined this want" next time. */
export async function declineRequest(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("requests").update({ status: "declined" }).eq("id", id);
  redirect("/dealer/requests");
}
