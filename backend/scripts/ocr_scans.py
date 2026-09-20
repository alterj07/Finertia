"""Run OCR over data/scanned_invoices/*.png and write the results to ocr.json
next to the images.

    uv run --no-project --with rapidocr-onnxruntime --with pillow \
        python scripts/ocr_scans.py [data_dir]

RapidOCR (ONNX, CPU) is deterministic for a given image and model version.
The app never calls an OCR engine at runtime: ingest reads ocr.json, so
re-run this script only when a scan is added or changed, and commit the file.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path


def main() -> None:
    from rapidocr_onnxruntime import RapidOCR

    default = Path(__file__).resolve().parents[2] / "data"
    data_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else default
    folder = data_dir / "scanned_invoices"
    engine = RapidOCR()
    out: dict[str, dict] = {}
    for png in sorted(folder.glob("*.png")):
        result, _ = engine(str(png))
        # Order lines top-to-bottom, then left-to-right, so text reads naturally.
        boxes = sorted(result or [], key=lambda r: (round(r[0][0][1] / 12), r[0][0][0]))
        lines = [
            {
                "text": r[1],
                "conf": round(float(r[2]), 4),
                "y": int(r[0][0][1]),
                "x": int(r[0][0][0]),
            }
            for r in boxes
        ]
        out[png.name] = {"lines": lines, "text": "\n".join(ln["text"] for ln in lines)}
        print(f"{png.name}: {len(lines)} lines")
    (folder / "ocr.json").write_text(json.dumps(out, indent=1, ensure_ascii=False))
    print(f"wrote {folder / 'ocr.json'}")


if __name__ == "__main__":
    main()
