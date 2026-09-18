import Link from "next/link";

const LINKS = [
  { href: "/saved", title: "Saved", desc: "Coins you've saved to watch." },
  { href: "/orders", title: "Orders", desc: "Your purchases and sales." },
  { href: "/offers", title: "Offers", desc: "Offers you've made." },
  {
    href: "/collection",
    title: "My Collection",
    desc: "The coins you own — add them by hand.",
  },
  {
    href: "/wants",
    title: "Wants",
    desc: "Coins you're looking for.",
  },
];

export default function CollectorHubPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold">Collector</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Your saved coins, orders, offers, and collection. Browse coins on the{" "}
        <Link href="/" className="underline">
          marketplace
        </Link>
        .
      </p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="rounded-xl border p-4 transition-colors hover:bg-muted"
          >
            <div className="font-medium">{l.title}</div>
            <div className="mt-1 text-sm text-muted-foreground">{l.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
