"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { signOut } from "@/app/actions";

// The username acts as a menu: the collector's own areas (Collector, and —
// in the full marketplace — Dealer) live here, plus Sign out. Marketplace-only
// items are hidden in the Collections-only launch view.
export function UserMenu({
  email,
  marketplaceEnabled,
}: {
  email: string;
  marketplaceEnabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const links = [
    { href: "/collection", label: "Collector", show: true },
    { href: "/dealer", label: "Dealer", show: marketplaceEnabled },
  ].filter((l) => l.show);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1 rounded-md px-2 py-1.5 font-medium text-muted-foreground hover:text-foreground"
      >
        <span className="max-w-[180px] truncate">{email}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path
            d="M3 4.5 6 7.5 9 4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-1 w-44 overflow-hidden rounded-md border bg-card py-1 shadow-md"
        >
          {links.map((l) => {
            const active =
              pathname === l.href || pathname.startsWith(l.href + "/");
            return (
              <Link
                key={l.href}
                href={l.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className={cn(
                  "block px-3 py-2 text-sm hover:bg-muted",
                  active ? "font-medium text-foreground" : "text-foreground",
                )}
              >
                {l.label}
              </Link>
            );
          })}
          <div className="my-1 h-px bg-border" />
          <form action={signOut}>
            <button
              type="submit"
              role="menuitem"
              className="block w-full px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted"
            >
              Sign Out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
