"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/collection", label: "Collection", market: false },
  { href: "/saved", label: "Saved", market: true },
  { href: "/orders", label: "Orders", market: true },
  { href: "/offers", label: "Offers", market: true },
  { href: "/wants", label: "Wants", market: true },
];

/**
 * Sub-navigation for the collector (buyer) area. The marketplace tabs (Saved,
 * Orders, Offers, Wants) only appear in the full marketplace; in the
 * Collections-only launch view just "Collection" is shown.
 */
export function CollectorNav({
  marketplaceEnabled = true,
}: {
  marketplaceEnabled?: boolean;
}) {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto border-b px-6">
      {LINKS.filter((l) => marketplaceEnabled || !l.market).map((l) => {
        const active = pathname === l.href || pathname.startsWith(l.href + "/");
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
