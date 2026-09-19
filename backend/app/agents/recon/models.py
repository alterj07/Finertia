from typing import Any

from pydantic import BaseModel


class RuleParams(BaseModel):
    date_window_days: int = 5
    lump_sum_window_days: int = 3
    lump_sum_max_k: int = 4
    lump_sum_max_candidates: int = 14
    tolerance_pct: float = 0.01
    tolerance_window_days: int = 3


class Match(BaseModel):
    method: str
    bank: list[str]
    book: list[str]
    note: str = ""


class ReconSummary(BaseModel):
    opening: float
    bank_balance: float
    book_balance: float
    adjusted_bank: float
    adjusted_book: float
    difference: float
    matched: dict[str, int]
    unexplained_bank: list[str]
    unexplained_book: list[str]

    def to_dict(self) -> dict[str, Any]:
        return self.model_dump()
