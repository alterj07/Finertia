from pathlib import Path

from app.data.loaders import load_bank, load_emails, load_gl, load_invoices, norm_ref


def test_norm_ref() -> None:
    assert norm_ref("INV-7781") == "INV7781"
    assert norm_ref("  ar-1052 ") == "AR1052"
    assert norm_ref("") is None


def test_load_bank(data_dir: Path) -> None:
    bank = load_bank(data_dir)
    assert len(bank) == 55
    assert all(b.txn_id.startswith("BK") for b in bank)


def test_load_gl(data_dir: Path) -> None:
    gl = load_gl(data_dir)
    assert len(gl) == 252
    cash = [g for g in gl if g.account == "1000"]
    assert all(abs(g.amount - (g.debit - g.credit)) < 0.005 for g in cash)


def test_load_invoices(data_dir: Path) -> None:
    invoices = load_invoices(data_dir)
    assert len(invoices) == 34
    assert {i.source for i in invoices} == {"vendor_portal", "email_ingest", "edi_810"}
    assert all(i.invoice_number_norm for i in invoices)


def test_load_emails(data_dir: Path) -> None:
    emails = load_emails(data_dir)
    assert len(emails) == 19
    assert all(m.file.endswith(".eml") for m in emails)
    assert any(m.amounts for m in emails)
