"""Dashboard builders: pure functions lake+memory -> the frontend's TS shapes.

Every number comes from the DataLake or the shared memory findings; anything
unsourced renders as the literal string "N/A".
"""

from collections import defaultdict
from datetime import timedelta
from typing import Any

from app.data.lake import DataLake
from app.memory.graph import MemoryGraph

from .common import (
    AS_OF,
    _d,
    finding,
    finding_row,
    findings_by_code,
    kpi,
    money,
    needs_run,
    open_ap_total,
    open_ar_total,
    sorted_findings,
)

# --------------------------------------------------------------------- close


def build_close(lake: DataLake, memory: MemoryGraph) -> dict[str, Any]:
    recon = finding(memory, "RECON_SUMMARY")
    fees = finding(memory, "UNRECORDED_BANK_ITEMS")
    fx = finding(memory, "FX_DIFFERENCE")
    liab = finding(memory, "UNRECORDED_LIABILITY")
    dup = findings_by_code(memory, "DUPLICATE_PAYMENT", "DUPLICATE_INVOICE")
    bank_change = findings_by_code(memory, "VENDOR_BANK_CHANGE")
    aging = finding(memory, "AR_AGING")

    def st(f, has_je: bool = False):
        if f is None:
            return "todo"
        if has_je and f.proposed_je:
            return "in-progress"
        return "done" if f.severity == "info" else "in-progress"

    checklist = [
        {
            "id": "close-recon",
            "label": "Bank reconciliation — Operating",
            "status": "todo"
            if recon is None
            else ("done" if (recon.data or {}).get("difference") == 0 else "blocked"),
            "owner": "agent",
        },
        {
            "id": "close-fees",
            "label": "Record bank fees & interest",
            "status": "todo" if fees is None else st(fees, has_je=True),
            "owner": "agent",
        },
        {
            "id": "close-fx",
            "label": "Book FX difference",
            "status": "todo" if fx is None else st(fx, has_je=True),
            "owner": "agent",
        },
        {
            "id": "close-accrue",
            "label": "Accrue unrecorded liabilities",
            "status": st(liab, has_je=True) if liab else "todo",
            "owner": "agent",
        },
        {
            "id": "close-dup",
            "label": "Resolve duplicate payments",
            "status": "done" if not dup else "in-progress",
            "owner": "agent",
        },
        {
            "id": "close-bank",
            "label": "Verify vendor bank changes",
            "status": "done" if not bank_change else "in-progress",
            "owner": "agent",
        },
        {
            "id": "close-aging",
            "label": "AR aging reviewed",
            "status": "done" if aging else "todo",
            "owner": "agent",
        },
        {
            "id": "close-signoff",
            "label": "Management sign-off",
            "status": "todo",
            "owner": "you",
        },
    ]

    variance_rows = []
    for f in memory.findings:
        if not f.proposed_je:
            continue
        je = f.proposed_je
        lines = [
            (ln[0], ln[1], ln[2]) if not isinstance(ln, dict)
            else (ln.get("account"), ln.get("debit"), ln.get("credit"))
            for ln in (je.get("lines") or [])
        ]
        variance_rows.append(
            {
                "id": f"finding:{f.code}:{f.key}",
                "tag": "review",
                "primary": je.get("memo") or f.title,
                "secondary": f"{f.agent} · {f.code}",
                "amount": money(f.amount),
                "href": f"/graph?node=finding:{f.code}:{f.key}",
                "detail": {
                    "prose": [f.detail or f.title],
                    "evidence": [
                        f"{acct} Dr {money(dr)} Cr {money(cr)}"
                        for acct, dr, cr in lines
                    ]
                    + f.evidence
                    + f.entities,
                    "actions": [
                        {
                            "label": "View in graph",
                            "kind": "ghost",
                            "href": f"/graph?node=finding:{f.code}:{f.key}",
                        }
                    ],
                },
            }
        )

    return {
        "checklist": checklist,
        "days_remaining": "N/A",
        "variance_flags": variance_rows,
        "needs_run": needs_run(
            memory, "RECON_SUMMARY", "AR_AGING", "PAYMENT_RUN"
        ),
        "run_request": "Close the books for Q1",
    }


