import Link from "next/link";

const LINKS = [
  {
    href: "/dealer/inventory",
    title: "Inventory",
    desc: "Add and manage the coins you carry.",
  },
  {
    href: "/dealer/profile",
    title: "Profile",
    desc: "Business name, location, and what you carry.",
  },
  {
    href: "/dealer/offers",
    title: "Offers",
    desc: "Offers buyers made on your coins.",
  },
  {
    href: "/dealer/requests",
    title: "Requests",
    desc: "Buyer requests routed to you (later).",
  },
];

export default function DealerHubPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold">Dealer</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Your seller workspace. List coins on the{" "}
        <Link href="/" className="underline">
          marketplace
        </Link>{" "}
        from your inventory.
      </p>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
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
