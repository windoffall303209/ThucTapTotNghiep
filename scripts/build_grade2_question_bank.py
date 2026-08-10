# Script build grade2 question bank h? tr? nh?p, xu?t, ki?m tra ho?c b?o tr? d? li?u v? c?u h?nh c?a d? ?n.
from pathlib import Path
import importlib.util


PROJECT = Path(__file__).resolve().parents[1]
BASE_SCRIPT = PROJECT / "scripts" / "build_grade5_question_bank.py"

spec = importlib.util.spec_from_file_location("question_bank_builder", BASE_SCRIPT)
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)

builder.GRADE = 2
builder.EXPECTED_LESSON_NUMBERS = list(range(1, 52))
builder.MAIN_IMAGE_ROOT = (
    builder.SOURCE_ROOT / "output" / "toan_2_canh_dieu" / "anh_cau_hoi"
)
builder.EXTRA_IMAGE_ROOT = builder.MAIN_IMAGE_ROOT
builder.OUTPUT_DOCX = (
    PROJECT / "output" / "doc" / "ngan_hang_cau_hoi_toan_2_canh_dieu.docx"
)
builder.OUTPUT_TEX = PROJECT / "data" / "grade2_question_bank.tex"
builder.TEMP_IMAGES = (
    builder.SOURCE_ROOT / "tmp" / "docs" / "grade2_bank_compressed"
)


# H?m grade2_source_files d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def grade2_source_files():
    first = builder.SOURCE_TMP / "toan2_canhdieu_noi_dung.md"
    remaining = sorted(builder.SOURCE_TMP.glob("toan2_bai*.md"))
    return [(first, "main")] + [(path, "main") for path in remaining]


builder.source_files = grade2_source_files


# Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u hi?n t?i.
if __name__ == "__main__":
    builder.main()
