"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { sendMessageInline } from "@/app/(market)/messages/actions";

type Status = "idle" | "sending" | "sent" | "error";

/** "Message seller" button that opens a compose overlay and sends in place. */
export function MessageSeller({
  recipientId,
  itemId,
  sellerName,
}: {
  recipientId: string;
  itemId: string;
  sellerName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  function openModal() {
    setOpen(true);
    setStatus("idle");
    setError(null);
  }

  async function send() {
    if (!body.trim()) return;
    setStatus("sending");
    setError(null);
    const res = await sendMessageInline({
      recipient: recipientId,
      item: itemId,
      body,
    });
    if (res.ok) {
      setStatus("sent");
      setBody("");
    } else {
      setStatus("error");
      setError(res.error ?? "Couldn't send");
    }
  }

  return (
    <>
      <Button variant="outline" className="w-full" onClick={openModal}>
        Message seller
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border bg-background p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">
                Message {sellerName || "the seller"}
              </h2>
              <button
                onClick={() => setOpen(false)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {status === "sent" ? (
              <div className="mt-4 space-y-3">
                <p className="rounded-md bg-muted px-3 py-2 text-sm">
                  Message sent ✓
                </p>
                <div className="flex items-center justify-end gap-3">
                  <Link href="/messages" className="text-sm underline">
                    Go to Messages
                  </Link>
                  <Button variant="outline" onClick={() => setOpen(false)}>
                    Close
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={4}
                  autoFocus
                  placeholder="Ask about this coin…"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
                {error && <p className="text-sm text-destructive">{error}</p>}
                <div className="flex items-center justify-end gap-2">
                  <Button variant="outline" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={send}
                    disabled={status === "sending" || !body.trim()}
                  >
                    {status === "sending" ? "Sending…" : "Send"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
