"""Seed the base layer of the memory graph from the DataLake.

The findings agents write (`MemoryGraph.remember`) reference bare ids: bank txn
ids (BK00037), journal ids (JE-1049), document refs (INV-7781, AR-1044), party
ids (V003, C007) and email file names. This module creates those nodes up-front
from the raw data and links them, so every finding lands on a real subgraph and
every agent can pull context (`MemoryGraph.context`) before it works.

Node ids follow the agents' conventions; norm refs (INV7781) are aliases that
resolve to the canonical node (INV-7781).
"""

from __future__ import annotations

import re
import unicodedata
from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import TYPE_CHECKING

from app.data.loaders import norm_ref
from app.data.models import BankTxn, Email, GLLine, Invoice

if TYPE_CHECKING:
    from app.data.lake import DataLake
    from app.memory.graph import MemoryGraph

INGEST = "ingest"
COMPANY = "COMPANY"
COMPANY_DOMAIN = "northwindrobotics.com"
OPERATING_ACCT = "acct:****0042"

_UMLAUTS = str.maketrans(
    {"ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss", "Ä": "Ae", "Ö": "Oe", "Ü": "Ue"}
)
_STOP = {"INC", "GMBH", "LLP", "LLC", "CO", "CORP", "GROUP", "GRP", "THE", "AND", "OF", "LTD"}
_REMIT_REF = re.compile(r"\b(?:REMIT|Payment reference:)\s*#?\s*(\d{5,})", re.I)
_CHECK = re.compile(r"check\s*#\s*(\d{3,6})", re.I)
_MASKED = re.compile(r"(?:ending|acct|account)\s*:?\s*(?:\*{4})?\s*(\d{4})\b|\*{4}(\d{4})\b", re.I)
_LONG_DATE = re.compile(
    r"\b(January|February|March|April|May|June|July|August|September|October|November|December)"
    r"\s+(\d{1,2}),?\s+(\d{4})\b"
)
_MONTHS = {m: i for i, m in enumerate(_LONG_DATE.pattern.split("(")[1].split(")")[0].split("|"), 1)}
_CUSTOMER_NAME = re.compile(r"(?:Invoice \S+ to|Receipt) (.+?)(?: for \S+| \(|$)")


# ------------------------------------------------------------------ helpers
def _norm_name(s: str) -> str:
    s = unicodedata.normalize("NFKD", s.translate(_UMLAUTS)).encode("ascii", "ignore").decode()
    return re.sub(r"[^A-Z0-9 ]", " ", s.upper())


def _name_tokens(s: str) -> list[str]:
    return [t for t in _norm_name(s).split() if t and t not in _STOP]


def match_party(text: str, parties: dict[str, str]) -> tuple[str | None, int]:
    """Best party whose name tokens prefix-match tokens in `text`.

    'ACH DEBIT NORTHSTAR STAF ID:NSS-102' -> Northstar Staffing (score 2).
    The first name token must appear verbatim so short words never fuzz.
    """
    toks = set(_norm_name(text).split())
    best, best_score = None, 0
    for pid, name in parties.items():
        nt = _name_tokens(name)
        if not nt or nt[0] not in toks:
            continue
        score = sum(1 for n in nt if any(t == n or (len(t) >= 3 and n.startswith(t)) for t in toks))
        if score > best_score:
            best, best_score = pid, score
    return best, best_score


def match_party_by_domain(domain: str, parties: dict[str, str]) -> str | None:
    """'cloudnimbus-billing.co' -> CloudNimbus: first name token is a prefix of the domain."""
    d = domain.lower().split(".")[0].replace("-", "")
    for pid, name in parties.items():
        nt = _name_tokens(name)
        if nt and d.startswith(nt[0].lower()):
            return pid
    return None


def _last4(masked: str | None) -> str | None:
    if not masked:
        return None
    m = re.search(r"(\d{4})\s*$", masked)
    return m.group(1) if m else None


def _period(d: date | str | None) -> str | None:
    return str(d)[:7] if d else None


def _days(a: date, b: date) -> int:
    return abs((a - b).days)


