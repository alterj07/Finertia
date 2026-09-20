"use client";

import { useState } from "react";
import { AgentRunner } from "@/components/graph/agent-runner";
import { DataUpload } from "@/components/graph/data-upload";
import { GraphCanvas } from "@/components/graph/graph-canvas";

export function GraphScreen() {
  const [reloadToken, setReloadToken] = useState(0);
  return (
    <div className="stagger">
      <DataUpload onUploaded={() => setReloadToken((t) => t + 1)} />
      <AgentRunner onRan={() => setReloadToken((t) => t + 1)} />
      <GraphCanvas reloadToken={reloadToken} />
    </div>
  );
}
