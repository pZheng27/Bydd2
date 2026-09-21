import { createAdminClient } from "@/lib/supabase/admin";
import { runRoutingForStaleWants } from "@/lib/routing-run";

// Weekly re-route: open wants going nowhere (no accepted request, nothing sent
// in the last 7 days) get routed again — dealers' inventory and profiles change.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return Response.json(
      { ok: false, error: "Missing SUPABASE_SECRET_KEY" },
      { status: 500 },
    );
  }

  try {
    const { routed } = await runRoutingForStaleWants(admin, 7);
    return Response.json({ ok: true, routed });
  } catch (e) {
    console.error("route-wants cron failed", e);
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
