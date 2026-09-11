import Link from "next/link";
import { RoleSwitcher } from "@/components/role-switcher";
import { signOut, type ActiveRole } from "@/app/actions";

/** Shared top bar: wordmark, role switcher, current user, sign out. */
export function AppHeader({
  email,
  activeRole,
}: {
  email: string;
  activeRole: ActiveRole;
}) {
  return (
    <header className="flex items-center justify-between gap-4 border-b px-6 py-3">
      <div className="flex items-center gap-4">
        <Link href="/" className="font-semibold">
          Bydd
        </Link>
        <RoleSwitcher active={activeRole} />
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
