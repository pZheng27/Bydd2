"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Send a message to another user, optionally about a listing. */
export async function sendMessage(formData: FormData) {
  const recipient = String(formData.get("recipient") ?? "");
  const item = String(formData.get("item") ?? "") || null;
  const body = (formData.get("body") as string | null)?.trim();
  if (!recipient || !body) return;

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

  await supabase.from("messages").insert({
    sender_profile_id: profile.id,
    recipient_profile_id: recipient,
    inventory_item_id: item,
    body,
  });

  const params = new URLSearchParams({ with: recipient });
  if (item) params.set("item", item);
  redirect(`/messages?${params.toString()}`);
}
