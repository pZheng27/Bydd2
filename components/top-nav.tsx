"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Top-level area nav. Just "Collections" (browse other collectors' public sets)
 * now — the collector's own areas (Collector, Dealer) live in the user menu
 * under their name. Matching is segment-aware so "/collections" never lights up
 * "/collection".
 */
export function TopNav() {
  const pathname = usePathname();
  const active =
    pathname === "/collections" ||
    pathname.startsWith("/collections/") ||
    pathname.startsWith("/u/");

  return (
    <nav className="flex items-center gap-1 text-sm">
      <Link
        href="/collections"
        className={cn(
          "rounded-md px-3 py-1.5 font-medium",
          active
            ? "bg-foreground text-background"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        Collections
      </Link>
    </nav>
  );
}
