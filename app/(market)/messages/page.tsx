import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { sendMessage } from "@/app/(market)/messages/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Msg = {
  id: string;
  sender_profile_id: string;
  recipient_profile_id: string;
  inventory_item_id: string | null;
  body: string;
  created_at: string;
};

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ with?: string; item?: string }>;
}) {
  const { with: activeOther = null, item: activeItem = null } =
    await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user!.id)
    .single();
  const myId = profile!.id;

  const { data: raw } = await supabase
    .from("messages")
    .select(
      "id, sender_profile_id, recipient_profile_id, inventory_item_id, body, created_at",
    )
    .order("created_at", { ascending: true });
  const messages = (raw ?? []) as Msg[];

  const otherOf = (m: Msg) =>
    m.sender_profile_id === myId ? m.recipient_profile_id : m.sender_profile_id;

  // Labels: dealer business names (public) and item titles.
  const otherIds = [...new Set(messages.map(otherOf).concat(activeOther ? [activeOther] : []))];
  const itemIds = [
    ...new Set(
      messages
        .map((m) => m.inventory_item_id)
        .concat(activeItem ? [activeItem] : [])
        .filter((x): x is string => !!x),
    ),
  ];
  const dealerName = new Map<string, string>();
  if (otherIds.length) {
    const { data } = await supabase
      .from("dealers")
      .select("profile_id, business_name")
      .in("profile_id", otherIds);
    for (const d of data ?? [])
      if (d.business_name) dealerName.set(d.profile_id, d.business_name);
  }
  const itemTitle = new Map<string, string>();
  if (itemIds.length) {
    const { data } = await supabase
      .from("inventory_items")
      .select("id, title")
      .in("id", itemIds);
    for (const it of data ?? []) itemTitle.set(it.id, it.title ?? "a coin");
  }
  const partyLabel = (id: string) => dealerName.get(id) ?? "Collector";

  // Group into conversations by (other party + item); latest message wins.
  const convo = new Map<
    string,
    { otherId: string; itemId: string | null; last: Msg }
  >();
  for (const m of messages) {
    const other = otherOf(m);
    convo.set(`${other}::${m.inventory_item_id ?? ""}`, {
      otherId: other,
      itemId: m.inventory_item_id,
      last: m,
    });
  }
  const conversations = [...convo.values()].sort((a, b) =>
    a.last.created_at < b.last.created_at ? 1 : -1,
  );

  const thread = activeOther
    ? messages.filter(
        (m) =>
          otherOf(m) === activeOther &&
          (m.inventory_item_id ?? "") === (activeItem ?? ""),
      )
    : [];

  const convHref = (otherId: string, itemId: string | null) =>
    `/messages?with=${otherId}${itemId ? `&item=${itemId}` : ""}`;

  return (
    <div>
      <h1 className="text-2xl font-semibold">Messages</h1>
      <div className="mt-4 grid gap-4 sm:grid-cols-[280px_1fr]">
        {/* Conversation list */}
        <div className="rounded-xl border">
          {conversations.length ? (
            conversations.map((c) => {
              const active =
                c.otherId === activeOther &&
                (c.itemId ?? "") === (activeItem ?? "");
              return (
                <Link
                  key={`${c.otherId}::${c.itemId ?? ""}`}
                  href={convHref(c.otherId, c.itemId)}
                  className={cn(
                    "block border-b p-3 last:border-0 hover:bg-muted/50",
                    active && "bg-muted",
                  )}
                >
                  <div className="text-sm font-medium">
                    {partyLabel(c.otherId)}
                  </div>
                  {c.itemId && (
                    <div className="truncate text-xs text-muted-foreground">
                      re: {itemTitle.get(c.itemId) ?? "a coin"}
                    </div>
                  )}
                  <div className="truncate text-xs text-muted-foreground">
                    {c.last.sender_profile_id === myId ? "You: " : ""}
                    {c.last.body}
                  </div>
                </Link>
              );
            })
          ) : (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No conversations yet.
            </div>
          )}
        </div>

        {/* Active thread */}
        <div className="rounded-xl border p-4">
          {activeOther ? (
            <>
              <div className="border-b pb-2">
                <div className="font-medium">{partyLabel(activeOther)}</div>
                {activeItem && (
                  <div className="text-xs text-muted-foreground">
                    re: {itemTitle.get(activeItem) ?? "a coin"}
                  </div>
                )}
              </div>

              <div className="mt-3 space-y-2">
                {thread.length ? (
                  thread.map((m) => {
                    const mine = m.sender_profile_id === myId;
                    return (
                      <div
                        key={m.id}
                        className={cn("flex", mine ? "justify-end" : "justify-start")}
                      >
                        <div
                          className={cn(
                            "max-w-[80%] rounded-lg px-3 py-2 text-sm",
                            mine
                              ? "bg-foreground text-background"
                              : "bg-muted text-foreground",
                          )}
                        >
                          {m.body}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No messages yet — say hello.
                  </p>
                )}
              </div>

              <form action={sendMessage} className="mt-4 flex gap-2">
                <input type="hidden" name="recipient" value={activeOther} />
                {activeItem && (
                  <input type="hidden" name="item" value={activeItem} />
                )}
                <input
                  name="body"
                  required
                  autoComplete="off"
                  placeholder="Write a message…"
                  className="flex-1 rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
                <Button type="submit">Send</Button>
              </form>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Select a conversation, or message a seller from a listing.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