# -------------------------------------------------------------------- seed
def seed_from_lake(g: MemoryGraph, lake: DataLake) -> None:
    # Rebuild the base layer from scratch. Agent-written findings and their edges
    # are kept; every other node is recreated from the data so a reload never
    # drifts (duplicate variants, missing links) from a fresh seed.
    kept_edges = [e for e in g.edges if e.agent != INGEST]
    kept_nodes = {n.id: n for n in g.nodes.values() if n.type == "finding"}
    g.edges = []
    g.nodes = kept_nodes
    g.aliases.clear()
    g.upsert_node(COMPANY, type="company", name="Northwind Robotics Inc.", domain=COMPANY_DOMAIN)
    g.upsert_node(OPERATING_ACCT, type="bank_account", last4="0042", bank="Operating")
    g.link(COMPANY, "OWNS", OPERATING_ACCT)

    _seed_invoices(g, lake.invoices)
    jes = _seed_gl(g, lake.gl)
    _seed_bank(g, lake.bank, jes)
    _seed_emails(g, lake.emails)
    _seed_scans(g, lake)
    _derive_balances(g)
    _derive_patterns(g)
    # Re-attach what the agents wrote: endpoints now resolve to seeded nodes.
    for e in kept_edges:
        e.src, e.dst = g.resolve(e.src), g.resolve(e.dst)
        g.upsert_node(e.src)
        g.upsert_node(e.dst)
    g.edges.extend(kept_edges)


# ---------------------------------------------------------------- invoices
def _seed_invoices(g: MemoryGraph, invoices: list[Invoice]) -> None:
    vendors: dict[str, str] = {}
    for inv in invoices:
        if inv.vendor_id:
            vendors[inv.vendor_id] = inv.vendor_name
    for inv in invoices:
        if not inv.vendor_id:  # email_ingest rows carry a name only
            vid, _ = match_party(inv.vendor_name, vendors)
            inv.vendor_id = vid or f"V?{norm_ref(inv.vendor_name)}"
            vendors.setdefault(inv.vendor_id, inv.vendor_name)
    for vid, name in vendors.items():
        g.upsert_node(vid, type="vendor", name=name, domains=[])
    for inv in invoices:
        if inv.vendor_domain:
            ds = g.nodes[inv.vendor_id].props["domains"]
            if inv.vendor_domain not in ds:
                ds.append(inv.vendor_domain)

    for inv in sorted(invoices, key=lambda i: i.received_at):
        nid = g.resolve(inv.invoice_number)
        if nid in g.nodes and g.nodes[nid].type == "invoice":
            p = g.nodes[nid].props
            p["variants"] = sorted(set(p["variants"]) | {inv.invoice_number})
            p["sources"].append(inv.source)
            p["received_at"].append(inv.received_at)
            p["ingested_count"] += 1
            p["line_text_by_source"][inv.source] = inv.line_text
        else:
            nid = inv.invoice_number
            g.upsert_node(
                nid,
                type="invoice",
                number=inv.invoice_number,
                variants=[inv.invoice_number],
                sources=[inv.source],
                vendor_id=inv.vendor_id,
                vendor_name=inv.vendor_name,
                invoice_date=str(inv.invoice_date),
                due_date=str(inv.due_date) if inv.due_date else None,
                currency=inv.currency,
                total=inv.total,
                remit_bank=inv.remit_bank,
                remit_account=_last4(inv.remit_account),
                received_at=[inv.received_at],
                ingested_count=1,
                line_text=inv.line_text,
                line_text_by_source={inv.source: inv.line_text},
                period=_period(inv.invoice_date),
                text=inv.line_text,
            )
            g.alias(norm_ref(inv.invoice_number), nid)
            g.link(nid, "ISSUED_BY", inv.vendor_id)
            _link_period(g, nid, inv.invoice_date)
        g.alias(norm_ref(inv.invoice_number), nid)
        last4 = _last4(inv.remit_account)
        if last4:
            aid = f"acct:****{last4}"
            g.upsert_node(aid, type="bank_account", last4=last4, bank=inv.remit_bank)
            g.link(nid, "REMITS_TO", aid, bank=inv.remit_bank)
            prev = g.edge(inv.vendor_id, "USES_ACCOUNT", aid)
            seen = inv.received_at
            g.link(
                inv.vendor_id,
                "USES_ACCOUNT",
                aid,
                first_seen=min(prev.props["first_seen"], seen) if prev else seen,
                last_seen=max(prev.props["last_seen"], seen) if prev else seen,
                count=(prev.props["count"] if prev else 0) + 1,
                invoices=sorted(
                    set((prev.props["invoices"] if prev else []) + [inv.invoice_number])
                ),
            )


