import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fmtMoney, gradeLabel } from "@/lib/format";
import { publicPhotoUrl } from "@/lib/photos";
import { completePurchase } from "@/app/(market)/actions";
import { Button } from "@/components/ui/button";

export default async function CheckoutBuyPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  const supabase = await createClient();
  const { data: item } = await supabase
    .from("inventory_items")
    .select(
      "id, title, price_cents, photos, grading_service, grade, designation, shipping_note, is_public, status, dealers(business_name)",
    )
    .eq("id", itemId)
    .single();
  if (!item || !item.is_public || item.status !== "listed") notFound();

  return (
    <div className="mx-auto max-w-lg">
      <Link
        href={`/market/${itemId}`}
        className="text-sm text-muted-foreground hover:underline"
      >
        ← Back to listing
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">Checkout</h1>
      <div className="mt-1 inline-block rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
        SIMULATED — no funds move
      </div>

      <div className="mt-4 flex gap-4 rounded-xl border p-4">
        {item.photos?.[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={publicPhotoUrl(item.photos[0])}
            alt=""
            className="h-20 w-20 rounded-md border object-cover"
          />
        ) : (
          <div className="h-20 w-20 rounded-md bg-muted" />
        )}
        <div className="flex-1">
          <div className="font-medium">{item.title || "Untitled coin"}</div>
          <div className="text-sm text-muted-foreground">{gradeLabel(item)}</div>
          <div className="text-sm text-muted-foreground">
            from{" "}
            {(item as { dealers?: { business_name?: string } }).dealers
              ?.business_name || "a dealer"}
          </div>
        </div>
        <div className="text-lg font-semibold">{fmtMoney(item.price_cents)}</div>
      </div>

      {item.shipping_note && (
        <p className="mt-2 text-sm text-muted-foreground">
          Shipping: {item.shipping_note}
        </p>
      )}

      <form action={completePurchase} className="mt-6">
        <input type="hidden" name="item_id" value={item.id} />
        <Button type="submit" className="w-full">
          Complete purchase
        </Button>
      </form>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        This is a demo. No payment is taken and nothing ships.
      </p>
    </div>
  );
}
