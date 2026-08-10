# Script build grade3 complete question bank h? tr? nh?p, xu?t, ki?m tra ho?c b?o tr? d? li?u v? c?u h?nh c?a d? ?n.
from __future__ import annotations

import hashlib
import importlib.util
import json
import re
from collections import defaultdict
from pathlib import Path

from docx import Document
from docx.oxml.ns import qn


PROJECT = Path(__file__).resolve().parents[1]
DATA_ROOT = Path(r"C:\Users\WIND-OF-FALL\Pictures\DataToan\Lop_03")
BLUEPRINT = PROJECT / "content-theory" / "grade-3-theory-blueprint-detailed.json"
OUTPUT_DOCX = PROJECT / "output" / "doc" / "ngan_hang_cau_hoi_toan_3_canh_dieu.docx"
OUTPUT_TEX = PROJECT / "data" / "grade3_question_bank.tex"
REPORT_PATH = PROJECT / "output" / "doc" / "grade3_content_review_report.json"
ASSET_DIR = PROJECT / "output" / "grade3-master-assets"

BASE_SCRIPT = PROJECT / "scripts" / "build_grade5_question_bank.py"
spec = importlib.util.spec_from_file_location("question_bank_builder", BASE_SCRIPT)
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)
builder.GRADE = 3
builder.EXPECTED_LESSON_NUMBERS = list(range(1, 67))
builder.OUTPUT_DOCX = OUTPUT_DOCX
builder.OUTPUT_TEX = OUTPUT_TEX
builder.TEMP_IMAGES = ASSET_DIR / "compressed"

HELPER_SCRIPT = PROJECT / "scripts" / "build_grade2_complete_question_bank.py"
helper_spec = importlib.util.spec_from_file_location("grade2_complete_helpers", HELPER_SCRIPT)
helper = importlib.util.module_from_spec(helper_spec)
helper_spec.loader.exec_module(helper)


# H?m canonical_titles d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def canonical_titles() -> dict[int, str]:
    data = json.loads(BLUEPRINT.read_text(encoding="utf-8"))
    titles = {}
    number = 0
    for chapter in data["chapters"]:
        for lesson in chapter["lessons"]:
            number += 1
            titles[number] = helper.clean(lesson["lesson"])
    if len(titles) != 66:
        raise ValueError(f"Curriculum lớp 3 phải có 66 bài, tìm thấy {len(titles)}.")
    return titles


# H?m comparable_title_key d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def comparable_title_key(value: object) -> str:
    key = helper.title_key(value)
    key = re.sub(r"\s+trang\s+\d+\s*$", "", key)
    return helper.clean(key)


# H?m lesson_number_for_heading d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def lesson_number_for_heading(
    heading: str, canonical: dict[int, str], source: Path | None = None
) -> int:
    raw_key = helper.title_key(heading)
    if raw_key.startswith("tinh gia tri cua bieu thuc so"):
        if "trang 93" in raw_key:
            return 30
        if "tiep theo" in raw_key:
            return 29
        return 28
    if raw_key.startswith("chia cho so co mot chu so trong pham vi 100 000"):
        if "tiep theo" not in raw_key:
            return 56
        if source is not None and source.name.startswith("Bo20"):
            return 58
        return 57
    if raw_key.startswith("nhan voi so co mot chu so") and source is not None:
        if source.name.startswith("Bo18") and "khong nho" in raw_key:
            return 54
        if source.name.startswith("Bo19") and "co nho" in raw_key:
            return 55
    if raw_key == "xang ti met vuong":
        return 62
    key = comparable_title_key(heading)
    candidates = [
        number
        for number, title in canonical.items()
        if comparable_title_key(title) == key
    ]
    if len(candidates) == 1:
        return candidates[0]
    raise ValueError(f"Không map được tiêu đề lớp 3: {heading!r} (key={key!r})")


# H?m selected_files d?ng ?? l?a ch?n ph??ng ?n ph? h?p d?a tr?n tr?ng th?i v? ?u ti?n; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def selected_files() -> tuple[list[Path], list[Path]]:
    selected = []
    excluded = []
    for path in sorted(DATA_ROOT.glob("*.docx")):
        if path.name.startswith("~$"):
            continue
        preferred = path.with_name(f"{path.stem} (1).docx")
        if " (1).docx" not in path.name and preferred.exists():
            excluded.append(path)
        else:
            selected.append(path)
    return selected, excluded


# H?m is_question_heading d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def is_question_heading(text: str) -> bool:
    return bool(re.match(r"^cau\s+\d+", helper.ascii_text(text)))


