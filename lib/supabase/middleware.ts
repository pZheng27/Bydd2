import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

// Paths reachable without being signed in: the public marketplace (the home
// page and individual listings) plus the auth screens. Everything else — buying,
// offers, watchlist, messages, and the collector/dealer areas — needs sign-in.
const PUBLIC_PATHS = [
  "/",
  "/market",
  "/login",
  "/auth",
  "/u",
  "/collections",
  "/privacy",
  "/terms",
];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

// Marketplace areas — hidden and blocked in the Collections-only launch mode.
// The home page ("/") counts too; Collections/Collector/auth/admin do not.
const MARKETPLACE_PREFIXES = [
  "/market",
  "/messages",
  "/notifications",
  "/checkout",
  "/offers",
  "/orders",
  "/saved",
  "/wants",
  "/dealer",
  "/demand",
];

function isMarketplacePath(pathname: string) {
  if (pathname === "/") return true;
  return MARKETPLACE_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

// Read the global launch mode. Tolerant: if the table isn't there yet, behave
// as the full marketplace so nothing is blocked before the migration is run.
async function marketplaceEnabled(
  supabase: SupabaseClient,
): Promise<boolean> {
  try {
    const { data } = await supabase
      .from("app_settings")
      .select("marketplace_enabled")
      .eq("id", true)
      .maybeSingle();
    return data?.marketplace_enabled ?? true;
  } catch {
    return true;
  }
}

/**
 * Refreshes the Supabase auth session on every request and guards routes:
 * signed-out visitors may browse the public marketplace (PUBLIC_PATHS) but are
 * redirected to /login for anything else; signed-in visitors are kept off /login.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do NOT run code between createServerClient and getUser() — it refreshes
  // the session token and must happen first.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Collections-only launch mode: send marketplace routes (for anyone) to the
  // Collections browse. Admins switch back with the header toggle. Only query
  // the setting for marketplace paths, so other routes pay nothing.
  if (isMarketplacePath(pathname) && !(await marketplaceEnabled(supabase))) {
    const url = request.nextUrl.clone();
    url.pathname = "/collections";
    url.search = "";
    const redirect = NextResponse.redirect(url);
    supabaseResponse.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }

  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    const redirect = NextResponse.redirect(url);
    supabaseResponse.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    const redirect = NextResponse.redirect(url);
    supabaseResponse.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }

  return supabaseResponse;
}
