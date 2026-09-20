"""Shared helpers for the dashboard builders: formatting, finding lookups and
the open-subledger-items helper (same logic as the lab's `_open_items`)."""

from collections import defaultdict
from datetime import date
from typing import Any

from app.data.lake import DataLake
from app.memory.graph import MemoryGraph
from app.memory.models import Finding

AS_OF = "2026-03-31"  # the dataset's period end — not today's date

_SEVERITY_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}
_TAG = {"critical": "flag", "high": "flag", "medium": "review", "low": "auto", "info": "auto"}


def money(v: float | int | None) -> str:
    if v is None:
        return "N/A"
    sign = "-" if v < 0 else ""
    return f"{sign}${abs(v):,.2f}"


def tag(severity: str) -> str:
    return _TAG.get(severity, "auto")


def findings_by_code(memory: MemoryGraph, *codes: str) -> list[Finding]:
    wanted = set(codes)
    return [f for f in memory.findings if f.code in wanted]


def finding(memory: MemoryGraph, code: str) -> Finding | None:
    return next((f for f in memory.findings if f.code == code), None)


def sorted_findings(memory: MemoryGraph, *, exclude_info: bool = False) -> list[Finding]:
    fs = [f for f in memory.findings if f.code != "ORCHESTRATION_RUN"]
    if exclude_info:
        fs = [f for f in fs if f.severity != "info"]
    return sorted(
        fs, key=lambda f: (_SEVERITY_ORDER.get(f.severity, 9), -(f.amount or 0))
    )


def open_items(lake: DataLake, account: str, as_of: str) -> dict[str, dict[str, Any]]:
    """Net GL balance per doc_ref on a subledger account (lab `_open_items`)."""
    items: dict[str, dict[str, Any]] = defaultdict(lambda: {"bal": 0.0, "lines": []})
    for line in lake.gl_lines(account, end=as_of):
        if not line.doc_ref_norm:
            continue
        it = items[line.doc_ref_norm]
        it["bal"] = round(it["bal"] + line.amount, 2)
        it["lines"].append(line)
    return items


def open_ar_total(lake: DataLake, as_of: str = AS_OF) -> float:
    return round(
        sum(i["bal"] for i in open_items(lake, "1200", as_of).values() if i["bal"] > 0),
        2,
    )


def open_ap_total(lake: DataLake, as_of: str = AS_OF) -> float:
    return round(
        -sum(i["bal"] for i in open_items(lake, "2000", as_of).values() if i["bal"] < 0),
        2,
    )


def evidence_row(f: Finding) -> dict[str, Any]:
    """LedgerRowData fields shared by finding-derived rows."""
    node_id = f"finding:{f.code}:{f.key}"
    return {
        "prose": [f.detail] if f.detail else [f.title],
        "evidence": f.evidence + f.entities,
        "actions": [
            {"label": "View in graph", "kind": "ghost", "href": f"/graph?node={node_id}"}
        ],
    }


def finding_row(f: Finding, *, secondary: str | None = None) -> dict[str, Any]:
    return {
        "id": f"finding:{f.code}:{f.key}",
        "tag": tag(f.severity),
        "primary": f.title,
        "secondary": secondary or f"{f.agent} · {f.code}",
        "amount": money(f.amount),
        "href": f"/graph?node=finding:{f.code}:{f.key}",
        "detail": evidence_row(f),
    }


def kpi(label: str, value: float | str | None, fmt: bool = True) -> dict[str, Any]:
    if isinstance(value, str):
        v = value
    elif value is None:
        v = "N/A"
    else:
        v = money(value) if fmt else str(value)
    return {"label": label, "value": v, "delta": "N/A"}


def needs_run(memory: MemoryGraph, *codes: str) -> bool:
    """True when none of the findings this screen depends on exist yet."""
    return all(finding(memory, c) is None for c in codes)


def _d(s: Any) -> date | None:
    if not s:
        return None
    return s if isinstance(s, date) else date.fromisoformat(str(s)[:10])
