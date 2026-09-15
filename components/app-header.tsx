import Link from "next/link";
import { RoleNav } from "@/components/role-nav";
import { signOut } from "@/app/actions";

/**
 * Shared top bar: wordmark (→ marketplace home). Signed-in visitors get the
 * area nav, Messages, their email, and Sign out; signed-out visitors (browsing
 * the public marketplace) just get a Sign in link.
 */
export function AppHeader({ email }: { email: string | null }) {
  const signedIn = !!email;
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
