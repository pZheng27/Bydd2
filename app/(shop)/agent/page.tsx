import { createClient } from "@/lib/supabase/server";
import { aiConfigured } from "@/lib/anthropic";
import { fmtMoney } from "@/lib/format";
import { embeddedOne } from "@/lib/catalog";
import { cancelStandingOffer } from "./actions";
import { BuyerAgentChat } from "@/components/buyer-agent-chat";

type StandingRow = {
  id: string;
  max_price_cents: number;
  grade_min: number | null;
  grade_max: number | null;
  coin_type: { name: string } | { name: string }[] | null;
};

export default async function BuyerAgentPage() {
  const supabase = await createClient();
  const { data: standingData } = await supabase
    .from("standing_offers")
    .select("id, max_price_cents, grade_min, grade_max, coin_type:coin_types(name)")
    .eq("status", "active")
    .order("created_at", { ascending: false });
  const standing = (standingData as StandingRow[]) ?? [];

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold">Buyer agent</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Your set-completion assistant. It knows what you own and what&apos;s
        missing, finds coins for sale that fill the gaps, and drafts offers —
        single or parallel — for you to confirm before anything sends.
      </p>

      <BuyerAgentChat configured={aiConfigured()} />

      {standing.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold">Standing offers</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            These auto-offer when a matching coin lists at or below your price.
          </p>
          <ul className="mt-2 divide-y rounded-xl border">
            {standing.map((s) => {
              const name = embeddedOne<{ name: string }>(s.coin_type)?.name ?? "a coin";
              const grade =
                s.grade_min != null || s.grade_max != null
                  ? ` · grade ${s.grade_min ?? "any"}–${s.grade_max ?? "any"}`
                  : "";
              return (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                >
                  <span>
                    {name}{" "}
                    <span className="text-muted-foreground">
                      up to {fmtMoney(s.max_price_cents)}
                      {grade}
                    </span>
                  </span>
                  <form action={cancelStandingOffer}>
                    <input type="hidden" name="id" value={s.id} />
                    <button className="text-xs text-muted-foreground underline hover:text-destructive">
                      Cancel
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
