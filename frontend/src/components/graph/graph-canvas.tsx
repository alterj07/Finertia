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
import { cn } from "@/lib/utils";
import { useCopilotStore } from "@/store/copilot-store";
import type { GraphGroup, GraphView } from "@/lib/types";
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

export interface RunInfo {
  agent: string;
  token: number;
}

// Whole-word mentions of a category (rather than one specific node) — the
// chatbot saying "the reconciliation" or "AP/AR" should still zoom the graph
// to that neighbourhood, not just exact node ids.
const GROUP_KEYWORDS: [RegExp, GraphGroup][] = [
  [/\breconciliations?\b/i, "reconciliation"],
  [/\bpayables?\b|\bAP\/AR\b/i, "payables"],
  [/\breceivables?\b/i, "receivables"],
  [/\bclose\b|\bclosing\b/i, "close"],
  [/\bforecasts?\b/i, "forecast"],
  [/\baudits?\b/i, "audit"],
  [/\bagents?\b/i, "agent"],
];

// SVG labels are capped at 24 chars; the full label stays on the node for
// the <title> tooltip, the detail panel and chat matching.
function shortLabel(label: string): string {
  return label.length > 24 ? `${label.slice(0, 23)}…` : label;
}

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
export function GraphCanvas({
  reloadToken = 0,
  runInfo = null,
}: {
  reloadToken?: number;
  runInfo?: RunInfo | null;
}) {
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
  const draggingRef = useRef(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity);
  const zoomRef = useRef<ReturnType<typeof d3zoom<SVGSVGElement, unknown>> | null>(null);
  const transformRef = useRef<ZoomTransform>(zoomIdentity);
  const [view, setView] = useState<GraphView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const expansionsRef = useRef<GraphView["expansions"]>({});
  // What the last reload added: painted gold so an agent run is easy to see.
  const [fresh, setFresh] = useState<{ nodes: Set<string>; links: Set<string>; touched: Set<string> }>(
    { nodes: new Set(), links: new Set(), touched: new Set() },
  );
  // Bottom-right status line — confirms a run actually happened, even when
  // it produced no new nodes (the data was already up to date).
  const [notice, setNotice] = useState<{ text: string; tone: "gold" | "neutral" } | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A whole category the chatbot just mentioned (no specific node) — dims
  // everything else briefly so the relevant cluster stands out.
  const [spotlightIds, setSpotlightIds] = useState<Set<string> | null>(null);
  const spotlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showNotice(text: string, tone: "gold" | "neutral") {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    setNotice({ text, tone });
    if (tone === "neutral") {
      noticeTimerRef.current = setTimeout(() => setNotice(null), 5000);
    }
  }

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
      if (spotlightTimerRef.current) clearTimeout(spotlightTimerRef.current);
    };
  }, []);

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

        const isRunTriggered = runInfo?.token === reloadToken;
        const agentLabel = isRunTriggered ? runInfo!.agent : null;

        if (newNodes.length === 0 && newLinks.length === 0) {
          if (agentLabel) {
            showNotice(`${agentLabel}: run complete — already up to date, no new findings`, "neutral");
          }
          return;
        }

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
        const potentialIds = new Set([...existing.keys(), ...added.map((n) => n.id)]);
        const addedLinks: SimLink[] = newLinks
          .filter((e) => potentialIds.has(e.source) && potentialIds.has(e.target))
          .map((e) => ({ source: e.source, target: e.target, rel: e.rel }));

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
        showNotice(
          agentLabel
            ? `${agentLabel}: ${added.length} new node${added.length === 1 ? "" : "s"}, ${addedLinks.length} new link${addedLinks.length === 1 ? "" : "s"}`
            : `New since last run: ${added.length} nodes, ${addedLinks.length} links`,
          "gold",
        );

        // Reveal new nodes one at a time (and their links as both ends
        // become available) instead of dropping the whole batch in at once —
        // reduced motion still gets the instant, fully-settled layout.
        if (reducedMotionRef.current) {
          nodesRef.current = [...nodesRef.current, ...added];
          linksRef.current = [...linksRef.current, ...addedLinks];
          const sim = simulationRef.current;
          if (sim) {
            sim.nodes(nodesRef.current);
            (sim.force("link") as ForceLink<SimNode, SimLink>).links(linksRef.current);
            refreshForces();
            sim.alpha(1).stop();
            for (let i = 0; i < 300; i += 1) sim.tick();
          }
          scheduleRender();
          return;
        }

        const knownIds = new Set(nodesRef.current.map((n) => n.id));
        const interval = Math.max(60, Math.min(220, Math.round(4000 / added.length)));
        let i = 0;
        const revealNext = () => {
          if (cancelled) return;
          if (i >= added.length) return;
          const node = added[i];
          i += 1;
          nodesRef.current = [...nodesRef.current, node];
          knownIds.add(node.id);

          const ready = addedLinks.filter(
            (l) =>
              !linksRef.current.includes(l) &&
              knownIds.has(linkEndpointId(l.source)) &&
              knownIds.has(linkEndpointId(l.target)),
          );
          if (ready.length) linksRef.current = [...linksRef.current, ...ready];

          const sim = simulationRef.current;
          if (sim) {
            sim.nodes(nodesRef.current);
            (sim.force("link") as ForceLink<SimNode, SimLink>).links(linksRef.current);
            refreshForces();
            sim.alpha(Math.max(sim.alpha(), 0.22)).restart();
          }
          scheduleRender();

          if (i < added.length) setTimeout(revealNext, interval);
        };
        revealNext();
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
      rel: e.rel,
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
      .force("charge", forceManyBody().strength(-110))
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
        transformRef.current = event.transform;
        setTransform(event.transform);
        setHasInteracted(true);
      });
    zoomRef.current = zoomBehavior;
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
          draggingRef.current = true;
          if (svgRef.current) svgRef.current.dataset.dragging = "true";
          setHoveredId(id);
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
          draggingRef.current = false;
          if (svgRef.current) delete svgRef.current.dataset.dragging;
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
        .map((e) => ({ source: e.source, target: e.target, rel: e.rel }));
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

  // Reveal a node: select it; if it lives inside an aggregate's expansion,
  // expand the parent first so it becomes visible. Returns whether id is known.
  const revealNode = useCallback(
    (id: string): boolean => {
      if (!view) return false;
      if (view.nodes.some((n) => n.id === id)) {
        setSelectedId(id);
        setHasInteracted(true);
        return true;
      }
      for (const [parentId, expansion] of Object.entries(view.expansions)) {
        if (expansion.nodes.some((n) => n.id === id)) {
          setSelectedId(id);
          setHasInteracted(true);
          expandNode(parentId);
          return true;
        }
      }
      return false;
    },
    [view, expandNode],
  );

  // Deep-link (?node=<id>): reveal once per id, then zoom so the node and its
  // connections fill the viewport.
  const deepLinkedRef = useRef<string | null>(null);
  const handleDeepLink = useCallback(
    (id: string) => {
      if (deepLinkedRef.current === id) return;
      if (revealNode(id)) {
        deepLinkedRef.current = id;
        zoomToNodes([id]);
      }
    },
    [revealNode],
  );

  // Smoothly zoom/pan so ids[0] plus its neighbours fill the viewport. Targets
  // may appear a few sim ticks after expansion, so positions are polled.
  const zoomAnimRef = useRef(0);
  function zoomToNodes(ids: string[]) {
    const zoomBehavior = zoomRef.current;
    const svgEl = svgRef.current;
    const container = containerRef.current;
    if (!zoomBehavior || !svgEl || !container) return;

    const targets = new Set(ids);
    for (const l of linksRef.current) {
      const s = linkEndpointId(l.source);
      const t = linkEndpointId(l.target);
      if (s === ids[0]) targets.add(t);
      if (t === ids[0]) targets.add(s);
    }

    const start = performance.now();
    const poll = () => {
      const pts = [...targets]
        .map((id) => nodesRef.current.find((n) => n.id === id))
        .filter(
          (n): n is SimNode =>
            !!n && Number.isFinite(n.x) && Number.isFinite(n.y),
        );
      const knownCount = [...targets].filter((id) =>
        nodesRef.current.some((n) => n.id === id),
      ).length;
      if (pts.length < knownCount && performance.now() - start < 1500) {
        requestAnimationFrame(poll);
        return;
      }
      if (!pts.length) return;
      const xs = pts.map((n) => n.x!);
      const ys = pts.map((n) => n.y!);
      const rect = container.getBoundingClientRect();
      const w = rect.width || 800;
      const h = rect.height || 560;
      const bw = Math.max(...xs) - Math.min(...xs) + 160;
      const bh = Math.max(...ys) - Math.min(...ys) + 160;
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
      const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
      const single = pts.length === 1 || (bw === 160 && bh === 160);
      const k = single ? 1.8 : Math.min(Math.max(Math.min(w / bw, h / bh), 0.5), 2.2);
      const target = zoomIdentity.translate(w / 2 - k * cx, h / 2 - k * cy).scale(k);

      const animId = ++zoomAnimRef.current;
      const from = transformRef.current;
      const t0 = performance.now();
      const step = (now: number) => {
        if (animId !== zoomAnimRef.current) return;
        const p = Math.min((now - t0) / 700, 1);
        const e = 1 - Math.pow(1 - p, 3);
        const tInterp = zoomIdentity
          .translate(from.x + (target.x - from.x) * e, from.y + (target.y - from.y) * e)
          .scale(from.k + (target.k - from.k) * e);
        zoomBehavior.transform(d3select(svgEl), tInterp);
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    poll();
  }

  // Copilot thread → graph focus: replies cite node ids, user messages may
  // mention ids or labels; select the node and zoom to it.
  const chatMessages = useCopilotStore((s) => s.messages);
  // Sentinel "" = not yet initialised: first run adopts the tail of the
  // existing thread so opening the page doesn't react to history.
  const lastSeenMsgRef = useRef<string>("");
  const chatLookup = useMemo(() => {
    if (!view) return [];
    const all = [
      ...view.nodes,
      ...Object.values(view.expansions).flatMap((e) => e.nodes),
    ];
    const seen = new Set<string>();
    return all
      .filter((n) => (seen.has(n.id) ? false : (seen.add(n.id), true)))
      .map((n) => ({ id: n.id, label: n.label, ref: n.ref, isAgent: !!n.isAgent }));
  }, [view]);

  useEffect(() => {
    const last = chatMessages[chatMessages.length - 1];
    if (!view) return;
    if (lastSeenMsgRef.current === "") {
      lastSeenMsgRef.current = last?.id ?? "-";
      return;
    }
    if (!last || last.id === lastSeenMsgRef.current) return;
    lastSeenMsgRef.current = last.id;

    function matchIdsInText(text: string): string[] {
      const scored: { id: string; at: number; exact: boolean }[] = [];
      for (const n of chatLookup) {
        const esc = n.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const m = new RegExp(`\\b${esc}\\b`, "i").exec(text);
        const mref = n.ref
          ? new RegExp(`\\b${n.ref.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").exec(text)
          : null;
        if (m || mref) {
          scored.push({ id: n.id, at: (m ?? mref)!.index, exact: true });
          continue;
        }
        if (n.isAgent) continue;
        // Match on any word of the label (>=4 chars) so "Helios" finds
        // "Helios Medical Systems"; whole-word boundaries only.
        for (const word of n.label.split(/[^\p{L}\p{N}]+/u)) {
          if (word.length < 4) continue;
          const escl = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const ml = new RegExp(`\\b${escl}\\b`, "i").exec(text);
          if (ml) {
            scored.push({ id: n.id, at: ml.index, exact: false });
            break;
          }
        }
      }
      scored.sort((a, b) => Number(b.exact) - Number(a.exact) || a.at - b.at);
      return [...new Set(scored.map((s) => s.id))];
    }

    const ids =
      last.role === "agent"
        ? [...new Set([...(last.citations ?? []).map((c) => c.label), ...matchIdsInText(last.text)])]
        : matchIdsInText(last.text);

    const known = ids.filter((id) => view.nodes.some((n) => n.id === id)
      || Object.values(view.expansions).some((e) => e.nodes.some((n) => n.id === id)));

    if (known.length) {
      // Replacing the spotlight outright — safe to drop any pending clear.
      if (spotlightTimerRef.current) clearTimeout(spotlightTimerRef.current);
      const raf = requestAnimationFrame(() => {
        setSpotlightIds(null);
        revealNode(known[0]);
        zoomToNodes(known);
      });
      return () => cancelAnimationFrame(raf);
    }

    // No specific node — but a whole category ("reconciliation", "the
    // agents", …) mentioned anywhere in the message still zooms & dims the
    // rest, so a category-level answer still moves the graph. An unrelated
    // message in between (e.g. the reply that follows) must NOT cancel an
    // already-scheduled clear without rescheduling one, or the spotlight
    // would stay stuck forever.
    const matchedGroup = GROUP_KEYWORDS.find(([pattern]) => pattern.test(last.text))?.[1];
    if (!matchedGroup) return;
    const groupIds = view.nodes.filter((n) => n.group === matchedGroup).map((n) => n.id);
    if (!groupIds.length) return;
    if (spotlightTimerRef.current) clearTimeout(spotlightTimerRef.current);
    const raf = requestAnimationFrame(() => {
      setSpotlightIds(new Set(groupIds));
      zoomToNodes(groupIds);
    });
    spotlightTimerRef.current = setTimeout(() => setSpotlightIds(null), 5000);
    return () => cancelAnimationFrame(raf);
  }, [chatMessages, view, chatLookup, revealNode]);

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

  // A category the chatbot just mentioned — hover/select always wins over it.
  const spotlightActive = !focusId && !!spotlightIds && spotlightIds.size > 0;

  const selectedNode = selectedId ? (nodesSnapshot.find((n) => n.id === selectedId) ?? null) : null;
  const selectedConnections = useMemo(() => {
    if (!selectedNode) return [];
    const rels = new Map<string, string | undefined>();
    for (const l of linksSnapshot) {
      const s = linkEndpointId(l.source);
      const t = linkEndpointId(l.target);
      if (s === selectedNode.id && !rels.has(t)) rels.set(t, l.rel);
      if (t === selectedNode.id && !rels.has(s)) rels.set(s, l.rel);
    }
    const out: { id: string; label: string; rel?: string }[] = [];
    for (const [id, rel] of rels) {
      const n = nodesSnapshot.find((x) => x.id === id);
      if (n) out.push({ id: n.id, label: n.label, rel });
    }
    return out;
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
                const spotlightConnected = spotlightActive && (spotlightIds!.has(sId) || spotlightIds!.has(tId));
                const dimmed = focusId != null ? !connected : spotlightActive ? !spotlightConnected : false;
                const isFresh = fresh.links.has(`${sId}->${tId}`) || fresh.links.has(`${tId}->${sId}`);
                return (
                  <line
                    key={`${sId}-${tId}-${i}`}
                    x1={s.x}
                    y1={s.y}
                    x2={t.x}
                    y2={t.y}
                    className="graph-link"
                    data-focus={connected ? "connected" : dimmed ? "dim" : undefined}
                    data-fresh={isFresh || undefined}
                  />
                );
              })}
            </g>
            <g>
              {visibleNodes.map((node) => {
                if (node.x == null || node.y == null) return null;
                const degree = degrees.get(node.id) ?? 0;
                const radius = nodeRadius(node, degree);
                const isSpotlighted = spotlightActive && spotlightIds!.has(node.id);
                const dimmed = focusId
                  ? !focusNeighbors?.has(node.id) && !node.isAgent
                  : spotlightActive && !isSpotlighted;
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
                    onMouseEnter={() => {
                      if (!draggingRef.current) setHoveredId(node.id);
                    }}
                    onMouseLeave={() => {
                      if (!draggingRef.current) setHoveredId(null);
                    }}
                    onFocus={() => {
                      if (!draggingRef.current) setHoveredId(node.id);
                    }}
                    onBlur={() => {
                      if (!draggingRef.current) setHoveredId(null);
                    }}
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
                    className="graph-node cursor-pointer select-none outline-none"
                    data-focus={
                      isFocused ? "focused" : isNeighbor ? "neighbor" : isSpotlighted ? "spotlight" : dimmed ? "dim" : undefined
                    }
                    data-touched={isTouched || undefined}
                  >
                    <title>{node.label}</title>
                    {isFresh && (
                      <circle r={radius + 6} fill="var(--gold)" opacity={0.25}>
                        <animate attributeName="r" values={`${radius + 4};${radius + 9};${radius + 4}`} dur="1.6s" repeatCount="indefinite" />
                      </circle>
                    )}
                    {isSpotlighted && !isFresh && (
                      <circle r={radius + 6} fill="var(--blue)" opacity={0.25}>
                        <animate attributeName="r" values={`${radius + 4};${radius + 9};${radius + 4}`} dur="1.6s" repeatCount="indefinite" />
                      </circle>
                    )}
                    <circle
                      r={radius}
                      fill={isFresh ? "var(--gold)" : GROUP_COLOR[node.group]}
                      className="graph-node-core"
                    />
                    <text
                      y={radius + 11}
                      textAnchor="middle"
                      fontSize={10}
                      fontFamily="var(--font-sans)"
                      fill="var(--ink)"
                      className="select-none"
                    >
                      {shortLabel(node.label)}
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
        {notice && (
          <div
            className={cn(
              "absolute right-3 bottom-3 flex items-center gap-2 border bg-paper-raised/95 px-2.5 py-1.5 text-xs backdrop-blur-sm",
              notice.tone === "gold" ? "border-gold/40" : "border-rule",
            )}
          >
            {notice.tone === "gold" && <span className="h-2 w-2 rounded-full bg-gold" aria-hidden />}
            <span className="text-ink">{notice.text}</span>
            <button
              type="button"
              onClick={() => {
                setNotice(null);
                setFresh({ nodes: new Set(), links: new Set(), touched: new Set() });
              }}
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
