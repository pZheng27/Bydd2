"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const COLLECTOR_PREFIXES = [
  "/collector",
  "/saved",
  "/orders",
  "/offers",
  "/collection",
];

/** Top-level area nav: Collector and Dealer. Marketplace is the neutral home. */
export function RoleNav() {
  const pathname = usePathname();
  const inDealer = pathname.startsWith("/dealer");
  const inCollector = COLLECTOR_PREFIXES.some((p) => pathname.startsWith(p));

  const items = [
    { href: "/collector", label: "Collector", active: inCollector },
    { href: "/dealer", label: "Dealer", active: inDealer },
  ];

  return (
    <nav className="flex items-center gap-1 text-sm">
      {items.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          className={cn(
            "rounded-md px-3 py-1.5 font-medium",
            it.active
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {it.label}
        </Link>
      ))}
    </nav>
  );
}
