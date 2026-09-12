import Link from "next/link";
import { RoleNav } from "@/components/role-nav";
import { signOut } from "@/app/actions";

/** Shared top bar: wordmark (→ marketplace home), area nav, user, sign out. */
export function AppHeader({ email }: { email: string }) {
  return (
    <header className="flex items-center justify-between gap-4 border-b px-6 py-3">
      <div className="flex items-center gap-4">
        <Link href="/" className="font-semibold">
          Bydd
        </Link>
        <RoleNav />
      </div>
      <div className="flex items-center gap-3 text-sm">
        <span className="text-muted-foreground">{email}</span>
        <form action={signOut}>
          <button className="rounded-md border px-3 py-1.5 font-medium hover:bg-muted">
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