def _link_period(g: MemoryGraph, nid: str, d: date | str | None) -> None:
    p = _period(d)
    if p:
        g.upsert_node(p, type="period", period=p)
        g.link(nid, "IN_PERIOD", p)


# ---------------------------------------------------------- general ledger
def _je_kind(lines: list[GLLine], source: str) -> str:
    dr = {ln.account for ln in lines if ln.debit > 0}
    cr = {ln.account for ln in lines if ln.credit > 0}
    if "2000" in cr and "1000" not in dr:
        return "invoice_posting"
    if "2000" in dr and "1000" in cr:
        return "payment"
    if "1200" in dr and "4000" in cr:
        return "ar_invoice"
    if "1000" in dr and "1200" in cr:
        return "receipt"
    return source.lower()


def _seed_gl(g: MemoryGraph, gl: list[GLLine]) -> dict[str, dict]:
    by_je: dict[str, list[GLLine]] = defaultdict(list)
    for ln in gl:
        by_je[ln.je_id].append(ln)
    for ln in gl:
        g.upsert_node(
            f"GL-{ln.account}", type="gl_account", account=ln.account, name=ln.account_name
        )

    jes: dict[str, dict] = {}
    for je_id, lines in by_je.items():
        first = lines[0]
        kind = _je_kind(lines, first.source)
        amount = round(sum(ln.debit for ln in lines), 2)
        cash = round(sum(ln.amount for ln in lines if ln.account == "1000"), 2)
        try:
            dt = datetime.fromisoformat(first.entered_at)
        except ValueError:
            dt = None
        props = dict(
            je_id=je_id,
            posting_date=str(first.posting_date),
            source=first.source,
            kind=kind,
            amount=amount,
            cash_delta=cash,
            memo=first.memo,
            doc_ref=first.doc_ref,
            vendor_id=first.vendor_id,
            customer_id=first.customer_id,
            posted_by=first.posted_by,
            approved_by=first.approved_by,
            entered_at=first.entered_at,
            check_number=first.check_number,
            lines=[
                dict(account=ln.account, name=ln.account_name, debit=ln.debit, credit=ln.credit)
                for ln in lines
            ],
            self_approved=bool(first.posted_by and first.posted_by == first.approved_by),
            off_hours=bool(dt and (dt.weekday() >= 5 or dt.hour < 7 or dt.hour >= 20)),
            round_amount=amount >= 10_000 and amount % 1_000 == 0,
            no_doc_ref=first.doc_ref is None,
            period=_period(first.posting_date),
            text=first.memo,
        )
        g.upsert_node(je_id, type="journal", **props)
        jes[je_id] = {**props, "posting_date_d": first.posting_date}
        _link_period(g, je_id, first.posting_date)
        for ln in lines:
            g.link(je_id, "HITS", f"GL-{ln.account}", debit=ln.debit, credit=ln.credit)
        for who, rel in ((first.posted_by, "POSTED_BY"), (first.approved_by, "APPROVED_BY")):
            if who:
                g.upsert_node(f"user:{who}", type="person", user=who)
                g.link(je_id, rel, f"user:{who}")
        if first.vendor_id and first.vendor_id in g.nodes:
            g.link(je_id, "COUNTERPARTY", first.vendor_id)
        if first.customer_id:
            m = _CUSTOMER_NAME.search(first.memo)
            cname = m.group(1).strip() if m else first.customer_id
            existing = g.nodes.get(first.customer_id)
            if existing is None or existing.props.get("name") == first.customer_id:
                g.upsert_node(first.customer_id, type="customer", name=cname)
            g.link(je_id, "COUNTERPARTY", first.customer_id)

        ref = first.doc_ref
        if not ref or (not first.vendor_id and not first.customer_id):
            continue  # payroll runs, bank fees, interest: no counterparty document
        if kind in ("ar_invoice", "receipt") and first.customer_id:
            aid = g.resolve(ref)
            if kind == "ar_invoice":
                aid = ref
                g.upsert_node(
                    aid,
                    type="ar_invoice",
                    number=ref,
                    customer_id=first.customer_id,
                    invoice_date=str(first.posting_date),
                    due_date=str(first.posting_date + timedelta(days=30)),
                    due_date_estimated=True,
                    amount=amount,
                    currency="USD",
                    period=_period(first.posting_date),
                )
                g.alias(norm_ref(ref), aid)
                g.link(aid, "BILLED_TO", first.customer_id)
                _link_period(g, aid, first.posting_date)
            elif aid not in g.nodes:
                g.upsert_node(
                    aid,
                    type="ar_invoice",
                    number=ref,
                    customer_id=first.customer_id,
                    amount=None,
                    orphan=True,
                )
                g.alias(norm_ref(ref), aid)
                g.link(aid, "BILLED_TO", first.customer_id)
            g.link(je_id, "RECORDS", aid, role=kind, amount=amount)
        else:
            target = g.resolve(ref)
            if target not in g.nodes:
                # Vendor document the books reference but AP never received.
                g.upsert_node(
                    target,
                    type="invoice",
                    number=ref,
                    variants=[ref],
                    sources=["gl_only"],
                    vendor_id=first.vendor_id,
                    total=amount,
                    currency="USD",
                    gl_only=True,
                    received_at=[],
                    ingested_count=0,
                    period=_period(first.posting_date),
                )
                g.alias(norm_ref(ref), target)
                if first.vendor_id and first.vendor_id in g.nodes:
                    g.link(target, "ISSUED_BY", first.vendor_id)
            inv = g.nodes[target].props
            eprops: dict = {"role": kind, "amount": amount}
            if kind == "invoice_posting" and inv.get("total") is not None:
                if inv.get("currency", "USD") == "USD":
                    eprops["amount_diff"] = round(amount - inv["total"], 2)
                else:
                    eprops["fx_rate"] = round(amount / inv["total"], 4)
            g.link(je_id, "RECORDS", target, **eprops)
    return jes


