from pathlib import Path

from app.agents.feedback import Adjustment, FeedbackStore
from app.agents.recon.rules import RuleBook


def test_store_roundtrip(tmp_path: Path) -> None:
    store = FeedbackStore(tmp_path / "fb.json")
    a = store.add(Adjustment(agent="Cash & Reconciliation", kind="note", reason="hi"))
    store.add(Adjustment(agent="Other", kind="note"))
    assert len(store.for_agent("Cash & Reconciliation")) == 1
    # reload from disk
    store2 = FeedbackStore(tmp_path / "fb.json")
    assert len(store2.adjustments) == 2
    assert store2.remove(a.id) is True
    assert store2.remove("missing") is False
    assert len(store2.adjustments) == 1


def test_apply_rule_param() -> None:
    book = RuleBook.build(
        [
            Adjustment(
                agent="Cash & Reconciliation",
                kind="rule_param",
                payload={"date_window_days": 10, "tolerance_pct": 0.02},
            )
        ]
    )
    assert book.params.date_window_days == 10
    assert book.params.tolerance_pct == 0.02
    assert book.params.lump_sum_max_k == 4  # untouched


def test_apply_pin_and_block() -> None:
    book = RuleBook.build(
        [
            Adjustment(
                agent="Cash & Reconciliation",
                kind="pin_match",
                payload={"bank_ids": ["BK1"], "book_ids": ["JE-1"]},
            ),
            Adjustment(
                agent="Cash & Reconciliation",
                kind="block_match",
                payload={"pairs": [["BK2", "JE-2"]]},
            ),
        ]
    )
    assert book.pins == [(["BK1"], ["JE-1"])]
    assert ("BK2", "JE-2") in book.blocks
