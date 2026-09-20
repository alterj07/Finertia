from typing import Any

from fastapi import APIRouter, HTTPException, Request

from app.dashboard import screens

router = APIRouter(tags=["dashboard"])

_BUILDERS = {
    "command-center": screens.build_command_center,
    "payables": screens.build_payables,
    "receivables": screens.build_receivables,
    "reconciliation": screens.build_reconciliation,
    "close": screens.build_close,
    "forecast": screens.build_forecast,
    "audit": screens.build_audit,
}


def _parts(request: Request):
    lake = getattr(request.app.state, "lake", None)
    if lake is None:
        raise HTTPException(
            status_code=503,
            detail="Data lake not loaded — set DATA_DIR to a directory containing "
            "bank_transactions.csv, general_ledger.parquet, vendor_invoices.jsonl and emails/.",
        )
    return lake, request.app.state.memory


@router.get("/dashboard/{screen}")
def get_dashboard(screen: str, request: Request) -> dict[str, Any]:
    builder = _BUILDERS.get(screen)
    if builder is None:
        raise HTTPException(404, f"unknown dashboard screen {screen!r}")
    lake, memory = _parts(request)
    return builder(lake, memory)


@router.get("/dashboard/payables/invoices/{key}")
def get_payables_invoice(key: str, request: Request) -> dict[str, Any]:
    lake, memory = _parts(request)
    out = screens.build_payables_invoice(lake, memory, key)
    if out is None:
        raise HTTPException(404, f"no payable finding for {key!r}")
    return out
