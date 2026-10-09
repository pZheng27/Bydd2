import Link from "next/link";
import { TopNav } from "@/components/top-nav";
import { UserMenu } from "@/components/user-menu";
import { setMarketplaceMode } from "@/app/actions";
import { createClient } from "@/lib/supabase/server";
import { getMarketplaceEnabled } from "@/lib/app-settings";

/**
 * Shared top bar: wordmark (→ home). Signed-in visitors get the area nav; the
 * marketplace items (Notifications, Messages) show only when the marketplace is
 * enabled. Admins always get a launch-mode toggle to switch between the full
 * marketplace and the Collections-only launch view.
 */
export async function AppHeader({ email }: { email: string | null }) {
  const signedIn = !!email;
  const marketplaceEnabled = await getMarketplaceEnabled();

  let unread = 0;
  let isAdmin = false;
  if (signedIn) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("id, is_admin")
        .eq("user_id", user.id)
        .maybeSingle();
      if (prof) {
        isAdmin = !!prof.is_admin;
        if (marketplaceEnabled) {
          const { count } = await supabase
            .from("notifications")
            .select("id", { count: "exact", head: true })
            .eq("profile_id", prof.id)
            .is("read_at", null);
          unread = count ?? 0;
        }
      }
    }
  }

  return (
    <header className="flex items-center justify-between gap-4 border-b px-6 py-3">
      <div className="flex items-center gap-4">
        <Link href={marketplaceEnabled ? "/" : "/collections"} className="font-semibold">
          Bydd
        </Link>
        <TopNav />
      </div>
      <div className="flex items-center gap-3 text-sm">
        {isAdmin && (
          <form action={setMarketplaceMode}>
            <input
              type="hidden"
              name="enabled"
              value={String(!marketplaceEnabled)}
            />
            <button
              className="rounded-md border border-dashed px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
              title="Admin only — switch what everyone sees"
            >
              {marketplaceEnabled
                ? "Switch to Collections Launch"
                : "Switch to Full Marketplace"}
            </button>
          </form>
        )}
        {signedIn ? (
          <>
            {marketplaceEnabled && (
              <>
                <Link
                  href="/notifications"
                  className="inline-flex items-center gap-1 font-medium text-muted-foreground hover:text-foreground"
                >
                  Notifications
                  {unread > 0 && (
                    <span className="rounded-sm bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
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
              </>
            )}
            <UserMenu email={email ?? ""} marketplaceEnabled={marketplaceEnabled} />
          </>
        ) : (
          <Link
            href="/login"
            className="rounded-md border px-3 py-1.5 font-medium hover:bg-muted"
          >
            Sign In
          </Link>
        )}
      </div>
    </header>
  );
}
