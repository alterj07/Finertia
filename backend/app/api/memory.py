from fastapi import APIRouter, Request

router = APIRouter(prefix="/memory", tags=["memory"])


@router.get("/graph")
def get_graph(request: Request) -> dict:
    return request.app.state.memory.to_dict()


@router.get("/findings")
def get_findings(
    request: Request, code: str | None = None, agent: str | None = None
) -> list[dict]:
    return [
        f.model_dump(mode="json")
        for f in request.app.state.memory.recall(code=code, agent=agent)
    ]


@router.post("/reset")
def reset(request: Request) -> dict:
    request.app.state.memory.reset()
    return {"status": "ok"}