# -------------------------------------------------------------------- bank
def _seed_bank(g: MemoryGraph, bank: list[BankTxn], jes: dict[str, dict]) -> None:
    vendors = {n.id: n.props["name"] for n in g.nodes.values() if n.type == "vendor"}
    customers = {n.id: n.props["name"] for n in g.nodes.values() if n.type == "customer"}
    cleared: set[str] = set()

    for b in bank:
        remit = _REMIT_REF.search(b.description)
        vid, vs = match_party(b.description, vendors)
        cid, cs = match_party(b.description, customers)
        party = None
        if vid and b.amount < 0 and vs >= cs:
            party = vid
        elif cid and b.amount > 0:
            party = cid
        g.upsert_node(
            b.txn_id,
            type="bank_txn",
            posted_date=str(b.posted_date),
            amount=b.amount,
            running_balance=b.running_balance,
            txn_type=b.txn_type,
            description=b.description,
            check_number=b.check_number,
            account=b.account,
            remit_ref=remit.group(1) if remit else None,
            counterparty=party,
            period=_period(b.posted_date),
            text=b.description,
        )
        _link_period(g, b.txn_id, b.posted_date)
        g.link(OPERATING_ACCT, "OWNS", b.txn_id)
        if party:
            g.link(b.txn_id, "COUNTERPARTY", party)

        # 1) SETTLES: document number in the description, else party + amount.
        targets = [
            g.resolve(r)
            for r in b.refs_norm
            if g.resolve(r) in g.nodes and g.nodes[g.resolve(r)].type in ("invoice", "ar_invoice")
        ]
        via = "reference"
        if not targets and party:
            tol = 0.02 if b.txn_type == "WIRE_OUT" else 0.0
            targets = _match_doc_by_amount(g, party, abs(b.amount), tol)
            via = "amount"
        for t in targets:
            doc = g.nodes[t].props
            doc_amt = doc.get("total") if g.nodes[t].type == "invoice" else doc.get("amount")
            eprops = {"amount": abs(b.amount), "via": via}
            if doc_amt is not None and doc.get("currency", "USD") == "USD":
                eprops["amount_diff"] = round(abs(b.amount) - doc_amt, 2)
            g.link(b.txn_id, "SETTLES", t, **eprops)

        # 2) CLEARS: the journal entry whose cash line this bank line reconciles.
        je = _match_je(g, jes, cleared, b, party, targets)
        if je:
            cleared.add(je)
            diff = round(abs(b.amount) - abs(jes[je]["cash_delta"]), 2)
            g.link(b.txn_id, "CLEARS", je, amount=abs(b.amount), amount_diff=diff)
            for e in g.out_edges(je, "RECORDS"):
                if not g.edge(b.txn_id, "SETTLES", e.dst):
                    g.link(b.txn_id, "SETTLES", e.dst, amount=abs(b.amount), via="journal")


