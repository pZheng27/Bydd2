import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

type Note = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

export default async function NotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profileId: string | null = null;
  if (user) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    profileId = prof?.id ?? null;
  }

  let notes: Note[] = [];
  if (profileId) {
    const { data } = await supabase
      .from("notifications")
      .select("id, kind, title, body, link, read_at, created_at")
      .eq("profile_id", profileId)
      .order("created_at", { ascending: false })
      .limit(100);
    notes = (data as Note[]) ?? [];

    // Clear the unread badge for next visit (this view still highlights what
    // was new, since `notes` was captured before this update).
    if (notes.some((n) => !n.read_at)) {
      await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("profile_id", profileId)
        .is("read_at", null);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold">Notifications</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Offers, sales, messages, and AI pricing updates.
      </p>

      {notes.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          No notifications yet.
        </div>
      ) : (
        <ul className="mt-4 divide-y rounded-xl border">
          {notes.map((n) => {
            const unread = !n.read_at;
            const inner = (
              <div
                className={
                  unread ? "bg-muted/40 px-4 py-3" : "px-4 py-3"
                }
              >
                <div className="flex items-center gap-2">
                  {unread && (
                    <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" />
                  )}
                  <span className="text-sm font-medium">{n.title}</span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                    {new Date(n.created_at).toLocaleString()}
                  </span>
                </div>
                {n.body && (
                  <p className="mt-0.5 pl-4 text-sm text-muted-foreground">
                    {n.body}
                  </p>
                )}
              </div>
            );
            return (
              <li key={n.id}>
                {n.link ? (
                  <Link href={n.link} className="block hover:bg-muted/60">
                    {inner}
                  </Link>
                ) : (
                  inner
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
