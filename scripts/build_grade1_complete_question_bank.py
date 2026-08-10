# Script build grade1 complete question bank h? tr? nh?p, xu?t, ki?m tra ho?c b?o tr? d? li?u v? c?u h?nh c?a d? ?n.
from __future__ import annotations

import importlib.util
import hashlib
import json
import random
import re
import shutil
import zipfile
from collections import defaultdict
from pathlib import Path

from docx import Document
from docx.oxml.ns import qn
from docx.oxml.table import CT_Tbl
from docx.oxml.text.paragraph import CT_P
from docx.table import Table
from docx.text.paragraph import Paragraph


PROJECT = Path(__file__).resolve().parents[1]
SOURCE_ROOT = Path(r"C:\Users\WIND-OF-FALL\Documents\Project\LYTHUYET")
DATA_TOAN_ROOT = Path(r"C:\Users\WIND-OF-FALL\Pictures\DataToan\Lop_01")
OUTPUT_DOCX = PROJECT / "output" / "doc" / "ngan_hang_cau_hoi_toan_1_canh_dieu_da_soat.docx"
OUTPUT_TEX = PROJECT / "data" / "grade1_question_bank_reviewed.tex"
REPORT_PATH = PROJECT / "output" / "doc" / "grade1_content_review_report.json"
ASSET_DIR = PROJECT / "output" / "grade1-master-assets"

PACK_JSON = PROJECT / "output" / "grade1-question-pack" / "questions.json"
GENERATED_JSON = PROJECT / "output" / "doc" / "grade-1-generated-questions.json"
AI_CHAPTER1_JSON = PROJECT / "output" / "doc" / "grade-1-generated-questions-ai-chuong-1.json"

TOPIC1_DOCX = SOURCE_ROOT / "bai_tap_lop_1_chu_de_01_ai_v2_day_du.docx"
TOPIC1_LEGACY_DOCX = SOURCE_ROOT / "bai_tap_lop_1_chu_de_01_ai_v1.docx"
POSITION_DOCX = SOURCE_ROOT / "output" / "doc" / "bai_tap_lop_1_bai_01_vi_tri_ai_tung_cau.docx"
TOPIC2_DOCX = SOURCE_ROOT / "output" / "doc" / "bai_tap_toan_lop_1_chu_de_02_cap_nhat.docx"

DATA_TOAN_TARGET_FILES = [
    "Toan_1_Canh_Dieu_Bai_22-24_45_cau.docx",
    "Ngan_hang_cau_hoi_Toan_1_Canh_Dieu_Bai_22-24_co_anh_AI.docx",
    "Ngan_hang_cau_hoi_Toan_1_Canh_Dieu_Bai_25-27_co_anh_AI.docx",
    "Ngan_hang_cau_hoi_Toan_1_Canh_Dieu_Bai_28-30_co_anh_AI.docx",
    "Ngan_hang_cau_hoi_Toan_1_Canh_Dieu_Bai_31-33_co_anh_AI(1).docx",
    "Ngan_hang_cau_hoi_Toan_1_Bai_33_31.docx",
    "Ngan_hang_cau_hoi_Toan_1_Bai_36_34.docx",
    "Ngan_hang_cau_hoi_Toan_1_Bai_39_37.docx",
]

BASE_SCRIPT = PROJECT / "scripts" / "build_grade5_question_bank.py"
spec = importlib.util.spec_from_file_location("question_bank_builder", BASE_SCRIPT)
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)
builder.GRADE = 1
builder.EXPECTED_LESSON_NUMBERS = list(range(1, 40))
builder.OUTPUT_DOCX = OUTPUT_DOCX
builder.OUTPUT_TEX = OUTPUT_TEX
builder.TEMP_IMAGES = ASSET_DIR / "compressed"

