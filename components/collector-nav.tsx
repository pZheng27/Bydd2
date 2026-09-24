"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/collection", label: "Collection" },
  { href: "/saved", label: "Saved" },
  { href: "/orders", label: "Orders" },
  { href: "/offers", label: "Offers" },
  { href: "/wants", label: "Wants" },
];

/** Sub-navigation for the collector (buyer) area. */
export function CollectorNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto border-b px-6">
      {LINKS.map((l) => {
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