# H?m save_images d?ng ?? c?p nh?t tr?ng th?i ho?c d? li?u theo quy t?c nghi?p v?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def save_images(paragraph, source: Path, question_number: int) -> list[Path]:
    blips = paragraph._p.xpath(".//a:blip")
    if not blips:
        return []
    source_hash = hashlib.sha1(str(source).encode("utf-8")).hexdigest()[:10]
    target_dir = ASSET_DIR / source_hash
    target_dir.mkdir(parents=True, exist_ok=True)
    result = []
    for image_index, blip in enumerate(blips, 1):
        relation_id = blip.get(qn("r:embed"))
        if not relation_id or relation_id not in paragraph.part.related_parts:
            continue
        part = paragraph.part.related_parts[relation_id]
        suffix = Path(str(part.partname)).suffix.lower() or ".png"
        target = target_dir / f"q{question_number:03d}-{image_index:02d}{suffix}"
        target.write_bytes(part.blob)
        result.append(target)
    return result


# H?m parse_answer_and_explanation d?ng ?? ph?n t?ch ??u v?o th?nh c?u tr?c c? th? s? d?ng; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def parse_answer_and_explanation(raw_text: str) -> tuple[str, str, str]:
    answer_key = ""
    answer_text = ""
    explanation = ""
    answer_match = re.search(
        r"Đáp án:\s*([A-D])(?:\.\s*([^\r\n]*))?",
        raw_text,
        re.IGNORECASE,
    )
    if answer_match:
        answer_key = answer_match.group(1).upper()
        answer_text = helper.clean(answer_match.group(2) or "")
    explanation_match = re.search(
        r"Lời giải:\s*(.+)",
        raw_text,
        re.IGNORECASE | re.DOTALL,
    )
    if explanation_match:
        explanation = helper.clean(explanation_match.group(1))
    return answer_key, answer_text, explanation


# H?m parse_docx d?ng ?? ph?n t?ch ??u v?o th?nh c?u tr?c c? th? s? d?ng; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def parse_docx(path: Path, canonical: dict[int, str]) -> list[dict]:
    document = Document(path)
    records = []
    current_lesson = None
    local_question_number = 0
    current = None

# H?m flush d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

    def flush() -> None:
        nonlocal current
        if current is None:
            return
        if not current["prompt"]:
            raise ValueError(
                f"Thiếu nội dung câu hỏi trong {path.name}, "
                f"bài {current_lesson}, câu {current['source_question_number']}."
            )
        if not current["answer_key"] and not current["answer_text"]:
            raise ValueError(f"Thiếu đáp án trong {path.name}: {current['prompt']}")
        current["lesson_number"] = current_lesson
        images = current.pop("_images")
        current["image_source_path"] = str(images[0]) if images else ""
        current["image_relative_path"] = (
            f"{path.name}/{images[0].name}" if images else ""
        )
        records.append(current)
        current = None

    for paragraph in document.paragraphs:
        raw_text = paragraph.text.strip()
        text = helper.clean(raw_text)
        style = paragraph.style.name
        if (
            text
            and (
                style in {"Heading 1", "Heading 2"}
                or re.match(r"^bai\s+\d+", helper.ascii_text(text))
            )
            and not is_question_heading(text)
        ):
            try:
                mapped = lesson_number_for_heading(text, canonical, path)
            except ValueError:
                mapped = None
            if mapped is not None:
                flush()
                current_lesson = mapped
                local_question_number = 0
                continue

        if text and is_question_heading(text):
            flush()
            if current_lesson is None:
                raise ValueError(f"Câu đứng trước tiêu đề bài trong {path.name}: {text}")
            local_question_number += 1
            current = {
                "source_kind": "main",
                "source_file": path.name,
                "source_question_number": local_question_number,
                "prompt": "",
                "raw_choices": [],
                "answer_key": "",
                "answer_text": "",
                "explanation": "",
                "difficulty": "EASY" if local_question_number <= 10 else "MEDIUM",
                "_images": [],
            }
            continue

        if current is None:
            continue
        current["_images"].extend(save_images(paragraph, path, len(records) + 1))
        if text.startswith("A."):
            current["raw_choices"].extend(helper.parse_choices(raw_text))
            continue
        if re.match(r"^[B-D]\.\s*", text):
            current["raw_choices"].extend(helper.parse_choices(raw_text))
            continue
        if "Đáp án:" in raw_text:
            answer_key, answer_text, explanation = parse_answer_and_explanation(raw_text)
            current["answer_key"] = answer_key or current["answer_key"]
            current["answer_text"] = answer_text or current["answer_text"]
            current["explanation"] = explanation or current["explanation"]
            continue
        if "Lời giải:" in raw_text:
            match = re.search(r"Lời giải:\s*(.+)", raw_text, re.IGNORECASE | re.DOTALL)
            if match:
                current["explanation"] = helper.clean(match.group(1))
            continue
        if (
            text
            and not current["prompt"]
            and style not in {"Image Caption", "Caption"}
        ):
            current["prompt"] = text
    flush()
    return records