def _match_doc_by_amount(g: MemoryGraph, party: str, amount: float, tol: float) -> list[str]:
    best, best_diff = None, None
    for e in g.in_edges(party):
        if e.rel not in ("ISSUED_BY", "BILLED_TO"):
            continue
        doc = g.nodes[e.src]
        if any(x.rel == "SETTLES" for x in g.in_edges(doc.id)):
            continue
        val = doc.props.get("total") if doc.type == "invoice" else doc.props.get("amount")
        if val is None:
            continue
        if doc.props.get("currency", "USD") != "USD":
            rec = [
                x for x in g.in_edges(doc.id, "RECORDS") if x.props.get("role") == "invoice_posting"
            ]
            val = rec[0].props["amount"] if rec else val
        diff = abs(val - amount)
        if diff <= max(tol * val, 0.005) and (best_diff is None or diff < best_diff):
            best, best_diff = doc.id, diff
    return [best] if best else []


def _match_je(g, jes, cleared, b: BankTxn, party, targets) -> str | None:
    cands = []
    for je_id, je in jes.items():
        if je_id in cleared or abs(je["cash_delta"]) < 0.005:
            continue
        if (je["cash_delta"] > 0) != (b.amount > 0):
            continue
        if _days(je["posting_date_d"], b.posted_date) > 25:
            continue
        diff = abs(abs(je["cash_delta"]) - abs(b.amount))
        exact = diff < 0.005
        fx_ok = b.txn_type == "WIRE_OUT" and diff <= 0.02 * abs(b.amount)
        if not (exact or fx_ok):
            continue
        je_party = je["vendor_id"] or je["customer_id"]
        if party and je_party and party != je_party:
            continue
        if b.check_number and je["check_number"] and b.check_number != je["check_number"]:
            continue
        records = {e.dst for e in g.out_edges(je_id, "RECORDS")}
        score = (
            (3 if exact else 1)
            + (2 if records & set(targets) else 0)
            + (2 if b.check_number and b.check_number == je["check_number"] else 0)
        )
        cands.append((score, -_days(je["posting_date_d"], b.posted_date), je_id))
    if not cands:
        return None
    cands.sort(reverse=True)
    return cands[0][2]


