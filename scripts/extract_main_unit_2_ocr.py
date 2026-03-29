from __future__ import annotations

import json
from pathlib import Path

from rapidocr_onnxruntime import RapidOCR


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "main-unit-2-cards"
OUT_DIR = SOURCE_DIR / "ocr-raw"


def main() -> None:
    ocr = RapidOCR()
    OUT_DIR.mkdir(exist_ok=True)

    images = sorted(SOURCE_DIR.glob("*.jpg"))
    manifest: list[dict[str, object]] = []

    for image_path in images:
        result, _ = ocr(str(image_path))
        lines = []
        for item in result or []:
            box, text, score = item
            xs = [point[0] for point in box]
            ys = [point[1] for point in box]
            lines.append(
                {
                    "text": text,
                    "score": round(float(score), 4),
                    "center": {
                        "x": round(sum(xs) / len(xs), 1),
                        "y": round(sum(ys) / len(ys), 1),
                    },
                    "box": box,
                }
            )

        out_path = OUT_DIR / f"{image_path.stem}.ocr.json"
        out_path.write_text(
            json.dumps(
                {
                    "image": image_path.name,
                    "lineCount": len(lines),
                    "lines": lines,
                },
                indent=2,
            ),
            encoding="utf-8",
        )

        manifest.append(
            {
                "image": image_path.name,
                "ocr": out_path.name,
                "lineCount": len(lines),
            }
        )

    (OUT_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()