# H?m record_signature d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def record_signature(record: dict) -> tuple:
    return (
        int(record["lesson_number"]),
        helper.normalized(record["prompt"]),
        tuple(
            sorted(helper.normalized(item["text"]) for item in record["choices"])
        ),
        helper.normalized(record["answer_text"]),
    )


# H?m main d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def main() -> None:
    if not DATA_ROOT.exists():
        raise FileNotFoundError(DATA_ROOT)
    canonical = canonical_titles()
    selected, excluded = selected_files()
    source_records = []
    source_counts = {}
    for path in selected:
        records = parse_docx(path, canonical)
        source_records.extend(records)
        source_counts[path.name] = len(records)
    if len(source_records) != 1320:
        raise ValueError(f"Nguồn lớp 3 phải có 1320 câu, tìm thấy {len(source_records)}.")

    corrections = []
    conversions = []
    for record in source_records:
        helper.math_repair(record, corrections)
        helper.finalize_choices(record, conversions)
        record["explanation"] = helper.explanation_for(record)

    deduplicated = []
    duplicates = []
    seen = {}
    for record in source_records:
        key = record_signature(record)
        if key in seen:
            duplicates.append(
                {
                    "excluded_source": record["source_file"],
                    "kept_source": seen[key]["source_file"],
                    "lesson_number": record["lesson_number"],
                    "prompt": record["prompt"],
                }
            )
            continue
        seen[key] = record
        deduplicated.append(record)

    grouped = defaultdict(list)
    for record in deduplicated:
        grouped[int(record["lesson_number"])].append(record)
    covered_lessons = sorted(grouped)
    missing_lessons = [
        {"lesson_number": number, "lesson_title": canonical[number]}
        for number in range(1, 67)
        if number not in grouped
    ]

    lessons = []
    remaining_issues = []
    for lesson_number in range(1, 67):
        questions = grouped[lesson_number]
        for index, record in enumerate(questions, 1):
            record["lesson_title"] = canonical[lesson_number]
            record["bank_index"] = index
            record["id"] = f"G3-L{lesson_number:03d}-Q{index:03d}"
            record["misconceptions"] = []
            for issue in helper.audit_record(record):
                remaining_issues.append(
                    {"question_id": record["id"], "issue": issue}
                )
        lessons.append(
            {
                "number": lesson_number,
                "title": canonical[lesson_number],
                "questions": questions,
            }
        )

    builder.validate_bank(lessons)
    if remaining_issues:
        raise ValueError(
            f"Còn {len(remaining_issues)} lỗi:\n"
            + json.dumps(remaining_issues[:30], ensure_ascii=False, indent=2)
        )

    report = {
        "grade": 3,
        "scope": "Pictures/DataToan/Lop_03; LYTHUYET chỉ có PDF SGK, không có file câu hỏi lớp 3.",
        "curriculum_lesson_count": 66,
        "covered_lesson_count": len(covered_lessons),
        "covered_lessons": covered_lessons,
        "missing_lesson_count": len(missing_lessons),
        "missing_lessons": missing_lessons,
        "question_count_before_deduplication": len(source_records),
        "question_count": len(deduplicated),
        "image_count": sum(bool(record["image_source_path"]) for record in deduplicated),
        "source_counts": source_counts,
        "duplicate_questions_removed": len(duplicates),
        "duplicate_details": duplicates,
        "math_corrections": corrections,
        "converted_or_completed_choices": len(conversions),
        "excluded_duplicate_files": [
            {
                "file": str(path),
                "reason": "Có bản (1) cùng tên gốc; giữ bản (1) đầy đủ tương đương.",
            }
            for path in excluded
        ],
        "checks": [
            "Ánh xạ tiêu đề vào Curriculum 66 bài lớp 3.",
            "Mỗi câu có đúng bốn lựa chọn khác nhau và một đáp án.",
            "Kiểm tra phép cộng, trừ, nhân, chia trực tiếp và số điền khuyết.",
            "Kiểm tra phương trình trong lựa chọn đúng.",
            "Loại trùng theo bài, nội dung, lựa chọn và đáp án.",
            "Kiểm tra ảnh nguồn tồn tại trước khi đóng gói.",
        ],
        "remaining_issues": remaining_issues,
        "status": "PASS",
    }
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    builder.write_tex(lessons)
    builder.write_docx(lessons)
    print(
        json.dumps(
            {
                "curriculum_lessons": 66,
                "covered_lessons": len(covered_lessons),
                "missing_lessons": len(missing_lessons),
                "questions_before_deduplication": len(source_records),
                "questions": len(deduplicated),
                "images": report["image_count"],
                "duplicates_removed": len(duplicates),
                "math_corrections": len(corrections),
                "choices_completed": len(conversions),
                "docx": str(OUTPUT_DOCX),
                "tex": str(OUTPUT_TEX),
                "report": str(REPORT_PATH),
            },
            ensure_ascii=False,
        )
    )


# Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u hi?n t?i.
if __name__ == "__main__":
    main()
