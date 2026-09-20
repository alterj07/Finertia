"use client";

import { useRef, useState } from "react";
import { AgentRunner } from "@/components/graph/agent-runner";
import { DataUpload } from "@/components/graph/data-upload";
import { GraphCanvas, type RunInfo } from "@/components/graph/graph-canvas";

export function GraphScreen() {
  const [reloadToken, setReloadToken] = useState(0);
  const [runInfo, setRunInfo] = useState<RunInfo | null>(null);
  const tokenRef = useRef(0);

  function bump(agent: string | null) {
    tokenRef.current += 1;
    setReloadToken(tokenRef.current);
    setRunInfo(agent ? { agent, token: tokenRef.current } : null);
  }

  return (
    <div className="stagger">
      <div className="mb-3 grid items-stretch gap-3 lg:grid-cols-[1fr_1.3fr]">
        <DataUpload onUploaded={() => bump(null)} />
        <AgentRunner onRan={(agent) => bump(agent)} />
      </div>
      <GraphCanvas reloadToken={reloadToken} runInfo={runInfo} />
    </div>
  );
}