# ------------------------------------------------------------ command center


def build_command_center(lake: DataLake, memory: MemoryGraph) -> dict[str, Any]:
    aging = finding(memory, "AR_AGING")
    cash = lake.gl_cash_balance(AS_OF)
    ar_total = (
        (aging.data or {}).get("open_ar_total")
        if aging
        else open_ar_total(lake)
    )
    kpis = [
        kpi("Cash", cash),
        kpi("AR outstanding", ar_total),
        kpi("AP outstanding", open_ap_total(lake)),
        kpi("Runway", "N/A", fmt=False),  # no burn-rate data source
    ]
    rows = [finding_row(f) for f in sorted_findings(memory, exclude_info=True)]
    close = build_close(lake, memory)
    return {
        "kpis": kpis,
        "activity": rows,
        "checklist": close["checklist"][:4],
        "needs_run": not rows,
        "run_request": "Close the books for Q1",
    }


# ------------------------------------------------------------------ payables

_AP_CODES = (
    "DUPLICATE_PAYMENT",
    "DUPLICATE_INVOICE",
    "AMOUNT_MISMATCH",
    "UNRECORDED_LIABILITY",
    "VENDOR_BANK_CHANGE",
)


def _ap_finding_row(f: Any) -> dict[str, Any]:
    row = finding_row(f)
    row["id"] = f.key  # invoice key — /payables/invoices/[id] resolves on it
    row["href"] = f"/payables/invoices/{f.key}"
    return row


def _payment_run_rows(run: list[dict]) -> list[dict[str, Any]]:
    return [
        {
            "id": f"pay-{r['invoice']}",
            "tag": "auto",
            "primary": f"{r['invoice']} — {r['vendor']}",
            "secondary": f"due {r.get('due') or 'N/A'} · {r.get('currency', 'USD')}",
            "amount": money(r.get("amount")),
            "href": f"/payables/invoices/{r['invoice']}",
        }
        for r in run
    ]


def build_payables(lake: DataLake, memory: MemoryGraph) -> dict[str, Any]:
    queue = [
        _ap_finding_row(f) for f in sorted_findings(memory) if f.code in _AP_CODES
    ]
    pr = finding(memory, "PAYMENT_RUN")
    data = pr.data if pr else {}
    run = (data or {}).get("run", [])
    auto_paid = {
        "count": len(run) if pr else "N/A",
        "total": money(pr.amount if pr else None),
        "week_of": AS_OF if pr else "N/A",
        "on_hold": len((data or {}).get("on_hold", [])) if pr else "N/A",
    }
    return {
        "queue": queue,
        "auto_paid": auto_paid,
        "auto_paid_ledger": _payment_run_rows(run),
        "needs_run": not queue and pr is None,
        "run_request": "Close the books for Q1",
    }


def build_payables_invoice(lake: DataLake, memory: MemoryGraph, key: str) -> dict | None:
    f = next(
        (
            f
            for f in memory.findings
            if f.code in _AP_CODES and f.key == key
        ),
        None,
    )
    if f is None:
        return None
    return {"row": _ap_finding_row(f), "finding": f.model_dump(mode="json")}


# --------------------------------------------------------------- receivables

_BUCKET_LABELS = {
    "current": "Current",
    "1-30": "1–30",
    "31-60": "31–60",
    "61-90": "61–90",
    "90+": "60+",
}


def build_receivables(lake: DataLake, memory: MemoryGraph) -> dict[str, Any]:
    aging = finding(memory, "AR_AGING")
    data = (aging.data or {}) if aging else {}
    buckets = data.get("buckets", {})
    kpis = []
    for bk, label in _BUCKET_LABELS.items():
        if bk in buckets:
            kpis.append(kpi(label, buckets[bk]))
    if not kpis:
        kpis = [kpi(label, None) for label in _BUCKET_LABELS.values()]
    kpis.append(kpi("Open AR", data.get("open_ar_total")))

    rows = []
    for r in data.get("rows", []):
        if r.get("status") in (None, "current"):
            continue
        rows.append(
            {
                "id": f"ar-{r['invoice']}",
                "tag": "flag" if r.get("status") == "disputed" else "review",
                "primary": f"{r['invoice']} — {r.get('customer_id', '')}",
                "secondary": f"{r.get('status')} · {r.get('days_past_due', 0)}d past due"
                + (
                    f" · promised {r['promised_date']}"
                    if r.get("promised_date")
                    else ""
                ),
                "amount": money(r.get("open")),
                "href": f"/graph?node={r['invoice']}",
            }
        )
    for f in sorted_findings(memory):
        if f.code in ("SHORT_PAY_DISPUTE", "SHORT_PAY", "PROMISE_TO_PAY"):
            rows.append(finding_row(f))
    return {
        "aging": kpis,
        "collections": rows,
        "needs_run": aging is None,
        "run_request": "Close the books for Q1",
    }


