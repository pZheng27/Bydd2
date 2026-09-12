"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/dealer", label: "Overview" },
  { href: "/dealer/inventory", label: "Inventory" },
  { href: "/dealer/profile", label: "Profile" },
  { href: "/dealer/offers", label: "Offers" },
  { href: "/dealer/requests", label: "Requests" },
];

/** Sub-navigation for the dealer (seller) area. */
export function DealerNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto border-b px-6">
      {LINKS.map((l) => {
        // "Overview" is only active on the exact /dealer path.
        const active =
          l.href === "/dealer"
            ? pathname === "/dealer"
            : pathname === l.href || pathname.startsWith(l.href + "/");
        return (
          <Link
            key={l.href}
            href={l.href}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium",
              active
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
