"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type ActiveRole = "collector" | "dealer";

/** Remember which view (Collector or Dealer) the user is currently in. */
export async function setRole(formData: FormData) {
  const role = formData.get("role");
  if (role === "collector" || role === "dealer") {
    const cookieStore = await cookies();
    cookieStore.set("active_role", role, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  redirect("/");
}

/** Sign the user out and return them to the login screen. */
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