# ------------------------------------------------------------- reconciliation


def build_reconciliation(lake: DataLake, memory: MemoryGraph) -> dict[str, Any]:
    recon = finding(memory, "RECON_SUMMARY")
    s = (recon.data or {}) if recon else {}
    accounts = sorted({b.account for b in lake.bank if b.account})
    rows = []
    for acct in accounts:
        matched = sum((s.get("matched") or {}).values())
        unexpl = len(s.get("unexplained_bank", [])) + len(s.get("unexplained_book", []))
        diff = s.get("difference")
        row: dict[str, Any] = {
            "id": f"acct-{acct}",
            "primary": acct,
            "secondary": (
                f"{matched} matched · {unexpl} unexplained · "
                f"difference {money(diff)}"
                if recon
                else "No reconciliation run yet — N/A"
            ),
            "amount": money(s.get("bank_balance")),
            "detail": {
                "prose": [recon.title, recon.detail] if recon else [],
                "evidence": (recon.evidence + recon.entities) if recon else [],
                "actions": [
                    {
                        "label": "View in graph",
                        "kind": "ghost",
                        "href": f"/graph?node=finding:RECON_SUMMARY:{AS_OF}",
                    }
                ]
                if recon
                else [],
            },
        }
        # waterfall: only bars we can source
        bars = []
        if s.get("bank_balance") is not None:
            bars.append(
                {"label": "Bank balance", "value": s["bank_balance"], "kind": "start"}
            )
        unrec = finding(memory, "UNRECORDED_BANK_ITEMS")
        if unrec and unrec.amount:
            bars.append(
                {
                    "label": "Unrecorded bank items",
                    "value": unrec.amount,
                    "kind": "positive",
                }
            )
        fx = finding(memory, "FX_DIFFERENCE")
        if fx and fx.amount:
            bars.append(
                {"label": "FX difference", "value": fx.amount, "kind": "positive"}
            )
        if s.get("adjusted_book") is not None:
            bars.append(
                {
                    "label": "Adjusted book",
                    "value": s["adjusted_book"],
                    "kind": "end",
                }
            )
        if len(bars) >= 2:
            row["detail"]["waterfall"] = {"unit": "$", "bars": bars}
        rows.append(row)

    children = [
        finding_row(f)
        for f in sorted_findings(memory)
        if f.code
        in ("FX_DIFFERENCE", "UNRECORDED_BANK_ITEMS", "TIMING_ITEMS", "LUMP_SUM_MATCH")
    ]
    return {
        "accounts": rows,
        "findings": children,
        "needs_run": recon is None,
        "run_request": "Close the books for Q1",
    }


# ------------------------------------------------------------------ forecast


