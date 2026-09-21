import { aiConfigured } from "@/lib/anthropic";
import { BuyerAgentChat } from "@/components/buyer-agent-chat";

export default function BuyerAgentPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold">Buyer agent</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Your set-completion assistant. It knows what you own and what&apos;s
        missing, finds coins for sale that fill the gaps, and drafts offers —
        single or parallel — for you to confirm before anything sends.
      </p>
      <BuyerAgentChat configured={aiConfigured()} />
    </div>
  );
}
