"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DEALER_CATEGORIES } from "@/lib/categories";

/** Save the dealer's storefront details and the categories they carry. */
export async function saveDealerProfile(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user.id)
    .single();
  if (!profile) return;

  const businessName =
    (formData.get("business_name") as string | null)?.trim() || null;
  const location = (formData.get("location") as string | null)?.trim() || null;
  const acceptsRequests = formData.get("accepts_requests") === "on";

  // Only keep values that are in the fixed category list.
  const selected = formData.getAll("categories").map(String);
  const categories = DEALER_CATEGORIES.filter((c) => selected.includes(c));

  await supabase.from("dealers").upsert(
    {
      profile_id: profile.id,
      business_name: businessName,
      location,
      accepts_requests: acceptsRequests,
      categories,
    },
    { onConflict: "profile_id" },
  );

  redirect("/dealer/profile?saved=1");
}