def _recurring_outflows(lake: DataLake, as_of: str) -> list[dict[str, Any]]:
    """Same vendor/memo pattern appearing ≥2 times in Q1 -> projected at the
    last amount on its observed cadence."""
    groups: dict[str, list] = defaultdict(list)
    for line in lake.gl_lines("6000", end=as_of) + lake.gl_lines("5000", end=as_of):
        key = line.vendor_id or " ".join(line.memo.lower().split()[:3]) or line.account
        groups[key].append(line)
    out = []
    for key, lines in groups.items():
        if len(lines) < 2:
            continue
        lines = sorted(lines, key=lambda x: x.posting_date)
        gaps = [
            (b.posting_date - a.posting_date).days
            for a, b in zip(lines, lines[1:])
            if (b.posting_date - a.posting_date).days > 0
        ]
        cadence = sorted(gaps)[len(gaps) // 2] if gaps else 30
        out.append(
            {
                "label": lines[-1].memo or key,
                "amount": abs(lines[-1].amount),
                "last_date": lines[-1].posting_date,
                "cadence_days": cadence,
            }
        )
    return out


def build_forecast(lake: DataLake, memory: MemoryGraph) -> dict[str, Any]:
    opening = lake.gl_cash_balance(AS_OF)
    aging = finding(memory, "AR_AGING")
    pr = finding(memory, "PAYMENT_RUN")
    start = _d(AS_OF) + timedelta(days=1)  # 2026-04-01
    weeks = [
        {"label": f"W{i + 1}", "inflows": 0.0, "outflows": 0.0, "ending": 0.0}
        for i in range(13)
    ]

    def week_index(d) -> int | None:
        if d is None:
            return None
        i = (d - start).days // 7
        return i if 0 <= i < 13 else None

    unscheduled = []
    for r in (aging.data or {}).get("rows", []) if aging else []:
        when = (
            _d(r.get("promised_date"))
            if r.get("status") == "promised" and r.get("promised_date")
            else _d(r.get("due"))
        )
        i = week_index(when)
        if i is None:
            unscheduled.append(
                {
                    "label": f"{r['invoice']} — {r.get('customer_id', '')}",
                    "amount": money(r.get("open")),
                    "reason": "overdue, no promise"
                    if r.get("status") == "overdue"
                    else "outside horizon",
                }
            )
        else:
            weeks[i]["inflows"] = round(weeks[i]["inflows"] + r["open"], 2)

    for r in (pr.data or {}).get("run", []) if pr else []:
        i = week_index(_d(r.get("due")))
        if i is not None:
            weeks[i]["outflows"] = round(weeks[i]["outflows"] + r["amount"], 2)

    assumptions = []
    for rec in _recurring_outflows(lake, AS_OF):
        d = rec["last_date"] + timedelta(days=rec["cadence_days"])
        placed = 0
        while (i := week_index(d)) is not None:
            weeks[i]["outflows"] = round(weeks[i]["outflows"] + rec["amount"], 2)
            d += timedelta(days=rec["cadence_days"])
            placed += 1
        if placed:
            assumptions.append(
                f"{rec['label']}: projected {money(rec['amount'])} every "
                f"~{rec['cadence_days']}d (recurring in Q1)"
            )

    cash = opening
    for w in weeks:
        cash = round(cash + w["inflows"] - w["outflows"], 2)
        w["ending"] = cash

    if aging is None:
        assumptions.append("No AR_AGING finding — receivable inflows not scheduled")
    if pr is None:
        assumptions.append("No PAYMENT_RUN finding — payable outflows not scheduled")

    return {
        "opening": opening,
        "weeks": weeks,
        "unscheduled": unscheduled,
        "assumptions": assumptions,
        "covenant": "N/A",
        "needs_run": aging is None and pr is None,
        "run_request": "Close the books for Q1",
    }


# --------------------------------------------------------------------- audit


def build_audit(lake: DataLake, memory: MemoryGraph) -> dict[str, Any]:
    log = []
    for f in memory.findings:
        if f.code == "ORCHESTRATION_RUN":
            calls = (f.data or {}).get("plan", {}).get("calls", [])
            agents = ", ".join(c.get("agent", "") for c in calls)
            log.append(
                {
                    "id": f"finding:{f.code}:{f.key}",
                    "timestamp": f.created_at.isoformat(),
                    "actor": "system",
                    "actorName": f.agent,
                    "action": f.title + (f" — {agents}" if agents else ""),
                    "amount": None,
                }
            )
        elif f.code in ("VENDOR_BANK_CHANGE",):
            log.append(
                {
                    "id": f"finding:{f.code}:{f.key}",
                    "timestamp": f.created_at.isoformat(),
                    "actor": "agent",
                    "actorName": f.agent,
                    "action": f.title,
                    "amount": money(f.amount),
                }
            )
    log.sort(key=lambda e: e["timestamp"])
    return {"log": log}
