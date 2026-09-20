"""Read-only financial scenario analysis with a deliberately small LLM payload."""

import json

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

router = APIRouter(tags=["flight-simulator"])


class SimulationRequest(BaseModel):
    lever: str = Field(pattern="^(collections|payables|opex|debt|capex)$")
    amount: float = Field(gt=0, le=10_000_000)
    timing_days: int = Field(ge=0, le=90)
    cash_delta: float
    minimum_cash_delta: float


def _fallback(req: SimulationRequest) -> dict[str, str]:
    if req.lever == "collections" and req.cash_delta > 0:
        verdict = "good"
        recommendation = "Proceed if collection dates are confirmed."
        why = "Earlier cash improves near-term liquidity without adding spend."
    elif req.lever == "payables" and req.cash_delta > 0:
        verdict = "neutral"
        recommendation = "Use selectively; protect critical vendors."
        why = "Liquidity improves, but delayed payments can create supplier risk."
    elif req.minimum_cash_delta < -25_000:
        verdict = "bad"
        recommendation = "Do not proceed without offsetting cash actions."
        why = "The scenario lowers the projected cash floor materially."
    else:
        verdict = "neutral"
        recommendation = "Proceed only with a measurable return threshold."
        why = "The cash impact is manageable but needs a business-case check."
    return {"verdict": verdict, "recommendation": recommendation, "why": why, "source": "rules"}


@router.post("/flight-simulator/analyze")
def analyze(req: SimulationRequest, request: Request) -> dict[str, str]:
    """Return a 3-field opinion from a compact, derived scenario summary."""
    fallback = _fallback(req)
    llm = request.app.state.llm
    if not llm.available:
        return fallback

    # Fixed labels + six values: compact input, deterministic temperature, bounded output.
    prompt = (
        f"lever={req.lever};amount={req.amount:.0f};days={req.timing_days};"
        f"cash_delta={req.cash_delta:.0f};floor_delta={req.minimum_cash_delta:.0f}."
    )
    system = (
        "CFO scenario classifier. Return JSON only: "
        '{"verdict":"good|bad|neutral","recommendation":"<=12 words","why":"<=16 words"}. '
        "Use only supplied numbers. No disclaimer."
    )
    try:
        raw = llm.complete(prompt, system=system, json_mode=True, max_tokens=90)
        result = json.loads(raw)
        if result.get("verdict") in {"good", "bad", "neutral"} and all(
            isinstance(result.get(k), str) for k in ("recommendation", "why")
        ):
            return {
                "verdict": result["verdict"],
                "recommendation": result["recommendation"][:120],
                "why": result["why"][:180],
                "source": "openai",
            }
    except (json.JSONDecodeError, Exception):
        pass
    return fallback