TOPIC1_FOLDERS = [
    "bai_01_vi_tri",
    "bai_02_cac_hinh_co_ban",
    "bai_03_cac_so_1_2_3",
    "bai_04_cac_so_4_5_6",
    "bai_05_cac_so_7_8_9",
    "bai_06_so_0",
    "bai_07_so_10",
    "bai_09_nhieu_hon_it_hon_bang_nhau",
    "bai_10_dau_nho_hon_bang",
]
TOPIC2_FOLDERS = [
    "bai_01_lam_quen_phep_cong_dau_cong",
    "bai_02_lam_quen_phep_cong_tiep_theo",
    "bai_03_phep_cong_trong_pham_vi_6",
    "bai_04_phep_cong_trong_pham_vi_6_tiep_theo",
    "bai_06_phep_cong_trong_pham_vi_10",
    "bai_08_phep_cong_trong_pham_vi_10_tiep_theo",
    "bai_10_khoi_hop_chu_nhat_khoi_lap_phuong",
    "bai_11_lam_quen_phep_tru_dau_tru",
    "bai_12_phep_tru_trong_pham_vi_6",
    "bai_14_phep_tru_trong_pham_vi_6_tiep_theo",
    "bai_16_phep_tru_trong_pham_vi_10",
    "bai_18_phep_tru_trong_pham_vi_10_tiep_theo",
]


# H?m clean d?ng ?? chu?n h?a v? l?m s?ch d? li?u ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def clean(value: object) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


# H?m signature_text d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def signature_text(value: object) -> str:
    return clean(value).casefold().replace("−", "-")


# H?m semantic_choice_key d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def semantic_choice_key(value: object) -> str:
    text = signature_text(value).rstrip(" .;,:!?")
    words = text.split()
    if len(words) <= 4 and not any(token in text for token in ("nhiều", "ít", "bằng")):
        for direction in ("trên", "dưới", "trái", "phải", "trước", "sau", "giữa"):
            if direction in text:
                return f"direction:{direction}"
    return text


# H?m natural_key d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def natural_key(path: Path) -> list[object]:
    return [int(part) if part.isdigit() else part.casefold() for part in re.split(r"(\d+)", path.name)]


# H?m canonical_lessons d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def canonical_lessons() -> list[str]:
    data = json.loads(GENERATED_JSON.read_text(encoding="utf-8"))
    result: list[str] = []
    seen: set[tuple[int, int]] = set()
    for question in data["questions"]:
        key = (int(question["chapter_index"]), int(question["lesson_index"]))
        if key not in seen:
            seen.add(key)
            result.append(clean(question["lesson"]))
    if len(result) != 39:
        raise ValueError(f"Danh mục lớp 1 phải có 39 bài, hiện có {len(result)}.")
    return result


# H?m is_question_line d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def is_question_line(text: str) -> bool:
    return (
        len(text) > 6
        and text[0] == "C"
        and text[3:4] == " "
        and text[4:5].isdigit()
        and (":" in text[:12] or "." in text[:12])
    )


# H?m strip_question_number d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def strip_question_number(text: str) -> str:
    colon = text.find(":")
    dot = text.find(".")
    positions = [item for item in (colon, dot) if 0 <= item < 12]
    return clean(text[min(positions) + 1 :] if positions else text)


# H?m parse_choice_line d?ng ?? ph?n t?ch ??u v?o th?nh c?u tr?c c? th? s? d?ng; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def parse_choice_line(line: str) -> list[dict]:
    matches = list(re.finditer(r"(?<!\S)([A-D])\.\s*", line))
    choices = []
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(line)
        text = clean(line[match.end() : end])
        if text:
            choices.append({"key": match.group(1), "text": text})
    return choices


# H?m parse_answer d?ng ?? ph?n t?ch ??u v?o th?nh c?u tr?c c? th? s? d?ng; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def parse_answer(line: str) -> tuple[str, str]:
    answer = clean(line.split(":", 1)[1] if ":" in line else line)
    match = re.match(r"^([A-D])\.\s*(.+)$", answer)
    if match:
        return match.group(1), clean(match.group(2))
    return "", answer


# H?m iter_document_blocks d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def iter_document_blocks(document: Document):
    for child in document.element.body.iterchildren():
        if isinstance(child, CT_P):
            yield Paragraph(child, document)
        elif isinstance(child, CT_Tbl):
            yield Table(child, document)


