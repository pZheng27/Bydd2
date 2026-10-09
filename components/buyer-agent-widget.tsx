"use client";

import { useState } from "react";
import { BuyerAgentChat } from "@/components/buyer-agent-chat";
import { MessageSquare, X } from "lucide-react";

/**
 * The buyer agent as a closable chat window docked on the right, available
 * across the collector area — a floating launcher when closed, a right-side
 * panel when open.
 */
export function BuyerAgentWidget({ configured }: { configured: boolean }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-sm border bg-background px-4 py-2.5 text-sm font-medium shadow-lg hover:bg-muted"
      >
        <MessageSquare className="size-4" aria-hidden /> Buyer Agent
      </button>
    );
  }

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l bg-background shadow-xl sm:w-[380px]">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="text-sm font-semibold">Buyer Agent</div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close buyer agent"
          className="rounded-md px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <div className="min-h-0 flex-1 p-4">
        <BuyerAgentChat configured={configured} />
      </div>
    </div>
  );
}
