"use client";

import { SectionBlock } from "@/components/shared/section-block";
import { GraphCanvas } from "@/components/graph/graph-canvas";

export function GraphScreen() {
  return (
    <div>
      <SectionBlock title="Data graph">
        <p className="mb-4 max-w-[70ch] text-sm leading-relaxed text-ink-soft">
          The shared memory graph, live from the backend: one node per vendor, customer, bank
          feed, journal batch, and learned pattern, plus every finding the agents have written.
          Click a node to expand it into the invoices, journal entries, bank lines, emails and
          scans underneath.
        </p>
        <GraphCanvas />
      </SectionBlock>
    </div>
  );
}