# H?m save_data_toan_images d?ng ?? c?p nh?t tr?ng th?i ho?c d? li?u theo quy t?c nghi?p v?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def save_data_toan_images(
    paragraph: Paragraph,
    source: Path,
    question_number: int,
    start_index: int,
) -> list[Path]:
    blips = paragraph._p.xpath(".//a:blip")
    if not blips:
        return []
    source_hash = hashlib.sha1(str(source).encode("utf-8")).hexdigest()[:10]
    target_dir = ASSET_DIR / "data-toan" / source_hash
    target_dir.mkdir(parents=True, exist_ok=True)
    images = []
    for offset, blip in enumerate(blips):
        relation_id = blip.get(qn("r:embed"))
        if not relation_id or relation_id not in paragraph.part.related_parts:
            continue
        part = paragraph.part.related_parts[relation_id]
        suffix = Path(str(part.partname)).suffix.lower() or ".png"
        target = target_dir / (
            f"q{question_number:03d}-{start_index + offset:02d}{suffix}"
        )
        target.write_bytes(part.blob)
        images.append(target)
    return images


# H?m parse_data_toan_bank d?ng ?? ph?n t?ch ??u v?o th?nh c?u tr?c c? th? s? d?ng; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def parse_data_toan_bank(path: Path) -> list[dict]:
    document = Document(path)
    records: list[dict] = []
    current_lesson = 0
    local_question_number = 0
    current: dict | None = None

# H?m flush d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

    def flush() -> None:
        nonlocal current
        if current is None:
            return
        if not current["prompt"]:
            raise ValueError(
                f"{path.name}: bài {current_lesson}, câu "
                f"{current['source_question_number']} thiếu nội dung."
            )
        if not current["answer_key"] and not current["answer_text"]:
            raise ValueError(f"{path.name}: thiếu đáp án cho {current['prompt']!r}.")
        images = current.pop("_images")
        current["image_source_path"] = str(images[0]) if images else ""
        current["image_relative_path"] = (
            f"{path.name}/{images[0].name}" if images else ""
        )
        records.append(current)
        current = None

    for block in iter_document_blocks(document):
        if isinstance(block, Table):
            if current is not None:
                table_text = " ".join(
                    clean(cell.text)
                    for row in block.rows
                    for cell in row.cells
                    if clean(cell.text)
                )
                current["raw_choices"].extend(parse_choice_line(table_text))
            continue

        raw_text = block.text.strip()
        text = clean(raw_text)
        style = block.style.name
        lesson_match = re.match(r"^BÀI\s+(\d+)\s*[:.]", text, re.IGNORECASE)
        if lesson_match:
            flush()
            current_lesson = int(lesson_match.group(1))
            if not 22 <= current_lesson <= 39:
                raise ValueError(
                    f"{path.name}: bài ngoài phạm vi 22-39: {current_lesson}."
                )
            local_question_number = 0
            continue

        question_match = re.match(r"^Câu\s+(\d+)(?:[.:]\s*(.*))?$", text, re.IGNORECASE)
        if question_match and (
            style in {"Question", "Heading 3"} or not question_match.group(2)
        ):
            flush()
            if not current_lesson:
                continue
            local_question_number += 1
            prompt = clean(question_match.group(2) or "")
            current = {
                "lesson_number": current_lesson,
                "source_kind": "main",
                "source_file": path.name,
                "source_question_number": local_question_number,
                "prompt": prompt,
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
        current["_images"].extend(
            save_data_toan_images(
                block,
                path,
                len(records) + 1,
                len(current["_images"]) + 1,
            )
        )
        if not text:
            continue
        if not current["prompt"] and is_question_line(text):
            current["prompt"] = strip_question_number(text)
            continue
        if text.lower().startswith("câu hỏi:"):
            current["prompt"] = clean(text.split(":", 1)[1])
            continue
        if text.lower().startswith("lựa chọn:") or style == "Options":
            current["raw_choices"].extend(parse_choice_line(text))
            continue
        if re.match(r"^[A-D]\.\s*", text):
            current["raw_choices"].extend(parse_choice_line(text))
            continue
        if text.lower().startswith("đáp án:"):
            answer_key, answer_text = parse_answer(text)
            current["answer_key"] = answer_key
            current["answer_text"] = answer_text
            continue
        if text.lower().startswith("lời giải:"):
            current["explanation"] = clean(text.split(":", 1)[1])
            continue
        if (
            not current["prompt"]
            and not text.lower().startswith(("trả lời:", "hình minh họa"))
        ):
            current["prompt"] = text
    flush()
    return records


# H?m extract_position_images d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def extract_position_images() -> list[Path]:
    target = ASSET_DIR / "position-variants"
    target.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(POSITION_DOCX) as archive:
        members = [
            name
            for name in archive.namelist()
            if name.startswith("word/media/") and not name.endswith("/")
        ]
        for index, member in enumerate(sorted(members, key=lambda item: natural_key(Path(item))), 1):
            suffix = Path(member).suffix.lower() or ".png"
            destination = target / f"question-{index:02d}{suffix}"
            destination.write_bytes(archive.read(member))
    images = sorted(target.iterdir(), key=natural_key)
    if len(images) != 15:
        raise ValueError(f"File câu vị trí phải có 15 ảnh, hiện có {len(images)}.")
    return images


# H?m parse_word_bank d?ng ?? ph?n t?ch ??u v?o th?nh c?u tr?c c? th? s? d?ng; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def parse_word_bank(
    path: Path,
    lesson_numbers: list[int],
    source_kind: str,
    image_resolver,
) -> list[dict]:
    records: list[dict] = []
    lesson_index = -1
    question_index = 0
    current: dict | None = None

