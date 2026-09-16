"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { sendChatMessage } from "@/app/dealer/inventory/chat-actions";
import { Button } from "@/components/ui/button";

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "1 oz gold coin, price 5% over spot",
  "Never sell below $2,600",
  "Nudge the price up when it gets popular",
];

/** Render assistant text with clickable URLs (e.g. comp links). */
function linkify(text: string) {
  return text.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="underline break-all"
      >
        {part}
      </a>
    ) : (
      part
    ),
  );
}

export function ItemChat({
  itemId,
  initial,
  configured,
}: {
  itemId: string;
  initial: Msg[];
  configured: boolean;
}) {
  const [messages, setMessages] = useState<Msg[]>(initial);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pending]);

  async function send(text: string) {
    const msg = text.trim();
    if (!msg || pending) return;
    setError(null);
    setInput("");
    setMessages((m) => [...m, { role: "user", content: msg }]);
    setPending(true);
    try {
      const res = await sendChatMessage(itemId, msg);
      if (res.ok) {
        setMessages((m) => [...m, { role: "assistant", content: res.reply }]);
        if (res.ruleChanged) router.refresh();
      } else {
        setError(res.error);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-xl border p-4">
      <div className="text-sm font-medium">Pricing assistant</div>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Tell it how to price this coin in plain English — it sets up the rule for you.
      </p>

      {!configured && (
        <div className="mt-3 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          The AI isn&apos;t configured yet. Add an <code>ANTHROPIC_API_KEY</code>{" "}
          to enable the pricing chat.
        </div>
      )}

      <div className="mt-3 max-h-80 space-y-3 overflow-y-auto">
        {messages.length === 0 && configured && (
          <div className="rounded-md bg-muted/40 p-3 text-sm text-muted-foreground">
            <p>
              Try: <span className="italic">
                &ldquo;1 oz gold coin, 5% over spot, never below $2,600, and nudge
                it up when it gets popular.&rdquo;
              </span>
            </p>
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
          >
            <div
              className={
                m.role === "user"
                  ? "max-w-[85%] whitespace-pre-line rounded-lg bg-foreground px-3 py-2 text-sm text-background"
                  : "max-w-[85%] whitespace-pre-line rounded-lg bg-muted px-3 py-2 text-sm"
              }
            >
              {m.role === "assistant" ? linkify(m.content) : m.content}
            </div>
          </div>
        ))}
        {pending && (
          <div className="flex justify-start">
            <div className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
              Thinking…
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {messages.length === 0 && configured && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => send(s)}
              disabled={pending}
              className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {error && <div className="mt-2 text-xs text-destructive">{error}</div>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="mt-3 flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={!configured || pending}
          placeholder="e.g. price it 4% over spot, floor $2,500"
          className="flex-1 rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
        />
        <Button type="submit" size="sm" disabled={!configured || pending}>
          Send
        </Button>
      </form>
    </div>
  );
}
