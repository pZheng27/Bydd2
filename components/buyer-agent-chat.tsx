"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  sendBuyerMessage,
  confirmOffer,
  confirmStandingOffer,
  type OfferProposal,
  type StandingProposal,
} from "@/app/(shop)/agent/actions";
import { fmtMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";

type Msg = {
  role: "user" | "assistant";
  content: string;
  proposal?: OfferProposal;
  standingProposal?: StandingProposal;
  sent?: boolean;
};

const SUGGESTIONS = [
  "What am I still missing in my sets?",
  "Find coins to fill my gaps under $1,000 each",
  "Make a parallel offer for the cheapest gap",
];

export function BuyerAgentChat({ configured }: { configured: boolean }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState<number | null>(null);
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
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((m) => [...m, { role: "user", content: msg }]);
    setPending(true);
    try {
      const res = await sendBuyerMessage(history, msg);
      if (res.ok) {
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content: res.reply,
            proposal: res.proposal,
            standingProposal: res.standingProposal,
          },
        ]);
      } else setError(res.error);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function confirm(idx: number, p: OfferProposal) {
    if (confirming !== null) return;
    setConfirming(idx);
    setError(null);
    try {
      const res = await confirmOffer({
        itemIds: p.items.map((i) => i.itemId),
        priceCents: p.priceCents,
        note: p.note,
      });
      if (res.ok) {
        setMessages((m) => m.map((mm, i) => (i === idx ? { ...mm, sent: true } : mm)));
        router.refresh();
      } else setError(res.error ?? "Couldn't send the offer.");
    } catch {
      setError("Couldn't send the offer.");
    } finally {
      setConfirming(null);
    }
  }

  async function confirmStanding(idx: number, sp: StandingProposal) {
    if (confirming !== null) return;
    setConfirming(idx);
    setError(null);
    try {
      const res = await confirmStandingOffer({
        coinTypeId: sp.coinTypeId,
        maxPriceCents: sp.maxPriceCents,
        gradeMin: sp.gradeMin,
        gradeMax: sp.gradeMax,
        note: sp.note,
      });
      if (res.ok) {
        setMessages((m) => m.map((mm, i) => (i === idx ? { ...mm, sent: true } : mm)));
        router.refresh();
      } else setError(res.error ?? "Couldn't set the standing offer.");
    } catch {
      setError("Couldn't set the standing offer.");
    } finally {
      setConfirming(null);
    }
  }

  return (
    <div className="flex h-full flex-col">
      {!configured && (
        <div className="mb-3 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          The AI isn&apos;t configured yet. Add an <code>ANTHROPIC_API_KEY</code>{" "}
          to enable the buyer agent.
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
        {messages.length === 0 && configured && (
          <div className="rounded-md bg-muted/40 p-3 text-sm text-muted-foreground">
            Ask me what you&apos;re missing, to find coins that fill your gaps, or
            to draft an offer — I&apos;ll always let you confirm before anything
            sends.
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i}>
            <div className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div
                className={
                  m.role === "user"
                    ? "max-w-[85%] whitespace-pre-line rounded-lg bg-foreground px-3 py-2 text-sm text-background"
                    : "max-w-[85%] whitespace-pre-line rounded-lg bg-muted px-3 py-2 text-sm"
                }
              >
                {m.content}
              </div>
            </div>
            {m.proposal && (
              <div className="mt-2 rounded-lg border bg-background p-3">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {m.proposal.parallel ? "Parallel offer" : "Offer"} to review
                </div>
                <ul className="mt-1.5 space-y-0.5 text-sm">
                  {m.proposal.items.map((it) => (
                    <li key={it.itemId} className="flex justify-between gap-3">
                      <span className="truncate">{it.title}</span>
                      <span className="shrink-0 text-muted-foreground">{it.dealerName}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 text-sm">
                  <span className="font-semibold">{fmtMoney(m.proposal.priceCents)}</span>{" "}
                  <span className="text-muted-foreground">
                    each
                    {m.proposal.parallel
                      ? " · first dealer to accept wins, the rest cancel"
                      : ""}
                  </span>
                </div>
                <div className="mt-3">
                  {m.sent ? (
                    <span className="text-sm font-medium text-green-700 dark:text-green-400">
                      Sent ✓ — track it under Offers
                    </span>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      disabled={confirming !== null}
                      onClick={() => confirm(i, m.proposal!)}
                    >
                      {confirming === i ? "Sending…" : "Confirm & send"}
                    </Button>
                  )}
                </div>
              </div>
            )}
            {m.standingProposal && (
              <div className="mt-2 rounded-lg border bg-background p-3">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Standing offer to review
                </div>
                <div className="mt-1.5 text-sm">
                  Auto-offer up to{" "}
                  <span className="font-semibold">
                    {fmtMoney(m.standingProposal.maxPriceCents)}
                  </span>{" "}
                  on <span className="font-medium">{m.standingProposal.coinName}</span>
                  {(m.standingProposal.gradeMin != null ||
                    m.standingProposal.gradeMax != null) && (
                    <>
                      {" "}
                      (grade {m.standingProposal.gradeMin ?? "any"}–
                      {m.standingProposal.gradeMax ?? "any"})
                    </>
                  )}{" "}
                  whenever one lists.
                </div>
                <div className="mt-3">
                  {m.sent ? (
                    <span className="text-sm font-medium text-green-700 dark:text-green-400">
                      Standing offer set ✓
                    </span>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      disabled={confirming !== null}
                      onClick={() => confirmStanding(i, m.standingProposal!)}
                    >
                      {confirming === i ? "Setting…" : "Set up standing offer"}
                    </Button>
                  )}
                </div>
              </div>
            )}
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

      <div className="mt-3 border-t pt-3">
        {messages.length === 0 && configured && (
          <div className="mb-2 flex flex-wrap gap-1.5">
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

        {error && <div className="mb-2 text-xs text-destructive">{error}</div>}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={!configured || pending}
            placeholder="e.g. find me an 1893-CC Morgan under $8,000"
            className="flex-1 rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          />
          <Button type="submit" size="sm" disabled={!configured || pending}>
            Send
          </Button>
        </form>
      </div>
    </div>
  );
}