# H?m flush d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

    def flush() -> None:
        nonlocal current
        if current is None:
            return
        if not current["answer_text"]:
            raise ValueError(f"Thiếu đáp án trong {path.name}: {current['prompt']}")
        current["image_source_path"] = str(
            image_resolver(lesson_index, question_index) or ""
        )
        current["image_relative_path"] = (
            Path(current["image_source_path"]).name if current["image_source_path"] else ""
        )
        records.append(current)
        current = None

    for paragraph in Document(path).paragraphs:
        text = clean(paragraph.text)
        if not text:
            continue
        if text.startswith("Bài ") and "-" in text:
            flush()
            lesson_index += 1
            question_index = 0
            continue
        if is_question_line(text):
            flush()
            if lesson_index < 0 and len(lesson_numbers) == 1:
                lesson_index = 0
            question_index += 1
            current = {
                "lesson_number": lesson_numbers[lesson_index],
                "source_kind": source_kind,
                "source_file": path.name,
                "source_question_number": question_index,
                "prompt": strip_question_number(text),
                "raw_choices": [],
                "answer_key": "",
                "answer_text": "",
                "explanation": "",
                "difficulty": "EASY" if question_index <= 10 else "MEDIUM",
            }
            continue
        if current is None:
            continue
        if text.startswith("Đáp án"):
            current["answer_key"], current["answer_text"] = parse_answer(text)
        elif text.startswith("A."):
            current["raw_choices"] = parse_choice_line(text)
        elif text.startswith("Lời giải"):
            current["explanation"] = clean(text.split(":", 1)[1] if ":" in text else text)
    flush()

    if lesson_index + 1 != len(lesson_numbers):
        raise ValueError(
            f"{path.name}: tìm thấy {lesson_index + 1} bài, mong đợi {len(lesson_numbers)}."
        )
    return records


# H?m topic1_image d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def topic1_image(lesson_index: int, question_index: int) -> Path | None:
    folder = (
        SOURCE_ROOT
        / "anh_bai_tap_lop_1_ai_v1"
        / "chu_de_01"
        / TOPIC1_FOLDERS[lesson_index]
    )
    images = sorted(folder.glob("*.*"), key=natural_key)
    positions = {1: 0}
    if len(images) >= 3:
        positions = {1: 0, 6: 1, 11: 2}
    selected = positions.get(question_index)
    return images[selected] if selected is not None and selected < len(images) else None


# H?m topic2_image d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def topic2_image(lesson_index: int, question_index: int) -> Path | None:
    folder = (
        SOURCE_ROOT
        / "anh_bai_tap_lop_1_ai_khong_chu_v3"
        / "chu_de_02"
        / TOPIC2_FOLDERS[lesson_index]
    )
    images = sorted(folder.glob("*.*"), key=natural_key)
    return images[question_index - 1] if question_index <= len(images) else None


