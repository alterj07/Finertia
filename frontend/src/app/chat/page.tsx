"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import {
  ApiError,
  ChatMessage,
  ChatResponse,
  NodeDetail,
  SessionSummary,
  ToolEvent,
  getMemoryStats,
  getNode,
  getSession,
  listSessions,
  sendChat,
  MemoryStats,
} from "@/lib/api";
import { ChatText } from "@/components/shared/chat-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

function AssistantText({
  content,
  onCite,
}: {
  content: string;
  onCite: (id: string) => void;
}) {
  return <ChatText text={content} onCite={onCite} />;
}

function ToolBadges({ events }: { events: ToolEvent[] }) {
  if (!events.length) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {events.map((e, i) => (
        <Badge
          key={i}
          variant="secondary"
          title={JSON.stringify(e.arguments)}
          className="font-mono text-[10px]"
        >
          {e.name}
        </Badge>
      ))}
    </div>
  );
}

function EvidencePanel({
  citations,
  selected,
  onSelect,
}: {
  citations: string[];
  selected: NodeDetail | null;
  onSelect: (id: string) => void;
}) {
  const [stats, setStats] = useState<MemoryStats | null>(null);
  useEffect(() => {
    getMemoryStats()
      .then(setStats)
      .catch(() => setStats(null));
  }, [citations]);

  return (
    <Card className="flex min-h-0 flex-1 flex-col">
      <CardHeader>
        <CardTitle className="text-base">Evidence</CardTitle>
        {stats && (
          <p className="text-muted-foreground text-xs">
            {stats.nodes} nodes · {stats.edges} edges · {stats.findings} findings
          </p>
        )}
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
        {citations.length > 0 && (
          <>
            <p className="text-xs font-medium">Cited evidence</p>
            <div className="flex flex-wrap gap-1">
              {citations.map((c) => (
                <Badge
                  key={c}
                  variant="outline"
                  className="cursor-pointer font-mono text-[10px]"
                  onClick={() => onSelect(c)}
                >
                  {c}
                </Badge>
              ))}
            </div>
            <Separator />
          </>
        )}
        {selected ? (
          <ScrollArea className="min-h-0 flex-1">
            <p className="font-mono text-sm font-medium">{selected.node.id}</p>
            <Badge variant="secondary" className="my-1 text-[10px]">
              {selected.node.type}
            </Badge>
            <table className="mt-2 w-full text-xs">
              <tbody>
                {Object.entries(selected.node.props)
                  .filter(([, v]) => v !== null && v !== "" && String(v).length < 300)
                  .map(([k, v]) => (
                    <tr key={k} className="align-top">
                      <td className="text-muted-foreground pr-2 font-mono">{k}</td>
                      <td className="break-all">{String(v)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {selected.out.length + selected.in.length > 0 && (
              <>
                <p className="mt-3 text-xs font-medium">Links</p>
                <ul className="mt-1 space-y-0.5">
                  {[...selected.out, ...selected.in].map((e, i) => {
                    const outgoing = e.src === selected.node.id;
                    const other = outgoing ? e.dst : e.src;
                    return (
                      <li key={i} className="text-xs">
                        <span className="text-muted-foreground font-mono">
                          {outgoing ? `-${e.rel}->` : `<-${e.rel}-`}
                        </span>{" "}
                        <button
                          className="text-primary font-mono hover:underline"
                          onClick={() => onSelect(other)}
                        >
                          {other}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </ScrollArea>
        ) : (
          <p className="text-muted-foreground text-sm">
            Ask a question — evidence the assistant cites will appear here.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ChatPage() {
  const router = useRouter();
  const params = useSearchParams();
  const sessionParam = params.get("session");

  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(sessionParam);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [eventsByIdx, setEventsByIdx] = useState<Record<number, ToolEvent[]>>({});
  const [citations, setCitations] = useState<string[]>([]);
  const [selected, setSelected] = useState<NodeDetail | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const refreshSessions = useCallback(() => {
    listSessions()
      .then(setSessions)
      .catch(() => {});
  }, []);

  useEffect(refreshSessions, [refreshSessions]);

  useEffect(() => {
    if (!sessionId) return;
    getSession(sessionId)
      .then((s) => {
        setMessages(s.messages.filter((m) => m.role !== "tool"));
        setEventsByIdx({});
      })
      .catch(() => setMessages([]));
  }, [sessionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  const showEvidence = useCallback((id: string) => {
    getNode(id)
      .then(setSelected)
      .catch(() => setSelected(null));
  }, []);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setError(null);
    setBusy(true);
    setMessages((ms) => [
      ...ms,
      {
        role: "user",
        content: text,
        tool_calls: [],
        tool_call_id: null,
        name: null,
        created_at: new Date().toISOString(),
      },
    ]);
    try {
      const resp: ChatResponse = await sendChat(sessionId, text);
      setSessionId(resp.session_id);
      router.replace(`/chat?session=${resp.session_id}`);
      setMessages((ms) => [...ms, resp.message]);
      setEventsByIdx((m) => ({ ...m, [messages.length + 1]: resp.tool_events }));
      setCitations(resp.citations);
      refreshSessions();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col gap-4 p-4 md:flex-row">
      <Card className="flex min-h-[70vh] flex-1 flex-col md:w-3/5">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Finertia Assistant</CardTitle>
          <div className="flex items-center gap-2">
            <select
              className="bg-background rounded border px-2 py-1 text-sm"
              value={sessionId ?? ""}
              onChange={(e) => {
                const id = e.target.value || null;
                setSessionId(id);
                if (!id) {
                  setMessages([]);
                  setEventsByIdx({});
                  setCitations([]);
                  setSelected(null);
                }
                router.replace(id ? `/chat?session=${id}` : "/chat");
              }}
            >
              <option value="">Current chat</option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title || s.id}
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSessionId(null);
                setMessages([]);
                setEventsByIdx({});
                setCitations([]);
                setSelected(null);
                router.replace("/chat");
              }}
            >
              New chat
            </Button>
          </div>
        </CardHeader>
        <Separator />
        <ScrollArea className="min-h-0 flex-1 p-4">
          <div className="space-y-4">
            {messages.length === 0 && (
              <p className="text-muted-foreground text-sm">
                Ask about the books — e.g. &quot;Which bank credit matched three
                invoices?&quot;
              </p>
            )}
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="flex justify-end">
                  <div className="bg-primary text-primary-foreground max-w-[80%] rounded-lg px-3 py-2 text-sm">
                    {m.content}
                  </div>
                </div>
              ) : (
                <div key={i} className="flex justify-start">
                  <div className="bg-muted max-w-[85%] rounded-lg px-3 py-2">
                    {m.content && (
                      <AssistantText content={m.content} onCite={showEvidence} />
                    )}
                    <ToolBadges events={eventsByIdx[i] ?? []} />
                  </div>
                </div>
              ),
            )}
            {busy && (
              <p className="text-muted-foreground text-sm">Thinking…</p>
            )}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>
        {error && (
          <div className="px-4 pb-2">
            <Card className="border-destructive">
              <CardContent className="text-destructive p-3 text-sm">
                {error}
              </CardContent>
            </Card>
          </div>
        )}
        <Separator />
        <div className="flex items-end gap-2 p-3">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Ask about the books…"
            className="min-h-10 resize-none"
            rows={2}
          />
          <Button onClick={send} disabled={busy || !input.trim()}>
            Send
          </Button>
        </div>
      </Card>
      <div className="flex min-h-[40vh] flex-col md:w-2/5">
        <EvidencePanel
          citations={citations}
          selected={selected}
          onSelect={showEvidence}
        />
      </div>
    </main>
  );
}

export default function Page() {
  return (
    <Suspense>
      <ChatPage />
    </Suspense>
  );
}
