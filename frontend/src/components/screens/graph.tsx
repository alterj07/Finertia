"use client";

import { SectionBlock } from "@/components/shared/section-block";
import { GraphCanvas } from "@/components/graph/graph-canvas";

export function GraphScreen() {
  return (
    <div>
      <SectionBlock title="Data graph">
        <p className="mb-4 max-w-[70ch] text-sm leading-relaxed text-ink-soft">
          One node per vendor, customer, bank account, journal batch, model, or evidence bundle —
          aggregated for legibility. Click a node to expand it into the documents underneath.
        </p>
        <GraphCanvas />
      </SectionBlock>
    </div>
  );
}