# H?m position_image_resolver d?ng ?? l?a ch?n ph??ng ?n ph? h?p d?a tr?n tr?ng th?i v? ?u ti?n; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def position_image_resolver(images: list[Path]):
    return lambda _lesson_index, question_index: images[question_index - 1]


# H?m records_from_pack d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def records_from_pack() -> list[dict]:
    data = json.loads(PACK_JSON.read_text(encoding="utf-8"))
    result = []
    for lesson in data["lessons"]:
        lesson_number = int(lesson["lesson_id"])
        for index, question in enumerate(lesson["questions"], 1):
            raw_choices = [{"key": "A", "text": clean(question["answer"])}]
            raw_choices.extend(
                {
                    "key": chr(66 + mistake_index),
                    "text": clean(item["wrong_answer"]),
                }
                for mistake_index, item in enumerate(question.get("common_mistakes", []))
            )
            result.append(
                {
                    "lesson_number": lesson_number,
                    "source_kind": "supplement",
                    "source_file": PACK_JSON.name,
                    "source_question_number": index,
                    "prompt": clean(question["question"]),
                    "raw_choices": raw_choices,
                    "answer_key": "A",
                    "answer_text": clean(question["answer"]),
                    "explanation": "",
                    "difficulty": (
                        "MEDIUM" if clean(question.get("difficulty")) == "Vận dụng" else "EASY"
                    ),
                    "image_source_path": str(
                        (PACK_JSON.parent / question["image_file"]).resolve()
                    ),
                    "image_relative_path": question["image_file"].replace("\\", "/"),
                }
            )
    return result


# H?m records_from_generated d?ng ?? x?y d?ng k?t qu? t? c?c ngu?n d? li?u v? quy t?c li?n quan; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def records_from_generated() -> list[dict]:
    data = json.loads(GENERATED_JSON.read_text(encoding="utf-8"))
    lesson_lookup: dict[tuple[int, int], int] = {}
    next_lesson = 1
    result = []
    for index, question in enumerate(data["questions"], 1):
        key = (int(question["chapter_index"]), int(question["lesson_index"]))
        if key not in lesson_lookup:
            lesson_lookup[key] = next_lesson
            next_lesson += 1
        result.append(
            {
                "lesson_number": lesson_lookup[key],
                "source_kind": "supplement",
                "source_file": GENERATED_JSON.name,
                "source_question_number": index,
                "prompt": clean(question["content"]["text"]),
                "raw_choices": [
                    {"key": clean(choice["key"]), "text": clean(choice["text"])}
                    for choice in question["choices"]
                ],
                "answer_key": clean(question["correct_answer"]),
                "answer_text": clean(question["answer_text"]),
                "explanation": clean(question.get("explanation", {}).get("text")),
                "difficulty": clean(question.get("difficulty")) or "EASY",
                "image_source_path": str(Path(question["image_path"]).resolve()),
                "image_relative_path": Path(question["image_path"]).name,
            }
        )
    return result


# H?m numeric_distractors d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def numeric_distractors(answer: int) -> list[str]:
    candidates = [
        max(0, answer - 1),
        answer + 1,
        max(0, answer - 2),
        answer + 2,
        0,
        1,
    ]
    return [str(value) for value in dict.fromkeys(candidates) if value != answer]


