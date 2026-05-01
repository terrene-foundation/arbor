"use client";

/**
 * Advisory (Prism) — Side-by-side pilot of Prism ConversationTemplate.
 *
 * Uses @kailash/prism-web's ConversationTemplate in wired mode with
 * ArborAdvisoryAdapter to bridge the existing advisory API.
 *
 * Compare with /advisory for the bespoke implementation.
 */

import { useMemo, Suspense } from "react";
import { ConversationTemplate, LayoutProvider } from "@kailash/prism-web";
import {
  ArborAdvisoryAdapter,
  type ArborConversationSummary,
} from "@/lib/prism-advisory-adapter";
import { RiskTierBadge } from "@/components/design-system";
import type { ConversationSummary } from "@kailash/prism-web";

function RiskBadge({ conversation }: { conversation: ConversationSummary }) {
  const arbor = conversation as ArborConversationSummary;
  if (!arbor.riskTier) return null;
  const tier = arbor.riskTier as "green" | "amber" | "red";
  return <RiskTierBadge tier={tier} />;
}

function AdvisoryPrismContent() {
  const adapter = useMemo(() => new ArborAdvisoryAdapter(), []);

  return (
    <LayoutProvider>
      <div className="h-[calc(100dvh-56px)]">
        <ConversationTemplate
          adapter={adapter}
          renderMeta={(conv) => <RiskBadge conversation={conv} />}
          input={{ placeholder: "Ask about Singapore employment regulations..." }}
          features={{ citations: true, suggestions: true }}
        />
      </div>
    </LayoutProvider>
  );
}

export default function AdvisoryPrismPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-[calc(100dvh-56px)]">
          <div className="text-gray-500">Loading advisory...</div>
        </div>
      }
    >
      <AdvisoryPrismContent />
    </Suspense>
  );
}
