"""Nhập ngân hàng Toán 5 từ DOCX chứa các dòng DBJSON.

Ví dụ kiểm tra:
  py scripts/import_grade5_question_bank_docx.py \
    output/doc/ngan_hang_cau_hoi_lop_5_phan_2_import.docx --validate-only
"""
# Script import grade5 question bank docx h? tr? nh?p, xu?t, ki?m tra ho?c b?o tr? d? li?u v? c?u h?nh c?a d? ?n.

import base64
import hashlib
import json
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

from docx import Document


ROOT = Path(__file__).resolve().parents[1]


# H?m main d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def main():
    if len(sys.argv) < 2:
        raise SystemExit("Cần truyền đường dẫn file DOCX.")
    source = Path(sys.argv[1]).resolve()
    if not source.exists():
        raise FileNotFoundError(source)
    source_lines = [
        paragraph.text.strip()
        for paragraph in Document(source).paragraphs
        if paragraph.text.strip().startswith("% DBJSON ")
    ]
    if not source_lines:
        raise RuntimeError("File Word không có dòng DBJSON.")
    payloads = [
        json.loads(base64.b64decode(line[9:]).decode("utf-8"))
        for line in source_lines
    ]
    with tempfile.TemporaryDirectory(prefix="grade5-part2-import-") as temp_dir:
        temp_root = Path(temp_dir)
        with zipfile.ZipFile(source) as archive:
            packaged = {}
            for entry in archive.namelist():
                if not entry.startswith("word/media/"):
                    continue
                data = archive.read(entry)
                packaged[hashlib.sha256(data).hexdigest()] = (entry, data)
            for payload in payloads:
                for area in (payload.get("content", {}), payload.get("explanation", {})):
                    for image in area.get("images", []):
                        package_sha256 = image.get("package_sha256")
                        if not package_sha256:
                            continue
                        if package_sha256 not in packaged:
                            raise RuntimeError(
                                f"File Word thiếu ảnh đóng gói có mã: {package_sha256}"
                            )
                        entry, data = packaged[package_sha256]
                        target = temp_root / f"{package_sha256}{Path(entry).suffix}"
                        target.write_bytes(data)
                        image["source_path"] = str(target.resolve())
        lines = [
            "% DBJSON "
            + base64.b64encode(
                json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
            ).decode("ascii")
            for payload in payloads
        ]
        temp_path = temp_root / "grade5_question_bank_part2.tex"
        temp_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
        command = [
            "node",
            str(ROOT / "scripts" / "import_grade5_question_bank_tex.js"),
            f"--input={temp_path}",
            *sys.argv[2:],
        ]
        print(
            f"Đã đọc {len(lines)} payload và giải nén ảnh đóng gói từ {source.name}."
        )
        result = subprocess.run(command, cwd=ROOT, check=False)
        raise SystemExit(result.returncode)


# Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u hi?n t?i.
if __name__ == "__main__":
    main()