# H?m distractors_for d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def distractors_for(prompt: str, answer: str) -> list[str]:
    normalized_answer = signature_text(answer)
    if re.fullmatch(r"-?\d+", answer):
        return numeric_distractors(int(answer))
    if answer in {"<", ">", "="}:
        return [item for item in ("<", ">", "=") if item != answer]
    direction_pool = [
        "Trên",
        "Dưới",
        "Bên trái",
        "Bên phải",
        "Phía trước",
        "Phía sau",
        "Ở giữa",
    ]
    if any(word in normalized_answer for word in ("trên", "dưới", "trái", "phải", "trước", "sau", "giữa")):
        return [item for item in direction_pool if signature_text(item) != normalized_answer]
    shape_pool = [
        "Hình vuông",
        "Hình tròn",
        "Hình tam giác",
        "Hình chữ nhật",
        "Khối lập phương",
        "Khối hộp chữ nhật",
    ]
    if "hình" in normalized_answer or "khối" in normalized_answer:
        return [item for item in shape_pool if signature_text(item) != normalized_answer]
    compare_pool = ["Nhiều hơn", "Ít hơn", "Bằng nhau"]
    if any(word in normalized_answer for word in ("nhiều hơn", "ít hơn", "bằng nhau")):
        return [item for item in compare_pool if signature_text(item) != normalized_answer]
    number_match = re.search(r"(\d+)", answer)
    if number_match:
        number = int(number_match.group(1))
        return [
            answer.replace(number_match.group(1), item, 1)
            for item in numeric_distractors(number)[:4]
        ]
    if normalized_answer in {"đúng", "sai"}:
        return ["Sai" if normalized_answer == "đúng" else "Đúng", "Không xác định"]
    if any(word in signature_text(prompt) for word in ("vẽ", "tô màu", "khoanh", "nối")):
        return [
            "Thực hiện ít hơn yêu cầu một đơn vị",
            "Thực hiện nhiều hơn yêu cầu một đơn vị",
            "Không thực hiện yêu cầu",
        ]
    return [
        "Kết quả ngược lại với đáp án đúng",
        "Không đủ dữ kiện",
        "Một phương án khác không phù hợp",
    ]


# H?m explanation_for d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def explanation_for(prompt: str, answer: str) -> str:
    text = prompt.replace("−", "-")
    blank_patterns = [
        (r"(\d+)\s*\+\s*_+\s*=\s*(\d+)", lambda left, total: total - left),
        (r"_+\s*\+\s*(\d+)\s*=\s*(\d+)", lambda right, total: total - right),
        (r"(\d+)\s*-\s*_+\s*=\s*(\d+)", lambda left, result: left - result),
    ]
    for pattern, solve in blank_patterns:
        match = re.search(pattern, text)
        if match and answer.lstrip("-").isdigit():
            value = solve(int(match.group(1)), int(match.group(2)))
            if value == int(answer):
                return f"Số cần điền là {answer} để phép tính đúng."
    direct = re.search(r"(\d+)\s*([+-])\s*(\d+)", text)
    if direct and answer.lstrip("-").isdigit():
        left, operator, right = direct.groups()
        value = int(left) + int(right) if operator == "+" else int(left) - int(right)
        if value == int(answer):
            return f"Ta tính {left} {operator} {right} = {answer}."
    return f"Dựa vào dữ kiện của câu hỏi, đáp án đúng là: {answer}."


# H?m finalize_choices d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def finalize_choices(record: dict, repair_log: list[dict]) -> None:
    raw_choices = record.get("raw_choices", [])
    answer_key = clean(record.get("answer_key"))
    answer_text = clean(record.get("answer_text"))
    if answer_key:
        keyed = next((item for item in raw_choices if item["key"] == answer_key), None)
        if keyed:
            answer_text = clean(keyed["text"])

    unique: list[str] = []
    seen: set[str] = set()
    for item in raw_choices:
        text = clean(item["text"])
        key = semantic_choice_key(text)
        if text and key not in seen:
            seen.add(key)
            unique.append(text)
    if semantic_choice_key(answer_text) not in seen:
        unique.insert(0, answer_text)
        seen.add(semantic_choice_key(answer_text))

    original_count = len(unique)
    for distractor in distractors_for(record["prompt"], answer_text):
        key = semantic_choice_key(distractor)
        if key and key not in seen:
            unique.append(clean(distractor))
            seen.add(key)
        if len(unique) >= 3:
            break
    if len(unique) < 3:
        raise ValueError(f"Không tạo đủ lựa chọn: {record['prompt']}")
    if len(unique) > 4:
        correct = next(item for item in unique if semantic_choice_key(item) == semantic_choice_key(answer_text))
        others = [item for item in unique if semantic_choice_key(item) != semantic_choice_key(answer_text)]
        unique = [correct, *others[:3]]

    rng = random.Random(
        f"{record['source_file']}|{record['lesson_number']}|{record['source_question_number']}"
    )
    rng.shuffle(unique)
    record["choices"] = [
        {"key": chr(65 + index), "text": text} for index, text in enumerate(unique)
    ]
    record["correct_answer"] = next(
        choice["key"]
        for choice in record["choices"]
        if semantic_choice_key(choice["text"]) == semantic_choice_key(answer_text)
    )
    record["answer_text"] = answer_text
    if original_count < 3:
        repair_log.append(
            {
                "source": record["source_file"],
                "lesson_number": record["lesson_number"],
                "source_question_number": record["source_question_number"],
                "action": "Chuyển câu trả lời ngắn thành trắc nghiệm 3 lựa chọn.",
            }
        )


