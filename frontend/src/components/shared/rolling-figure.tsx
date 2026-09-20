"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const DIGIT = /[0-9]/;

/** Slot-machine roll for money/number strings: digits tumble and settle
 * left-to-right over `duration` ms; punctuation stays fixed. Strings with no
 * digits ("N/A") render untouched. Honours prefers-reduced-motion. */
export function RollingFigure({
  value,
  className,
  duration = 900,
}: {
  value: string;
  className?: string;
  duration?: number;
}) {
  const [frame, setFrame] = useState<{ v: string; text: string } | null>(null);
  const display = frame !== null && frame.v === value ? frame.text : value;

  useEffect(() => {
    const digits = value.match(/[0-9]/g)?.length ?? 0;
    if (
      digits === 0 ||
      typeof window === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    let raf = 0;
    let lastJitter = 0;
    let rand = value.split("").map(() => "0");
    const start = performance.now();
    let seen = 0;
    const settles: number[] = [];
    for (const ch of value) {
      if (DIGIT.test(ch)) {
        settles.push(duration * (0.35 + (0.65 * seen) / Math.max(digits - 1, 1)));
        seen += 1;
      } else {
        settles.push(0);
      }
    }

    const tick = (now: number) => {
      const t = now - start;
      if (t >= duration) {
        setFrame(null);
        return;
      }
      if (now - lastJitter >= 50) {
        lastJitter = now;
        rand = rand.map(() => String(Math.floor(Math.random() * 10)));
      }
      let out = "";
      for (let i = 0; i < value.length; i++) {
        const ch = value[i];
        out += !DIGIT.test(ch) || t >= settles[i] ? ch : rand[i];
      }
      setFrame({ v: value, text: out });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return (
    <span className={cn("tabular-nums", className)} aria-label={value}>
      <span aria-hidden>{display}</span>
    </span>
  );
}
