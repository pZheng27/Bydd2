import Link from "next/link";
import { RoleNav } from "@/components/role-nav";
import { signOut } from "@/app/actions";
import { createClient } from "@/lib/supabase/server";

/**
 * Shared top bar: wordmark (→ marketplace home). Signed-in visitors get the
 * area nav, Notifications (with an unread badge), Messages, their email, and
 * Sign out; signed-out visitors get a Sign in link.
 */
export async function AppHeader({ email }: { email: string | null }) {
  const signedIn = !!email;

  let unread = 0;
  if (signedIn) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (prof) {
        const { count } = await supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("profile_id", prof.id)
          .is("read_at", null);
        unread = count ?? 0;
      }
    }
  }

  return (
    <header className="flex items-center justify-between gap-4 border-b px-6 py-3">
      <div className="flex items-center gap-4">
        <Link href="/" className="font-semibold">
          Bydd
        </Link>
        {signedIn && <RoleNav />}
      </div>
      <div className="flex items-center gap-3 text-sm">
        {signedIn ? (
          <>
            <Link
              href="/notifications"
              className="inline-flex items-center gap-1 font-medium text-muted-foreground hover:text-foreground"
            >
              Notifications
              {unread > 0 && (
                <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                  {unread}
                </span>
              )}
            </Link>
            <Link
              href="/messages"
              className="font-medium text-muted-foreground hover:text-foreground"
            >
              Messages
            </Link>
            <span className="text-muted-foreground">{email}</span>
            <form action={signOut}>
              <button className="rounded-md border px-3 py-1.5 font-medium hover:bg-muted">
                Sign out
              </button>
            </form>
          </>
        ) : (
          <Link
            href="/login"
            className="rounded-md border px-3 py-1.5 font-medium hover:bg-muted"
          >
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}