# H?m record_signature d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def record_signature(record: dict) -> tuple:
    return (
        record["lesson_number"],
        signature_text(record["prompt"]),
        tuple(sorted(signature_text(choice["text"]) for choice in record["choices"])),
        signature_text(record["answer_text"]),
    )


# H?m audit_math d?ng ?? ??i chi?u k?t qu? v?i c?c ?i?u ki?n mong ??i v? b?o c?o sai l?ch; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def audit_math(record: dict) -> list[str]:
    issues = []
    prompt = record["prompt"].replace("−", "-")
    answer = record["answer_text"]
    patterns = [
        (r"(\d+)\s*\+\s*_+\s*=\s*(\d+)", lambda a, b: b - a),
        (r"_+\s*\+\s*(\d+)\s*=\s*(\d+)", lambda a, b: b - a),
        (r"(\d+)\s*-\s*_+\s*=\s*(\d+)", lambda a, b: a - b),
    ]
    for pattern, solve in patterns:
        match = re.search(pattern, prompt)
        if match and answer.lstrip("-").isdigit():
            expected = solve(int(match.group(1)), int(match.group(2)))
            if int(answer) != expected:
                issues.append(f"Đáp án số điền khuyết phải là {expected}.")
    return issues


# H?m main d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def main() -> None:
    for path in (
        TOPIC1_DOCX,
        TOPIC1_LEGACY_DOCX,
        POSITION_DOCX,
        TOPIC2_DOCX,
        PACK_JSON,
        GENERATED_JSON,
        AI_CHAPTER1_JSON,
        *[DATA_TOAN_ROOT / name for name in DATA_TOAN_TARGET_FILES],
    ):
        if not path.exists():
            raise FileNotFoundError(path)

    titles = canonical_lessons()
    position_images = extract_position_images()
    source_records: list[dict] = []
    topic1_records = parse_word_bank(
        TOPIC1_DOCX, list(range(1, 10)), "main", topic1_image
    )
    position_records = parse_word_bank(
        POSITION_DOCX,
        [1],
        "main",
        position_image_resolver(position_images),
    )
    # File 15 câu vị trí là bản trình bày từng câu của chính Bài 1. Một số lựa
    # chọn chỉ nằm trong ảnh, nên dùng lại bộ lựa chọn văn bản tương ứng từ bản v2.
    for position_record, topic1_record in zip(position_records, topic1_records[:15]):
        if not position_record["raw_choices"] and topic1_record["raw_choices"]:
            position_record["raw_choices"] = [
                dict(choice) for choice in topic1_record["raw_choices"]
            ]
    source_records.extend(topic1_records)
    source_records.extend(position_records)
    source_records.extend(
        parse_word_bank(TOPIC2_DOCX, list(range(10, 22)), "main", topic2_image)
    )
    source_records.extend(records_from_pack())
    source_records.extend(records_from_generated())
    for file_name in DATA_TOAN_TARGET_FILES:
        source_records.extend(parse_data_toan_bank(DATA_TOAN_ROOT / file_name))

    repairs: list[dict] = []
    for record in source_records:
        finalize_choices(record, repairs)
        if not record.get("explanation"):
            record["explanation"] = explanation_for(record["prompt"], record["answer_text"])

    deduplicated: list[dict] = []
    duplicates: list[dict] = []
    seen: dict[tuple, dict] = {}
    for record in source_records:
        key = record_signature(record)
        if key in seen:
            duplicates.append(
                {
                    "excluded_source": record["source_file"],
                    "excluded_question": record["source_question_number"],
                    "kept_source": seen[key]["source_file"],
                    "lesson_number": record["lesson_number"],
                    "prompt": record["prompt"],
                }
            )
            continue
        seen[key] = record
        deduplicated.append(record)

    grouped: dict[int, list[dict]] = defaultdict(list)
    for record in deduplicated:
        grouped[record["lesson_number"]].append(record)

    lessons = []
    remaining_issues = []
    for lesson_number in range(1, 40):
        questions = grouped[lesson_number]
        for index, record in enumerate(questions, 1):
            record["lesson_title"] = titles[lesson_number - 1]
            record["bank_index"] = index
            record["id"] = f"G1-L{lesson_number:03d}-Q{index:03d}"
            record["misconceptions"] = [
                {
                    "distractor_key": choice["key"],
                    "misconception_name": "Sai thường gặp",
                    "explanation": "Đối chiếu lại dữ kiện và yêu cầu của câu hỏi.",
                }
                for choice in record["choices"]
                if choice["key"] != record["correct_answer"]
            ]
            if not record["prompt"] or not record["answer_text"]:
                remaining_issues.append(
                    {"question_id": record["id"], "issue": "Thiếu câu hỏi hoặc đáp án."}
                )
            if len({signature_text(item["text"]) for item in record["choices"]}) != len(
                record["choices"]
            ):
                remaining_issues.append(
                    {"question_id": record["id"], "issue": "Lựa chọn bị trùng."}
                )
            for issue in audit_math(record):
                remaining_issues.append({"question_id": record["id"], "issue": issue})
        lessons.append({"number": lesson_number, "title": titles[lesson_number - 1], "questions": questions})

    builder.validate_bank(lessons)
    if remaining_issues:
        raise ValueError(f"Còn {len(remaining_issues)} lỗi nội dung.")

    source_counts = defaultdict(int)
    for record in source_records:
        source_counts[record["source_file"]] += 1
    included_counts = defaultdict(int)
    for record in deduplicated:
        included_counts[record["source_file"]] += 1

    report = {
        "grade": 1,
        "scope": (
            "Toàn bộ 39 bài Toán 1 Cánh Diều từ các nguồn câu hỏi dùng được "
            "trong workspace và các bộ bổ sung Bài 22-39 tại Pictures/DataToan/Lop_01."
        ),
        "lesson_count": 39,
        "question_count_before_deduplication": len(source_records),
        "question_count": len(deduplicated),
        "image_count": sum(bool(item["image_source_path"]) for item in deduplicated),
        "source_counts": dict(source_counts),
        "included_counts": dict(included_counts),
        "duplicate_questions_removed": len(duplicates),
        "duplicate_details": duplicates,
        "converted_short_answer_questions": len(repairs),
        "excluded_sources": [
            {
                "file": str(TOPIC1_LEGACY_DOCX),
                "question_count": 135,
                "reason": "Bản v1 bị hỏng mã hóa tiếng Việt (nhiều chữ bị thay bằng dấu ?), đồng thời là bản cũ trước v2 đầy đủ.",
            },
            {
                "file": str(AI_CHAPTER1_JSON),
                "question_count": 27,
                "reason": "Trùng ID và nội dung với 27 câu đầu của grade-1-generated-questions.json; chỉ khác bộ ảnh.",
            },
        ],
        "checks": [
            "Đủ 39 bài trong Curriculum lớp 1.",
            "Mọi câu đều có 3-4 lựa chọn khác nhau và đúng một đáp án.",
            "Kiểm tra tự động các mẫu cộng, trừ và số điền khuyết.",
            "Loại câu trùng theo bài, nội dung, lựa chọn và đáp án.",
            "Chỉ giữ ảnh có tệp nguồn tồn tại.",
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
                "lessons": 39,
                "questions_before_deduplication": len(source_records),
                "questions": len(deduplicated),
                "images": report["image_count"],
                "duplicates_removed": len(duplicates),
                "short_answers_converted": len(repairs),
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
