"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
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
import { fetchGraphView } from "@/lib/api";
import type { GraphView } from "@/lib/types";
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

function DeepLink({ onNode }: { onNode: (id: string) => void }) {
  const params = useSearchParams();
  const node = params.get("node");
  useEffect(() => {
    if (node) onNode(node);
  }, [node, onNode]);
  return null;
}

// The simulation's canonical, mutable node/link arrays live in refs — d3
// mutates node.x/y/fx/fy in place every tick, and that must not go through
// React state (too frequent, and the identity of each node object must stay
// stable for d3). `nodesSnapshot`/`linksSnapshot` below are the render-facing
// copies, refreshed on a rAF-throttled cadence from the tick handler — this
// is what JSX actually reads, so no ref is ever read during render.
export function GraphCanvas({ reloadToken = 0 }: { reloadToken?: number }) {
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
  const [view, setView] = useState<GraphView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const expansionsRef = useRef<GraphView["expansions"]>({});
  // What the last reload added: painted gold so an agent run is easy to see.
  const [fresh, setFresh] = useState<{ nodes: Set<string>; links: Set<string>; touched: Set<string> }>(
    { nodes: new Set(), links: new Set(), touched: new Set() },
  );

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

  // ---- Load the live memory graph (again whenever reloadToken changes) ----
  // The first load builds the simulation. Later loads merge: existing nodes keep
  // their positions, new nodes spawn next to what they connect to, and the
  // additions are highlighted.
  useEffect(() => {
    let cancelled = false;
    fetchGraphView()
      .then((data) => {
        if (cancelled) return;
        expansionsRef.current = data.expansions;
        if (nodesRef.current.length === 0) {
          setView(data);
          return;
        }
        const existing = new Map(nodesRef.current.map((n) => [n.id, n]));
        const linkKey = (a: string, b: string) => `${a}->${b}`;
        const existingLinks = new Set(
          linksRef.current.map((l) => linkKey(linkEndpointId(l.source), linkEndpointId(l.target))),
        );
        const newLinks = data.edges.filter(
          (e) => !existingLinks.has(linkKey(e.source, e.target)) && !existingLinks.has(linkKey(e.target, e.source)),
        );
        const newNodes = data.nodes.filter((n) => !existing.has(n.id));
        if (newNodes.length === 0 && newLinks.length === 0) return;

        const added: SimNode[] = newNodes.map((n) => {
          const anchorId = newLinks.find((e) => e.source === n.id || e.target === n.id);
          const other = anchorId ? (anchorId.source === n.id ? anchorId.target : anchorId.source) : null;
          const anchor = other ? existing.get(other) : undefined;
          return {
            ...n,
            x: (anchor?.x ?? 0) + (Math.random() - 0.5) * 40,
            y: (anchor?.y ?? 0) + (Math.random() - 0.5) * 40,
          };
        });
        nodesRef.current = [...nodesRef.current, ...added];
        const known = new Set(nodesRef.current.map((n) => n.id));
        const addedLinks: SimLink[] = newLinks
          .filter((e) => known.has(e.source) && known.has(e.target))
          .map((e) => ({ source: e.source, target: e.target }));
        linksRef.current = [...linksRef.current, ...addedLinks];

        const freshNodes = new Set(added.map((n) => n.id));
        const touched = new Set<string>();
        for (const e of newLinks) {
          if (!freshNodes.has(e.source)) touched.add(e.source);
          if (!freshNodes.has(e.target)) touched.add(e.target);
        }
        setFresh({
          nodes: freshNodes,
          links: new Set(newLinks.map((e) => linkKey(e.source, e.target))),
          touched,
        });

        const sim = simulationRef.current;
        if (sim) {
          sim.nodes(nodesRef.current);
          (sim.force("link") as ForceLink<SimNode, SimLink>).links(linksRef.current);
          refreshForces();
          if (reducedMotionRef.current) {
            sim.alpha(1).stop();
            for (let i = 0; i < 300; i += 1) sim.tick();
          } else {
            sim.alpha(0.5).restart();
          }
        }
        scheduleRender();
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Failed to load graph");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadToken]);

  // ---- Setup: build simulation once the data is in --------------------
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !view) return;
    reducedMotionRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 560;

    const nodes: SimNode[] = view.nodes.map((n) => ({ ...n }));
    const links: SimLink[] = view.edges.map((e) => ({
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
  }, [view]);

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
      const expansion = expansionsRef.current[nodeId];
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

  // Deep-link (?node=<id>): select a cited node; if it lives inside an
  // aggregate's expansion, expand the parent first so it becomes visible.
  const deepLinkedRef = useRef<string | null>(null);
  const handleDeepLink = useCallback(
    (id: string) => {
      if (deepLinkedRef.current === id) return;
      if (!view) return;
      if (view.nodes.some((n) => n.id === id)) {
        deepLinkedRef.current = id;
        setSelectedId(id);
        setHasInteracted(true);
        return;
      }
      for (const [parentId, expansion] of Object.entries(view.expansions)) {
        if (expansion.nodes.some((n) => n.id === id)) {
          deepLinkedRef.current = id;
          setSelectedId(id);
          setHasInteracted(true);
          expandNode(parentId);
          return;
        }
      }
    },
    [view, expandNode],
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
                const isFresh = fresh.links.has(`${sId}->${tId}`) || fresh.links.has(`${tId}->${sId}`);
                return (
                  <line
                    key={`${sId}-${tId}-${i}`}
                    x1={s.x}
                    y1={s.y}
                    x2={t.x}
                    y2={t.y}
                    stroke={isFresh ? "var(--gold)" : connected ? "var(--green)" : "var(--rule)"}
                    strokeWidth={isFresh ? 2 : connected ? 1.25 : 1}
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
                const isFresh = fresh.nodes.has(node.id);
                const isTouched = fresh.touched.has(node.id);
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
                    {isFresh && (
                      <circle r={radius + 6} fill="var(--gold)" opacity={0.25}>
                        <animate attributeName="r" values={`${radius + 4};${radius + 9};${radius + 4}`} dur="1.6s" repeatCount="indefinite" />
                      </circle>
                    )}
                    <circle
                      r={radius}
                      fill={isFresh ? "var(--gold)" : GROUP_COLOR[node.group]}
                      stroke={
                        isFocused || isNeighbor ? "var(--green)" : isTouched ? "var(--gold)" : "none"
                      }
                      strokeWidth={isFocused ? 2.5 : isNeighbor ? 1.5 : isTouched ? 2 : 0}
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

        {loadError && (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-ink-soft">
            Could not load the memory graph from the backend ({loadError}). Is the API running on
            port 8000?
          </div>
        )}
        {!view && !loadError && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-ink-soft">
            Loading memory graph…
          </div>
        )}
        {view && !hasInteracted && <GraphHint />}
        <GraphLegend />
        {fresh.nodes.size + fresh.links.size > 0 && (
          <div className="absolute right-3 bottom-3 flex items-center gap-2 border border-gold/40 bg-paper-raised/95 px-2.5 py-1.5 text-xs backdrop-blur-sm">
            <span className="h-2 w-2 rounded-full bg-gold" aria-hidden />
            <span className="text-ink">
              New since last run: {fresh.nodes.size} nodes, {fresh.links.size} links
            </span>
            <button
              type="button"
              onClick={() => setFresh({ nodes: new Set(), links: new Set(), touched: new Set() })}
              className="text-ink-soft hover:text-ink"
            >
              clear
            </button>
          </div>
        )}
        <Suspense fallback={null}>
          <DeepLink onNode={handleDeepLink} />
        </Suspense>
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