# ------------------------------------------------------------------ emails
def _seed_emails(g: MemoryGraph, emails: list[Email]) -> None:
    vendors = {n.id: n.props["name"] for n in g.nodes.values() if n.type == "vendor"}
    customers = {n.id: n.props["name"] for n in g.nodes.values() if n.type == "customer"}
    vendor_domains = {
        d: n.id for n in g.nodes.values() if n.type == "vendor" for d in n.props["domains"]
    }
    bank_by_remit = {
        n.props["remit_ref"]: n.id
        for n in g.nodes.values()
        if n.type == "bank_txn" and n.props.get("remit_ref")
    }

    for m in emails:
        full = f"{m.subject}\n{m.body}"
        pay_ref = _REMIT_REF.search(full)
        check = _CHECK.search(full)
        dates = [
            date(int(y), _MONTHS[mo], int(d)).isoformat() for mo, d, y in _LONG_DATE.findall(m.body)
        ]
        promised = (
            dates[0]
            if dates and re.search(r"\b(?:by|before|on)\s+" + _LONG_DATE.pattern, m.body)
            else None
        )
        accounts = [a or b for a, b in _MASKED.findall(full)]
        internal = m.from_domain == COMPANY_DOMAIN
        g.upsert_node(
            m.file,
            type="email",
            subject=m.subject,
            sender=m.sender,
            from_domain=m.from_domain,
            to=m.to,
            date=m.sent_at[:10],
            amounts=m.amounts,
            doc_refs=m.doc_refs_norm,
            payment_ref=pay_ref.group(1) if pay_ref else None,
            check_number=check.group(1) if check else None,
            dates_mentioned=dates,
            promised_date=promised,
            mentioned_accounts=accounts,
            internal=internal,
            period=_period(m.sent_at),
            text=full,
        )
        _link_period(g, m.file, m.sent_at)
        if internal:
            user = re.search(r"([\w.\-]+)@", m.sender).group(1)
            g.upsert_node(f"user:{user}", type="person", user=user)
            g.link(m.file, "FROM", f"user:{user}")

        parties: dict[str, dict] = {}
        if not internal:
            vid = match_party_by_domain(m.from_domain, vendors)
            cid = match_party_by_domain(m.from_domain, customers)
            if vid:
                parties[vid] = dict(
                    via="sender_domain",
                    domain_known=m.from_domain in vendor_domains,
                    lookalike_domain=m.from_domain not in vendor_domains,
                )
            elif cid:
                parties[cid] = dict(via="sender_domain", domain_known=None)
        for pid, name in {**vendors, **customers}.items():
            hit, score = match_party(full, {pid: name})
            if hit and score >= 1 and pid not in parties:
                parties[pid] = dict(via="text")
        for pid, props in parties.items():
            g.link(m.file, "MENTIONS", pid, **props)
        for ref in m.doc_refs_norm:
            t = g.resolve(ref)
            if t in g.nodes and g.nodes[t].type in ("invoice", "ar_invoice", "journal"):
                g.link(m.file, "MENTIONS", t, via="reference")
        for last4 in accounts:
            aid = f"acct:****{last4}"
            if aid in g.nodes:
                g.link(m.file, "MENTIONS", aid, via="account")
        if pay_ref and pay_ref.group(1) in bank_by_remit:
            txn = bank_by_remit[pay_ref.group(1)]
            g.link(m.file, "EXPLAINS", txn)
            for mm in re.finditer(r"\b(AR-?\d{3,5})\b[^\n]*?\$\s*([\d,]+\.\d{2})", m.body):
                t = g.resolve(mm.group(1))
                if t in g.nodes:
                    g.link(
                        txn,
                        "SETTLES",
                        t,
                        amount=float(mm.group(2).replace(",", "")),
                        via="remittance",
                    )
                    for rec in g.in_edges(t, "RECORDS"):
                        if rec.props.get("role") == "receipt" and not g.in_edges(rec.src, "CLEARS"):
                            g.link(
                                txn,
                                "CLEARS",
                                rec.src,
                                amount=rec.props["amount"],
                                amount_diff=0.0,
                                via="remittance",
                            )


# ------------------------------------------------------------------- scans
def _seed_scans(g: MemoryGraph, lake: DataLake) -> None:
    """Scan nodes carry the OCR text and parsed fields, and the SCAN_OF edge records
    how the scan compares to the invoice we were billed for (total, remit account)."""
    from app.memory.ocr import load_ocr_cache, parse_invoice_fields

    folder = getattr(lake, "data_dir", None)
    if folder is None:
        return
    cache = load_ocr_cache(folder)
    for p in sorted((folder / "scanned_invoices").glob("*.png")):
        parts = p.stem.split("_", 2)  # scan_<vendor>_<INVOICE-NO>
        ref = parts[2] if len(parts) == 3 else p.stem
        ocr = cache.get(p.name)
        fields = parse_invoice_fields(ocr["text"]) if ocr else {}
        if fields.get("number"):
            ref = fields["number"]
        g.upsert_node(
            p.name,
            type="scan",
            path=str(p),
            invoice_ref=ref,
            ocr_text=ocr["text"] if ocr else None,
            ocr_lines=len(ocr["lines"]) if ocr else 0,
            text=ocr["text"] if ocr else ref,
            **{f"ocr_{k}": v for k, v in fields.items()},
        )
        t = g.resolve(ref)
        if t not in g.nodes:
            continue
        inv = g.nodes[t].props
        eprops: dict = {}
        if fields.get("total") is not None and inv.get("total") is not None:
            eprops["total_diff"] = round(fields["total"] - inv["total"], 2)
        if fields.get("remit_account") and inv.get("remit_account"):
            eprops["remit_match"] = fields["remit_account"] == inv["remit_account"]
        g.link(p.name, "SCAN_OF", t, **eprops)
        g.nodes[p.name].props["period"] = inv.get("period")
        _link_period(g, p.name, inv.get("invoice_date"))
        if fields.get("total") is not None:
            inv["scan_total"] = fields["total"]
        if fields.get("remit_account"):
            inv["scan_remit_account"] = fields["remit_account"]


