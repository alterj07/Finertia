"use client";

import React from "react";

const CITE_RE = /\[([^\[\]]+)\]/g;
const BOLD_RE = /\*\*([^*]+)\*\*|__([^_]+)__/g;

function inline(text: string, onCite?: (id: string) => void): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(CITE_RE);
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(...bold(text.slice(last, m.index), last));
    const id = m[1];
    parts.push(
      <button
        key={`${m.index}-${id}`}
        onClick={() => onCite?.(id)}
        className="text-primary bg-primary/10 hover:bg-primary/20 mx-0.5 rounded px-1 font-mono text-xs"
      >
        {id}
      </button>,
    );
    last = m.index + m[0].length;
  }
  parts.push(...bold(text.slice(last), last));
  return parts;
}

function bold(text: string, base: number): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(BOLD_RE);
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(<strong key={`${base + m.index}`}>{m[1] ?? m[2]}</strong>);
    last = m.index + m[0].length;
  }
  parts.push(text.slice(last));
  return parts;
}

export function ChatText({
  text,
  onCite,
}: {
  text: string;
  onCite?: (id: string) => void;
}) {
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];

  const flush = (key: string) => {
    if (!list.length) return;
    const items = list;
    list = [];
    blocks.push(
      <ul key={key} className="list-disc pl-4 space-y-0.5">
        {items.map((item, i) => (
          <li key={i}>{inline(item, onCite)}</li>
        ))}
      </ul>,
    );
  };

  text.split("\n").forEach((raw, i) => {
    const line = raw.replace(/^#+\s*/, "");
    const item = line.match(/^\s*(?:[-*•])\s+(.*)$/);
    if (item) {
      list.push(item[1]);
    } else {
      flush(`ul-${i}`);
      if (line.trim()) {
        blocks.push(<p key={`p-${i}`}>{inline(line.trim(), onCite)}</p>);
      }
    }
  });
  flush("ul-end");

  return <div className="text-sm leading-snug space-y-1.5">{blocks}</div>;
}
