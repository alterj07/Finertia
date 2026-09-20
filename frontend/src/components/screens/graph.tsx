"use client";

import { useState } from "react";
import { SectionBlock } from "@/components/shared/section-block";
import { AgentRunner } from "@/components/graph/agent-runner";
import { GraphCanvas } from "@/components/graph/graph-canvas";

export function GraphScreen() {
  const [reloadToken, setReloadToken] = useState(0);
  return (
    <div className="stagger">
      <SectionBlock title="Data graph">
        <p className="mb-4 max-w-[70ch] text-sm leading-relaxed text-ink-soft">
          The shared memory graph, live from the backend: one node per vendor, customer, bank
          feed, journal batch, and learned pattern, plus every finding the agents have written.
          Click a node to expand it into the invoices, journal entries, bank lines, emails and
          scans underneath.
        </p>
        <AgentRunner onRan={() => setReloadToken((t) => t + 1)} />
        <GraphCanvas reloadToken={reloadToken} />
      </SectionBlock>
    </div>
  );
}
