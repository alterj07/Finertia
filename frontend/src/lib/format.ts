export function formatUsd(value: number, opts: { signed?: boolean } = {}): string {
  const abs = Math.abs(value);
  const formatted = abs.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: abs >= 1000 ? 0 : 2,
  });
  if (value < 0) return `(${formatted})`;
  if (opts.signed && value > 0) return `+${formatted}`;
  return formatted;
}

export function formatCompactUsd(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

export function formatPct(value: number, opts: { signed?: boolean } = {}): string {
  const sign = opts.signed && value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}
