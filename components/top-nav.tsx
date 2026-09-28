"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// Coin areas that count as the collector's own space (for highlighting).
const COLLECTOR_PREFIXES = [
  "/collector",
  "/saved",
  "/orders",
  "/offers",
  "/collection",
  "/wants",
];

/**
 * Top-level area nav. "Collections" (browse other collectors' public sets) is
 * always shown; "Collector" appears once signed in. "Dealer" is a marketplace
 * area, so it only shows when the marketplace is enabled. Matching is
 * segment-aware so "/collections" never lights up "/collection".
 */
export function TopNav({
  signedIn,
  marketplaceEnabled = true,
}: {
  signedIn: boolean;
  marketplaceEnabled?: boolean;
}) {
  const pathname = usePathname();
  const inSeg = (p: string) => pathname === p || pathname.startsWith(p + "/");

  const items = [
    {
      href: "/collections",
      label: "Collections",
      active: inSeg("/collections") || pathname.startsWith("/u/"),
      show: true,
    },
    {
      href: "/collection",
      label: "Collector",
      active: COLLECTOR_PREFIXES.some(inSeg),
      show: signedIn,
    },
    {
      href: "/dealer",
      label: "Dealer",
      active: pathname.startsWith("/dealer"),
      show: signedIn && marketplaceEnabled,
    },
  ].filter((it) => it.show);

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
