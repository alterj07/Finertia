from fastapi import APIRouter, File, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse

from app.data.upload import UploadReport, inspect_files

router = APIRouter(prefix="/uploads", tags=["uploads"])


async def _read(files: list[UploadFile]) -> list[tuple[str, bytes]]:
    return [(f.filename or "file", await f.read()) for f in files]


def _known_vendors(request: Request) -> dict[str, str]:
    lake = request.app.state.lake
    if lake is None:
        return {}
    try:
        return {
            i.vendor_name: i.vendor_id
            for i in lake.invoices
            if i.vendor_name and i.vendor_id
        }
    except Exception:
        return {}


def _bad_request(report: UploadReport) -> JSONResponse:
    bad = [f.name for f in report.files if not f.ok]
    detail = (
        f"{len(bad)} incompatible file(s): {', '.join(bad)}"
        if bad
        else "no compatible data files found"
    )
    return JSONResponse(
        status_code=400, content={"detail": detail, "report": report.model_dump()}
    )


@router.post("/validate")
async def validate(
    request: Request, files: list[UploadFile] = File(...)
) -> UploadReport:
    try:
        report, _ = inspect_files(
            await _read(files), known_vendors=_known_vendors(request)
        )
    except ValueError as exc:
        raise HTTPException(413, str(exc)) from exc
    return report


@router.post("")
async def upload(request: Request, files: list[UploadFile] = File(...)) -> dict:
    try:
        report, batch = inspect_files(
            await _read(files), known_vendors=_known_vendors(request)
        )
    except ValueError as exc:
        raise HTTPException(413, str(exc)) from exc
    if not report.ok:
        return _bad_request(report)
    lake = request.app.state.lake
    if lake is None:
        raise HTTPException(503, "no data lake loaded")
    added = lake.add(batch)
    memory = request.app.state.memory
    memory.seed(lake)
    return {
        "report": report.model_dump(),
        "added": added,
        "backend": request.app.state.storage["backend"],
        "memory": memory.stats(),
    }
