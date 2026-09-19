"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type ForceLink,
  type Simulation,
} from "d3-force";
import { drag as d3drag } from "d3-drag";
import { select as d3select } from "d3-selection";
import { zoom as d3zoom, zoomIdentity, type ZoomTransform } from "d3-zoom";
import { AGGREGATE_DATASET, EXPANSIONS } from "@/lib/mock/graph";
import {
  GROUP_COLOR,
  GROUP_LABEL,
  MODULE_GROUPS,
  computeDegrees,
  linkEndpointId,
  nodeRadius,
  type SimLink,
  type SimNode,
} from "@/lib/graph-utils";
import { FilterChip } from "@/components/shared/filter-chip";
import { GraphHint } from "@/components/graph/graph-hint";
import { GraphLegend } from "@/components/graph/graph-legend";
import { GraphDetailPanel } from "@/components/graph/graph-detail-panel";

type FilterId = "all" | "agents" | (typeof MODULE_GROUPS)[number];

// The simulation's canonical, mutable node/link arrays live in refs — d3
// mutates node.x/y/fx/fy in place every tick, and that must not go through
// React state (too frequent, and the identity of each node object must stay
// stable for d3). `nodesSnapshot`/`linksSnapshot` below are the render-facing
// copies, refreshed on a rAF-throttled cadence from the tick handler — this
// is what JSX actually reads, so no ref is ever read during render.
export function GraphCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const simulationRef = useRef<Simulation<SimNode, SimLink> | null>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const linksRef = useRef<SimLink[]>([]);
  const reducedMotionRef = useRef(false);
  const rafRef = useRef<number | null>(null);

  const [nodesSnapshot, setNodesSnapshot] = useState<SimNode[]>([]);
  const [linksSnapshot, setLinksSnapshot] = useState<SimLink[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<FilterId>("all");
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity);

  const scheduleRender = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      setNodesSnapshot([...nodesRef.current]);
      setLinksSnapshot([...linksRef.current]);
    });
  }, []);

  const refreshForces = useCallback(() => {
    const sim = simulationRef.current;
    if (!sim) return;
    const degrees = computeDegrees(
      linksRef.current.map((l) => ({
        source: linkEndpointId(l.source),
        target: linkEndpointId(l.target),
      })),
    );
    sim.force(
      "collision",
      forceCollide<SimNode>().radius((d) => nodeRadius(d, degrees.get(d.id) ?? 0) + 16),
    );
  }, []);

  // ---- Setup: build simulation once ----------------------------------
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    reducedMotionRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 560;

    const nodes: SimNode[] = AGGREGATE_DATASET.nodes.map((n) => ({ ...n }));
    const links: SimLink[] = AGGREGATE_DATASET.edges.map((e) => ({
      source: e.source,
      target: e.target,
    }));
    nodesRef.current = nodes;
    linksRef.current = links;

    const simulation = forceSimulation<SimNode>(nodes)
      .force(
        "link",
        forceLink<SimNode, SimLink>(links)
          .id((d) => d.id)
          .distance(70)
          .strength(0.5),
      )
      .force("charge", forceManyBody().strength(-190))
      .force("center", forceCenter(width / 2, height / 2))
      .on("tick", scheduleRender);

    simulationRef.current = simulation;
    refreshForces();

    if (reducedMotionRef.current) {
      simulation.stop();
      for (let i = 0; i < 300; i += 1) simulation.tick();
    }
    scheduleRender();

    function handleResize() {
      if (!container) return;
      const w = container.clientWidth || width;
      const h = container.clientHeight || height;
      simulation.force("center", forceCenter(w / 2, h / 2));
    }
    window.addEventListener("resize", handleResize);

    return () => {
      simulation.stop();
      window.removeEventListener("resize", handleResize);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Setup: zoom / pan -----------------------------------------------
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const selection = d3select(svgEl);
    const zoomBehavior = d3zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.4, 3])
      .filter((event: Event) => {
        if (event.type === "wheel") return true;
        const target = event.target as Element;
        return !target.closest("[data-graph-node]");
      })
      .on("zoom", (event) => {
        setTransform(event.transform);
        setHasInteracted(true);
      });
    selection.call(zoomBehavior);
    return () => {
      selection.on(".zoom", null);
    };
  }, []);

  // ---- Node drag ---------------------------------------------------------
  const attachDragRef = useCallback(
    (el: SVGGElement | null) => {
      if (!el) return;
      if (el.dataset.dragAttached === "true") return;
      el.dataset.dragAttached = "true";
      const dragBehavior = d3drag<SVGGElement, unknown>()
        .on("start", (event) => {
          const id = el.dataset.id!;
          const node = nodesRef.current.find((n) => n.id === id);
          if (!node) return;
          if (!event.active) simulationRef.current?.alphaTarget(0.15).restart();
          node.fx = node.x;
          node.fy = node.y;
          setHasInteracted(true);
        })
        .on("drag", (event) => {
          const id = el.dataset.id!;
          const node = nodesRef.current.find((n) => n.id === id);
          if (!node) return;
          node.fx = event.x;
          node.fy = event.y;
          scheduleRender();
        })
        .on("end", (event) => {
          const id = el.dataset.id!;
          const node = nodesRef.current.find((n) => n.id === id);
          if (!node) return;
          if (!event.active) simulationRef.current?.alphaTarget(0);
          node.fx = null;
          node.fy = null;
        });
      d3select(el).call(dragBehavior);
    },
    [scheduleRender],
  );

  const expandNode = useCallback(
    (nodeId: string) => {
      if (expandedIds.has(nodeId)) return;
      const expansion = EXPANSIONS[nodeId];
      if (!expansion) return;

      const existingIds = new Set(nodesRef.current.map((n) => n.id));
      const parent = nodesRef.current.find((n) => n.id === nodeId);
      const newNodes: SimNode[] = expansion.nodes
        .filter((n) => !existingIds.has(n.id))
        .map((n) => ({
          ...n,
          x: (parent?.x ?? 0) + (Math.random() - 0.5) * 12,
          y: (parent?.y ?? 0) + (Math.random() - 0.5) * 12,
        }));
      nodesRef.current = [...nodesRef.current, ...newNodes];

      const existingLinkKeys = new Set(
        linksRef.current.map((l) => `${linkEndpointId(l.source)}->${linkEndpointId(l.target)}`),
      );
      const newLinks: SimLink[] = expansion.edges
        .filter((e) => !existingLinkKeys.has(`${e.source}->${e.target}`))
        .map((e) => ({ source: e.source, target: e.target }));
      linksRef.current = [...linksRef.current, ...newLinks];

      setExpandedIds((prev) => new Set(prev).add(nodeId));

      const sim = simulationRef.current;
      if (!sim) return;
      sim.nodes(nodesRef.current);
      (sim.force("link") as ForceLink<SimNode, SimLink>).links(linksRef.current);
      refreshForces();

      if (reducedMotionRef.current) {
        sim.alpha(1).stop();
        for (let i = 0; i < 300; i += 1) sim.tick();
      } else {
        sim.alpha(0.4).restart();
      }
      scheduleRender();
    },
    [expandedIds, refreshForces, scheduleRender],
  );

  const handleNodeClick = useCallback(
    (node: SimNode) => {
      setHasInteracted(true);
      setSelectedId(node.id);
      if (node.aggregate) expandNode(node.id);
    },
    [expandNode],
  );

  const degrees = useMemo(
    () =>
      computeDegrees(
        linksSnapshot.map((l) => ({
          source: linkEndpointId(l.source),
          target: linkEndpointId(l.target),
        })),
      ),
    [linksSnapshot],
  );

  const visibleIds = useMemo(() => {
    const ids = new Set<string>();
    for (const n of nodesSnapshot) {
      if (filter === "all") ids.add(n.id);
      else if (filter === "agents") {
        if (n.isAgent) ids.add(n.id);
      } else if (n.isAgent || n.group === filter) {
        ids.add(n.id);
      }
    }
    return ids;
  }, [filter, nodesSnapshot]);

  const visibleNodes = useMemo(
    () => nodesSnapshot.filter((n) => visibleIds.has(n.id)),
    [nodesSnapshot, visibleIds],
  );
  const visibleLinks = useMemo(
    () =>
      linksSnapshot.filter(
        (l) => visibleIds.has(linkEndpointId(l.source)) && visibleIds.has(linkEndpointId(l.target)),
      ),
    [linksSnapshot, visibleIds],
  );

  const focusId = selectedId ?? hoveredId;
  const focusNeighbors = useMemo(() => {
    if (!focusId) return null;
    const set = new Set<string>([focusId]);
    for (const l of linksSnapshot) {
      const s = linkEndpointId(l.source);
      const t = linkEndpointId(l.target);
      if (s === focusId) set.add(t);
      if (t === focusId) set.add(s);
    }
    return set;
  }, [focusId, linksSnapshot]);

  const selectedNode = selectedId ? (nodesSnapshot.find((n) => n.id === selectedId) ?? null) : null;
  const selectedConnections = useMemo(() => {
    if (!selectedNode) return [];
    const ids = new Set<string>();
    for (const l of linksSnapshot) {
      const s = linkEndpointId(l.source);
      const t = linkEndpointId(l.target);
      if (s === selectedNode.id) ids.add(t);
      if (t === selectedNode.id) ids.add(s);
    }
    return Array.from(ids)
      .map((id) => nodesSnapshot.find((n) => n.id === id))
      .filter((n): n is SimNode => !!n)
      .map((n) => ({ id: n.id, label: n.label }));
  }, [selectedNode, linksSnapshot, nodesSnapshot]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        <FilterChip label="All" active={filter === "all"} onClick={() => setFilter("all")} />
        <FilterChip label="Agents" active={filter === "agents"} onClick={() => setFilter("agents")} />
        {MODULE_GROUPS.map((g) => (
          <FilterChip key={g} label={GROUP_LABEL[g]} active={filter === g} onClick={() => setFilter(g)} />
        ))}
      </div>

      <div
        ref={containerRef}
        className="relative h-[560px] w-full overflow-hidden border border-rule bg-paper-raised"
      >
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          role="img"
          aria-label="Force-directed graph of agents and documents"
          onClick={(e) => {
            if (e.target === svgRef.current) setSelectedId(null);
          }}
        >
          <g transform={transform.toString()}>
            <g>
              {visibleLinks.map((l, i) => {
                const s = typeof l.source === "string" ? undefined : l.source;
                const t = typeof l.target === "string" ? undefined : l.target;
                if (!s || !t || s.x == null || t.x == null) return null;
                const sId = linkEndpointId(l.source);
                const tId = linkEndpointId(l.target);
                const connected = focusId != null && (sId === focusId || tId === focusId);
                const dimmed = focusId != null && !connected;
                return (
                  <line
                    key={`${sId}-${tId}-${i}`}
                    x1={s.x}
                    y1={s.y}
                    x2={t.x}
                    y2={t.y}
                    stroke={connected ? "var(--green)" : "var(--rule)"}
                    strokeWidth={connected ? 1.25 : 1}
                    opacity={dimmed ? 0.12 : 1}
                  />
                );
              })}
            </g>
            <g>
              {visibleNodes.map((node) => {
                if (node.x == null || node.y == null) return null;
                const degree = degrees.get(node.id) ?? 0;
                const radius = nodeRadius(node, degree);
                const dimmed = !!focusId && !focusNeighbors?.has(node.id) && !node.isAgent;
                const isFocused = focusId === node.id;
                const isNeighbor = !!focusId && focusNeighbors?.has(node.id) && !isFocused;
                return (
                  <g
                    key={node.id}
                    ref={attachDragRef}
                    data-graph-node
                    data-id={node.id}
                    transform={`translate(${node.x},${node.y})`}
                    tabIndex={0}
                    role="button"
                    aria-label={`${node.label}, ${node.type}${node.aggregate ? ", expandable" : ""}`}
                    onMouseEnter={() => setHoveredId(node.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onFocus={() => setHoveredId(node.id)}
                    onBlur={() => setHoveredId(null)}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleNodeClick(node);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleNodeClick(node);
                      }
                    }}
                    className="cursor-pointer outline-none"
                    style={{ opacity: dimmed ? 0.12 : 1 }}
                  >
                    <circle
                      r={radius}
                      fill={GROUP_COLOR[node.group]}
                      stroke={isFocused ? "var(--green)" : isNeighbor ? "var(--green)" : "none"}
                      strokeWidth={isFocused ? 2.5 : isNeighbor ? 1.5 : 0}
                    />
                    <text
                      y={radius + 11}
                      textAnchor="middle"
                      fontSize={10}
                      fontFamily="var(--font-sans)"
                      fill="var(--ink)"
                      className="select-none"
                    >
                      {node.label}
                    </text>
                  </g>
                );
              })}
            </g>
          </g>
        </svg>

        {!hasInteracted && <GraphHint />}
        <GraphLegend />
        {selectedNode && (
          <GraphDetailPanel
            node={selectedNode}
            connections={selectedConnections}
            onSelectConnection={(id) => {
              setSelectedId(id);
              const target = nodesRef.current.find((n) => n.id === id);
              if (target?.aggregate) expandNode(id);
            }}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>
    </div>
  );
}