# ----------------------------------------------------------- derived facts
def _derive_balances(g: MemoryGraph) -> None:
    for n in list(g.nodes.values()):
        if n.type == "invoice":
            recs = g.in_edges(n.id, "RECORDS")
            postings = [e for e in recs if e.props.get("role") == "invoice_posting"]
            payments = [e for e in recs if e.props.get("role") == "payment"]
            settles = g.in_edges(n.id, "SETTLES")
            n.props.update(
                posted_count=len(postings),
                paid_count=len(payments),
                booked_amount=round(sum(e.props["amount"] for e in postings), 2),
                paid_amount=round(sum(e.props["amount"] for e in payments), 2),
                bank_settled=round(sum(e.props["amount"] for e in settles), 2),
                status="unrecorded" if not postings else "paid" if payments else "open",
            )
        elif n.type == "ar_invoice":
            recs = g.in_edges(n.id, "RECORDS")
            received = round(
                sum(e.props["amount"] for e in recs if e.props.get("role") == "receipt"), 2
            )
            amount = n.props.get("amount") or 0.0
            n.props.update(
                received=received,
                open_amount=round(amount - received, 2),
                status="paid"
                if amount and received >= amount - 0.005
                else "partial"
                if received
                else "open",
            )
    for n in g.nodes.values():
        if n.type == "customer":
            ars = [g.nodes[e.src] for e in g.in_edges(n.id, "BILLED_TO")]
            n.props.update(
                open_ar=round(sum(a.props.get("open_amount", 0) for a in ars), 2),
                invoices=len(ars),
                received=round(sum(a.props.get("received", 0) for a in ars), 2),
            )


def _derive_patterns(g: MemoryGraph) -> None:
    """Precedent agents can lean on: recurring charges and each vendor's usual account."""
    for v in [n for n in g.nodes.values() if n.type == "vendor"]:
        invs = [g.nodes[e.src] for e in g.in_edges(v.id, "ISSUED_BY")]
        by_amount: dict[float, list] = defaultdict(list)
        for i in invs:
            if i.props.get("total") is not None and i.props.get("period"):
                by_amount[i.props["total"]].append(i)
        for amt, group in by_amount.items():
            periods = sorted({i.props["period"] for i in group})
            if len(periods) < 2:
                continue
            y, mo = int(periods[-1][:4]), int(periods[-1][5:])
            nxt = f"{y + mo // 12}-{mo % 12 + 1:02d}"
            days = sorted(
                {int(i.props["invoice_date"][8:]) for i in group if i.props.get("invoice_date")}
            )
            pid = f"pattern:recurring:{v.id}:{int(amt)}"
            g.upsert_node(
                pid,
                type="pattern",
                kind="recurring_charge",
                vendor_id=v.id,
                amount=amt,
                periods=periods,
                expected_next_period=nxt,
                typical_day_of_month=days,
                invoices=[i.props["number"] for i in group],
                text=f"{v.props['name']} bills {amt:,.2f} every month",
            )
            g.link(pid, "ABOUT", v.id)
        accts = g.out_edges(v.id, "USES_ACCOUNT")
        if accts:
            usual = max(accts, key=lambda e: (e.props["count"], e.props["first_seen"]))
            v.props.update(
                usual_remit_account=usual.dst,
                remit_accounts=[e.dst for e in accts],
                invoice_count=len(invs),
            )
