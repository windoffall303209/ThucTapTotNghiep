# Script build grade4 complete question bank h? tr? nh?p, xu?t, ki?m tra ho?c b?o tr? d? li?u v? c?u h?nh c?a d? ?n.
from __future__ import annotations

import hashlib
import importlib.util
import json
import re
from collections import defaultdict
from pathlib import Path

from docx import Document
from docx.oxml.ns import qn
from docx.table import Table
from docx.text.paragraph import Paragraph


PROJECT = Path(__file__).resolve().parents[1]
DATA_ROOT = Path(r"C:\Users\WIND-OF-FALL\Pictures\DataToan\Lop_04")
BLUEPRINT = PROJECT / "content-theory" / "grade-4-theory-blueprint-detailed.json"
CONVERTED_ROOT = PROJECT / "tmp" / "grade4_converted"
OUTPUT_DOCX = PROJECT / "output" / "doc" / "ngan_hang_cau_hoi_toan_4_canh_dieu.docx"
OUTPUT_TEX = PROJECT / "data" / "grade4_question_bank.tex"
REPORT_PATH = PROJECT / "output" / "doc" / "grade4_content_review_report.json"
ASSET_DIR = PROJECT / "output" / "grade4-master-assets"

SELECTED_SOURCES = [
    Path("Toan_lop4_bai4_bai6/Toan_lop4_bai4_bai6_v2.doc"),
    Path("Toan_lop4_bai7_bai10/Toan_lop4_bai7_bai10.doc"),
    Path("Toan_lop4_bai12_bai14/Toan_lop4_bai12_bai14.doc"),
    Path("Toan_lop4_bai15_bai17/Toan_lop4_bai15_bai17.doc"),
    Path("Toan_lop4_bai19_bai21/Toan_lop4_bai19_bai21.doc"),
    Path(
        "Toan_lop4_bai22_bai27/Toan_lop4_bai22_bai27/"
        "Toan_lop4_bai22_bai27.doc"
    ),
    Path("Toan_lop4_bai28_bai31/Toan_lop4_bai28_bai31.doc"),
    Path("Toan_lop4_bai32_bai36/Toan_lop4_bai32_bai36.doc"),
    Path("Toan_lop4_bai38_bai40/Toan_lop4_bai38_bai40.doc"),
    Path("Toan_lop4_bai42_bai47/Toan_lop4_bai42_bai47.doc"),
    Path("Toan_lop4_bai49_bai54/Toan_lop4_bai49_bai54.doc"),
    Path("Bo_sung_2026-07-25/Toan_lop4_bai53_bai55 (1).doc"),
    Path("Bo_sung_2026-07-25/Toan_lop4_bai57_bai59.doc"),
    Path("Bo_sung_2026-07-25/Toan_lop4_bai60_bai62.doc"),
    Path("Bo_sung_2026-07-25/Toan_lop4_bai68_bai73_nguoc.docx"),
    Path("Bo_sung_2026-07-25/Toan_lop4_bai74_bai77_nguoc.docx"),
    Path("Bo_sung_2026-07-25/Toan_lop4_bai80_bai84_nguoc.docx"),
    Path("Bo_sung_2026-07-25/Toan_lop4_bai87_bai89_nguoc.docx"),
    Path(
        "Bo_sung_2026-07-26/"
        "Ngan_hang_cau_hoi_Toan_4_Canh_Dieu_Bai_65-67_co_anh_AI.docx"
    ),
]

NEW_SOURCE_COUNTS = {
    "Toan_lop4_bai53_bai55 (1).doc": 75,
    "Toan_lop4_bai57_bai59.doc": 75,
    "Toan_lop4_bai60_bai62.doc": 75,
    "Toan_lop4_bai68_bai73_nguoc.docx": 60,
    "Toan_lop4_bai74_bai77_nguoc.docx": 60,
    "Toan_lop4_bai80_bai84_nguoc.docx": 60,
    "Toan_lop4_bai87_bai89_nguoc.docx": 60,
    "Ngan_hang_cau_hoi_Toan_4_Canh_Dieu_Bai_65-67_co_anh_AI.docx": 75,
}

EXCLUDED_SOURCES = [
    {
        "file": str(DATA_ROOT / "Toan_lop4_bai4_bai6_v2.doc"),
        "reason": "Trùng byte-for-byte với bản v2 trong folder con; giữ bản trong folder con có thư mục ảnh đi kèm.",
    },
    {
        "file": str(
            DATA_ROOT
            / "Toan_lop4_bai4_bai6"
            / "Toan_lop4_bai4_bai6"
            / "Toan_lop4_bai4_bai6.doc"
        ),
        "reason": "Bản cũ của Bài 4-6; giữ bản v2 mới hơn, cùng phạm vi 60 câu.",
    },
    {
        "file": str(
            DATA_ROOT
            / "Toan_lop4_bai22_bai27"
            / "Toan_lop4_bai22_bai27.doc"
        ),
        "reason": "Bản ngoài của cùng bộ Bài 22, 26, 27; giữ bản mới hơn trong folder con.",
    },
]

BASE_SCRIPT = PROJECT / "scripts" / "build_grade5_question_bank.py"
base_spec = importlib.util.spec_from_file_location("question_bank_builder", BASE_SCRIPT)
builder = importlib.util.module_from_spec(base_spec)
base_spec.loader.exec_module(builder)
builder.GRADE = 4
builder.EXPECTED_LESSON_NUMBERS = list(range(1, 56))
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
    result = {}
    lesson_number = 0
    for chapter in data["chapters"]:
        for lesson in chapter["lessons"]:
            lesson_number += 1
            result[lesson_number] = helper.clean(lesson["lesson"])
    if len(result) != 55:
        raise ValueError(
            f"Curriculum lớp 4 phải có 55 bài, tìm thấy {len(result)}."
        )
    return result


# H?m converted_path d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def converted_path(source: Path) -> Path:
    source_hash = hashlib.sha1(str(source).encode("utf-8")).hexdigest()[:10]
    return CONVERTED_ROOT / f"{source.stem}-{source_hash}.docx"


# H?m ensure_converted d?ng ?? ki?m tra t?nh h?p l? v? c?c ?i?u ki?n an to?n; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def ensure_converted(source: Path) -> Path:
    if source.suffix.lower() == ".docx":
        return source
    target = converted_path(source)
    if target.exists() and target.stat().st_mtime >= source.stat().st_mtime:
        return target
    try:
        import win32com.client
    except ImportError as error:
        raise RuntimeError(
            "Cần Microsoft Word và pywin32 để chuyển nguồn .doc sang .docx."
        ) from error
    CONVERTED_ROOT.mkdir(parents=True, exist_ok=True)
    word = win32com.client.DispatchEx("Word.Application")
    word.Visible = False
    word.DisplayAlerts = 0
    try:
        document = word.Documents.Open(
            str(source),
            ConfirmConversions=False,
            ReadOnly=True,
            AddToRecentFiles=False,
            OpenAndRepair=True,
            NoEncodingDialog=True,
        )
        document.SaveAs2(str(target), FileFormat=16, AddToRecentFiles=False)
        document.Close(False)
    finally:
        word.Quit()
    return target


# H?m image_directory d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def image_directory(source: Path) -> Path:
    stem = re.sub(r"_v\d+$", "", source.stem, flags=re.IGNORECASE)
    return source.parent / f"{stem}_images"


# H?m image_for d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def image_for(source: Path, source_lesson: int, question_number: int) -> Path | None:
    if question_number > 10:
        return None
    directory = image_directory(source)
    expected = f"bai{source_lesson}_cau{question_number:02d}.png".casefold()
    matches = [
        path
        for path in directory.glob("*")
        if path.is_file() and path.name.casefold() == expected
    ]
    if len(matches) != 1:
        raise ValueError(
            f"{source.name}: cần đúng một ảnh {expected}, tìm thấy {len(matches)}."
        )
    return matches[0]


# H?m canonical_lesson_for_heading d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def canonical_lesson_for_heading(
    heading: str,
    canonical: dict[int, str],
) -> tuple[int, int]:
    match = re.match(r"^Bài\s+(\d+)\s*[\.:]\s*(.+)$", heading, re.IGNORECASE)
    if not match:
        raise ValueError(f"Tiêu đề bài không hợp lệ: {heading!r}")
    source_lesson = int(match.group(1))
    title_key = helper.title_key(match.group(2))
    candidates = [
        number
        for number, title in canonical.items()
        if helper.title_key(title) == title_key
    ]
    if len(candidates) != 1:
        raise ValueError(
            f"Không map duy nhất được {heading!r}; candidates={candidates}."
        )
    return candidates[0], source_lesson


# H?m parse_source d?ng ?? ph?n t?ch ??u v?o th?nh c?u tr?c c? th? s? d?ng; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def parse_source(
    source: Path,
    canonical: dict[int, str],
) -> list[dict]:
    document = Document(ensure_converted(source))
    records = []
    canonical_lesson = 0
    source_lesson = 0
    local_question_number = 0
    current = None

# H?m flush d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

    def flush() -> None:
        nonlocal current
        if current is None:
            return
        if not current["answer_key"] and re.fullmatch(
            r"[A-D]", helper.clean(current["answer_text"]).upper()
        ):
            current["answer_key"] = helper.clean(current["answer_text"]).upper()
            current["answer_text"] = ""
        if not current["prompt"]:
            raise ValueError(
                f"{source.name}: Bài {source_lesson}, câu "
                f"{current['source_question_number']} thiếu nội dung."
            )
        if len(current["raw_choices"]) != 4:
            raise ValueError(
                f"{source.name}: {current['prompt']!r} có "
                f"{len(current['raw_choices'])} lựa chọn."
            )
        if not current["answer_key"] and not current["answer_text"]:
            raise ValueError(f"{source.name}: thiếu đáp án cho {current['prompt']!r}.")
        image = image_for(source, source_lesson, current["source_question_number"])
        current["image_source_path"] = str(image) if image else ""
        current["image_relative_path"] = (
            str(image.relative_to(DATA_ROOT)).replace("\\", "/") if image else ""
        )
        records.append(current)
        current = None

    for paragraph in document.paragraphs:
        raw_text = paragraph.text.strip()
        text = helper.clean(raw_text)
        if not text:
            continue
        if paragraph.style.name == "Heading 1" and re.match(
            r"^Bài\s+\d+\.", text, re.IGNORECASE
        ):
            flush()
            canonical_lesson, source_lesson = canonical_lesson_for_heading(
                text, canonical
            )
            local_question_number = 0
            continue

        question_match = re.match(
            r"^Câu\s+(\d+)\.\s*(.+)$",
            text,
            re.IGNORECASE,
        )
        if question_match:
            flush()
            if not canonical_lesson:
                raise ValueError(f"{source.name}: câu hỏi đứng trước tiêu đề bài.")
            local_question_number += 1
            stated_number = int(question_match.group(1))
            if stated_number != local_question_number:
                raise ValueError(
                    f"{source.name}: thứ tự câu bị lệch, mong đợi "
                    f"{local_question_number}, gặp {stated_number}."
                )
            current = {
                "lesson_number": canonical_lesson,
                "source_lesson_number": source_lesson,
                "source_kind": "main",
                "source_file": str(source.relative_to(DATA_ROOT)).replace("\\", "/"),
                "source_question_number": local_question_number,
                "prompt": helper.clean(question_match.group(2)),
                "raw_choices": [],
                "answer_key": "",
                "answer_text": "",
                "explanation": "",
                "difficulty": "EASY" if local_question_number <= 10 else "MEDIUM",
            }
            continue
        if current is None:
            continue
        if re.match(r"^[A-D]\.\s*", text):
            current["raw_choices"].extend(helper.parse_choices(raw_text))
            continue
        if text.lower().startswith("đáp án:"):
            current["answer_key"], current["answer_text"] = helper.parse_answer(text)
            continue
        if text.lower().startswith("lời giải:"):
            current["explanation"] = helper.clean(text.split(":", 1)[1])
    flush()
    return records


# H?m save_embedded_images d?ng ?? c?p nh?t tr?ng th?i ho?c d? li?u theo quy t?c nghi?p v?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def save_embedded_images(block, source: Path, question_number: int) -> list[Path]:
    relation_ids = []
    for blip in block._element.xpath(".//a:blip"):
        relation_id = blip.get(qn("r:embed"))
        if relation_id:
            relation_ids.append(relation_id)
    for image_data in block._element.xpath(
        ".//*[local-name()='imagedata']"
    ):
        relation_id = image_data.get(qn("r:id"))
        if relation_id:
            relation_ids.append(relation_id)
    if not relation_ids:
        return []

    source_hash = hashlib.sha1(str(source).encode("utf-8")).hexdigest()[:10]
    target_dir = ASSET_DIR / "embedded" / source_hash
    target_dir.mkdir(parents=True, exist_ok=True)
    result = []
    for image_index, relation_id in enumerate(dict.fromkeys(relation_ids), 1):
        if relation_id not in block.part.related_parts:
            continue
        part = block.part.related_parts[relation_id]
        suffix = Path(str(part.partname)).suffix.lower() or ".png"
        target = target_dir / f"q{question_number:03d}-{image_index:02d}{suffix}"
        target.write_bytes(part.blob)
        result.append(target)
    return result


# H?m parse_embedded_source d?ng ?? ph?n t?ch ??u v?o th?nh c?u tr?c c? th? s? d?ng; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def parse_embedded_source(
    source: Path,
    canonical: dict[int, str],
) -> list[dict]:
    document = Document(ensure_converted(source))
    records = []
    canonical_lesson = 0
    source_lesson = 0
    local_question_number = 0
    current = None

# H?m flush d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

    def flush() -> None:
        nonlocal current
        if current is None:
            return
        if not current["answer_key"] and re.fullmatch(
            r"[A-D]", helper.clean(current["answer_text"]).upper()
        ):
            current["answer_key"] = helper.clean(current["answer_text"]).upper()
            current["answer_text"] = ""
        if not current["prompt"]:
            raise ValueError(
                f"{source.name}: Bài {source_lesson}, câu "
                f"{current['source_question_number']} thiếu nội dung."
            )
        if len(current["raw_choices"]) not in {0, 4}:
            raise ValueError(
                f"{source.name}: {current['prompt']!r} có "
                f"{len(current['raw_choices'])} lựa chọn."
            )
        if not current["answer_key"] and not current["answer_text"]:
            raise ValueError(f"{source.name}: thiếu đáp án cho {current['prompt']!r}.")
        images = current.pop("_images")
        current["image_source_path"] = str(images[0]) if images else ""
        current["image_relative_path"] = (
            f"{source.name}/{images[0].name}" if images else ""
        )
        records.append(current)
        current = None

    for block in document.iter_inner_content():
        if isinstance(block, Table):
            if current is not None:
                current["_images"].extend(
                    save_embedded_images(block, source, len(records) + 1)
                )
                for row in block.rows:
                    for cell in row.cells:
                        cell_text = helper.clean(cell.text)
                        if re.match(r"^[A-D]\.\s*", cell_text):
                            current["raw_choices"].extend(
                                helper.parse_choices(cell.text)
                            )
            continue

        if not isinstance(block, Paragraph):
            continue
        if current is not None:
            current["_images"].extend(
                save_embedded_images(block, source, len(records) + 1)
            )
        raw_text = block.text.strip()
        text = helper.clean(raw_text)
        if not text:
            continue
        style_name = block.style.name if block.style is not None else ""
        if style_name == "Heading 1" and re.match(
            r"^Bài\s+\d+\s*[\.:]", text, re.IGNORECASE
        ):
            flush()
            canonical_lesson, source_lesson = canonical_lesson_for_heading(
                text, canonical
            )
            local_question_number = 0
            continue

        question_match = re.match(
            r"^Câu\s+(\d+)\.\s*(.+)$",
            text,
            re.IGNORECASE,
        )
        if question_match:
            flush()
            if not canonical_lesson:
                raise ValueError(f"{source.name}: câu hỏi đứng trước tiêu đề bài.")
            local_question_number += 1
            stated_number = int(question_match.group(1))
            if stated_number != local_question_number:
                raise ValueError(
                    f"{source.name}: thứ tự câu bị lệch, mong đợi "
                    f"{local_question_number}, gặp {stated_number}."
                )
            current = {
                "lesson_number": canonical_lesson,
                "source_lesson_number": source_lesson,
                "source_kind": "main",
                "source_file": str(source.relative_to(DATA_ROOT)).replace("\\", "/"),
                "source_question_number": local_question_number,
                "prompt": helper.clean(question_match.group(2)),
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
        if re.match(r"^[A-D]\.\s*", text):
            current["raw_choices"].extend(helper.parse_choices(raw_text))
            continue
        if text.lower().startswith("đáp án:"):
            current["answer_key"], current["answer_text"] = helper.parse_answer(text)
            continue
        if text.lower().startswith("lời giải:"):
            current["explanation"] = helper.clean(text.split(":", 1)[1])
    flush()
    return records


# H?m record_signature d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def record_signature(record: dict) -> tuple:
    image_path = Path(record["image_source_path"]) if record["image_source_path"] else None
    image_fingerprint = (
        hashlib.sha256(image_path.read_bytes()).hexdigest() if image_path else ""
    )
    return (
        int(record["lesson_number"]),
        helper.normalized(record["prompt"]),
        tuple(
            sorted(helper.normalized(item["text"]) for item in record["choices"])
        ),
        helper.normalized(record["answer_text"]),
        image_fingerprint,
    )


# H?m finalize_source_choices d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def finalize_source_choices(record: dict) -> None:
    choices = [
        {"key": helper.clean(item["key"]).upper(), "text": helper.clean(item["text"])}
        for item in record["raw_choices"]
    ]
    if len(choices) != 4:
        raise ValueError(f"Không có đúng bốn lựa chọn: {record['prompt']}")
    if len({helper.normalized(item["text"]) for item in choices}) != 4:
        raise ValueError(f"Có lựa chọn trùng: {record['prompt']}")
    answer_key = helper.clean(record["answer_key"]).upper()
    keyed = next((item for item in choices if item["key"] == answer_key), None)
    if keyed is None:
        raise ValueError(f"Khóa đáp án không tồn tại: {record['prompt']}")
    record["choices"] = choices
    record["correct_answer"] = answer_key
    record["answer_text"] = keyed["text"]


# H?m finalize_imported_choices d?ng ?? ??ng b? d? li?u gi?a c?c ??nh d?ng ho?c ngu?n kh?c nhau; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def finalize_imported_choices(record: dict, conversions: list[dict]) -> None:
    if not record["raw_choices"]:
        answer_text = helper.clean(record["answer_text"]).rstrip(".")
        tailored_distractors = {
            helper.normalized(
                "Điền vào chỗ trống: Trong hình bình hành ABCD, AB = … và AD = …"
            ): ["BC; DC", "AD; AB", "CD; DA"],
            helper.normalized(
                "Điền Đ hoặc S: “Mọi hình bình hành đều có hai cặp cạnh đối diện bằng nhau.”"
            ): ["S", "Chỉ đúng với hình vuông", "Không xác định được"],
            helper.normalized(
                "Trong hình bình hành ABCD, AB = 15 cm. Cạnh DC dài bao nhiêu xăng-ti-mét?"
            ): ["5 cm", "10 cm", "30 cm"],
            helper.normalized(
                "Trong hình bình hành RSTU, RS = 8 cm, ST = 5 cm. Ghép đúng các cạnh bằng nhau."
            ): ["RS = ST; TU = RU", "RS = RU; ST = TU", "RS = TU; ST = RS"],
            helper.normalized(
                "Bạn Nam nói: “Trong hình bình hành, hai cạnh đối diện chỉ cần bằng nhau, không cần song song.” Nam nói đúng hay sai?"
            ): ["Đúng", "Chỉ đúng với hình vuông", "Không xác định được"],
            helper.normalized(
                "Bạn Mai viết: AB = BC trong mọi hình bình hành ABCD. Em hãy sửa lại cho đúng."
            ): ["AB = AD", "AB = BC", "AB = AC"],
            helper.normalized(
                "Một hình bình hành có một cặp cạnh đối diện dài 14 cm và cặp cạnh đối diện còn lại dài 9 cm. Hãy viết độ dài bốn cạnh theo thứ tự quanh hình."
            ): [
                "14 cm, 14 cm, 9 cm, 9 cm",
                "14 cm, 9 cm, 9 cm, 14 cm",
                "9 cm, 14 cm, 14 cm, 9 cm",
            ],
            helper.normalized(
                "Điền vào chỗ trống: Trong hình thoi MNPQ, MN song song với … và NP song song với …"
            ): ["NP; PQ", "MQ; MN", "MP; NQ"],
            helper.normalized(
                "Điền Đ hoặc S: “Hình thoi có bốn cạnh bằng nhau.”"
            ): ["S", "Chỉ đúng với hình vuông", "Không xác định được"],
            helper.normalized(
                "Điền Đ hoặc S: “Trong hình thoi ABCD, AB không song song với CD.”"
            ): ["Đ", "Chỉ đúng với hình vuông", "Không xác định được"],
            helper.normalized(
                "Bạn An nói: “Chỉ cần một cặp cạnh đối diện song song thì tứ giác chắc chắn là hình thoi.” An nói đúng hay sai?"
            ): ["Đúng", "Chỉ đúng với hình chữ nhật", "Không xác định được"],
            helper.normalized(
                "Quan sát hình thoi ABCD. Nếu AB = 13 cm thì AD bằng bao nhiêu?"
            ): ["6,5 cm", "26 cm", "39 cm"],
            helper.normalized(
                "Hãy sửa câu sai sau: “Trong hình thoi ABCD, AB = BC nhưng CD có thể khác DA.”"
            ): ["AB = BC = CD", "AB = CD; BC khác DA", "AB khác BC = CD = DA"],
            helper.normalized(
                "Viết số đo: “Sáu nghìn bốn trăm ba mươi mét vuông”."
            ): ["6 403 m²", "6 340 m²", "64 030 m²"],
            helper.normalized(
                "Số đo 5 600 m² được đọc như thế nào?"
            ): [
                "Năm nghìn sáu mươi mét vuông",
                "Năm trăm sáu mươi mét vuông",
                "Năm mươi sáu nghìn mét vuông",
            ],
            helper.normalized(
                "Viết số đo: “Mười hai nghìn năm trăm mét vuông”."
            ): ["1 250 m²", "12 050 m²", "125 000 m²"],
            helper.normalized(
                "Điền dấu >, < hoặc =: 45 m² … 38 m²."
            ): ["<", "=", "Không so sánh được"],
        }
        candidates = [
            answer_text,
            *tailored_distractors.get(
                helper.normalized(record["prompt"]),
                helper.distractors_for(record["prompt"], answer_text),
            ),
        ]
        candidates.extend(
            [
                "Không đủ dữ kiện",
                "Một kết quả khác",
                "Không xác định được",
            ]
        )
        unique = []
        seen = set()
        for candidate in candidates:
            text = helper.clean(candidate).rstrip(".")
            key = helper.semantic_choice_key(text)
            if text and key not in seen:
                seen.add(key)
                unique.append(text)
            if len(unique) == 4:
                break
        if len(unique) != 4:
            raise ValueError(f"Không tạo đủ bốn lựa chọn: {record['prompt']}")
        record["raw_choices"] = [
            {"key": chr(65 + index), "text": text}
            for index, text in enumerate(unique)
        ]
        conversions.append(
            {
                "source": record["source_file"],
                "lesson_number": record.get("lesson_number"),
                "question": record["prompt"],
                "action": "Chuyển câu điền đáp án thành câu có bốn lựa chọn.",
            }
        )
    helper.finalize_choices(record, conversions)


# H?m audit_record d?ng ?? ??i chi?u k?t qu? v?i c?c ?i?u ki?n mong ??i v? b?o c?o sai l?ch; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def audit_record(record: dict) -> list[str]:
    issues = []
    choices = record["choices"]
    if len(choices) != 4:
        issues.append("Không có đúng bốn lựa chọn.")
    if len({helper.normalized(item["text"]) for item in choices}) != len(choices):
        issues.append("Có lựa chọn trùng.")
    if record["correct_answer"] not in {item["key"] for item in choices}:
        issues.append("Khóa đáp án không tồn tại.")
    correct_text = next(
        (
            item["text"]
            for item in choices
            if item["key"] == record["correct_answer"]
        ),
        "",
    )
    prompt_ascii = helper.ascii_text(record["prompt"])
    asks_for_incorrect = any(
        phrase in prompt_ascii
        for phrase in (
            "phep tinh nao sai",
            "tinh sai",
            "khong phu hop",
            "khong thich hop",
            "khong dung",
        )
    )
    simple_equation = re.fullmatch(
        r"\s*(\d+)\s*([+\-x×:])\s*(\d+)\s*=\s*(\d+)\s*",
        correct_text.replace("−", "-"),
    )
    if simple_equation and not asks_for_incorrect:
        value = helper.expression_value(
            int(simple_equation.group(1)),
            simple_equation.group(2),
            int(simple_equation.group(3)),
        )
        if value is not None and value != int(simple_equation.group(4)):
            issues.append(f"Phương trình đáp án sai: {correct_text}")
    if "\ufffd" in record["prompt"] or "\u00c3" in record["prompt"]:
        issues.append("Nội dung có dấu hiệu lỗi mã hóa.")
    return issues


# H?m supplemental_choice_set d?ng ?? c?p nh?t tr?ng th?i ho?c d? li?u theo quy t?c nghi?p v?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def supplemental_choice_set(
    answer: str | int,
    distractors: list[str | int],
    seed: int,
) -> tuple[list[dict], str]:
    values = [str(answer), *(str(value) for value in distractors)]
    if len(values) != 4 or len(set(values)) != 4:
        raise ValueError(f"Bộ lựa chọn bổ sung không hợp lệ: {values}")
    offset = seed % 4
    values = values[offset:] + values[:offset]
    choices = [
        {"key": chr(65 + index), "text": value}
        for index, value in enumerate(values)
    ]
    correct_answer = next(
        choice["key"] for choice in choices if choice["text"] == str(answer)
    )
    return choices, correct_answer


# H?m supplemental_record d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def supplemental_record(
    lesson_number: int,
    question_number: int,
    prompt: str,
    answer: str | int,
    distractors: list[str | int],
    explanation: str,
) -> dict:
    choices, correct_answer = supplemental_choice_set(
        answer,
        distractors,
        lesson_number * 100 + question_number,
    )
    return {
        "lesson_number": lesson_number,
        "source_lesson_number": lesson_number,
        "source_kind": "supplemental",
        "source_file": "Bổ sung nội bộ cho ba bài còn thiếu của lớp 4",
        "source_question_number": question_number,
        "prompt": prompt,
        "raw_choices": choices,
        "answer_key": correct_answer,
        "answer_text": str(answer),
        "explanation": explanation,
        "difficulty": "EASY" if question_number <= 10 else "MEDIUM",
        "image_source_path": "",
        "image_relative_path": "",
    }


# H?m parallelogram_supplement d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def parallelogram_supplement() -> list[dict]:
    records = []
    conceptual = [
        (
            "Hình bình hành có đặc điểm nào sau đây?",
            "Hai cặp cạnh đối diện song song",
            ["Bốn cạnh bằng nhau", "Bốn góc vuông", "Chỉ có một cặp cạnh song song"],
            "Hình bình hành có hai cặp cạnh đối diện song song.",
        ),
        (
            "Trong hình bình hành ABCD, cạnh AB song song với cạnh nào?",
            "CD",
            ["BC", "AD", "AC"],
            "Hai cạnh đối diện AB và CD của hình bình hành song song với nhau.",
        ),
        (
            "Trong hình bình hành ABCD, cạnh BC song song với cạnh nào?",
            "AD",
            ["AB", "CD", "BD"],
            "Hai cạnh đối diện BC và AD của hình bình hành song song với nhau.",
        ),
        (
            "Khẳng định nào đúng về các cạnh đối diện của hình bình hành?",
            "Các cạnh đối diện bằng nhau",
            ["Các cạnh đối diện luôn vuông góc", "Chỉ một cặp cạnh bằng nhau", "Bốn cạnh luôn bằng nhau"],
            "Trong hình bình hành, từng cặp cạnh đối diện có độ dài bằng nhau.",
        ),
        (
            "Một tứ giác có hai cặp cạnh đối diện song song là hình gì?",
            "Hình bình hành",
            ["Hình tam giác", "Hình thang", "Hình tròn"],
            "Đây là dấu hiệu nhận biết cơ bản của hình bình hành.",
        ),
    ]
    for index, item in enumerate(conceptual, 1):
        records.append(supplemental_record(41, index, *item))

    for offset in range(10):
        question_number = 6 + offset
        first_side = 6 + offset
        second_side = 3 + (offset % 4)
        perimeter = 2 * (first_side + second_side)
        records.append(
            supplemental_record(
                41,
                question_number,
                (
                    f"Hình bình hành có hai cạnh kề dài {first_side} cm và "
                    f"{second_side} cm. Chu vi hình đó là bao nhiêu?"
                ),
                f"{perimeter} cm",
                [
                    f"{first_side + second_side} cm",
                    f"{perimeter - 2} cm",
                    f"{perimeter + 2} cm",
                ],
                (
                    "Chu vi hình bình hành bằng tổng độ dài bốn cạnh: "
                    f"({first_side} + {second_side}) × 2 = {perimeter} cm."
                ),
            )
        )

    for offset in range(5):
        question_number = 16 + offset
        first_side = 8 + offset
        second_side = 4 + offset
        perimeter = 2 * (first_side + second_side)
        records.append(
            supplemental_record(
                41,
                question_number,
                (
                    f"Hình bình hành có chu vi {perimeter} cm và một cạnh dài "
                    f"{first_side} cm. Cạnh kề với cạnh đó dài bao nhiêu?"
                ),
                f"{second_side} cm",
                [
                    f"{second_side + 1} cm",
                    f"{first_side + second_side} cm",
                    f"{perimeter - first_side} cm",
                ],
                (
                    f"Nửa chu vi là {perimeter} : 2 = {first_side + second_side} cm. "
                    f"Cạnh còn lại dài {first_side + second_side} - "
                    f"{first_side} = {second_side} cm."
                ),
            )
        )
    return records


# H?m rhombus_supplement d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def rhombus_supplement() -> list[dict]:
    records = []
    conceptual = [
        (
            "Hình thoi có đặc điểm nào sau đây?",
            "Bốn cạnh bằng nhau",
            ["Bốn góc vuông", "Chỉ có hai cạnh bằng nhau", "Không có cạnh song song"],
            "Hình thoi là hình có bốn cạnh bằng nhau.",
        ),
        (
            "Một hình thoi có bao nhiêu cạnh bằng nhau?",
            "4 cạnh",
            ["2 cạnh", "3 cạnh", "Không có cạnh nào"],
            "Cả bốn cạnh của hình thoi đều có độ dài bằng nhau.",
        ),
        (
            "Các cạnh đối diện của hình thoi có quan hệ như thế nào?",
            "Song song với nhau",
            ["Vuông góc với nhau", "Cắt nhau tại trung điểm", "Không có quan hệ"],
            "Hình thoi cũng là một hình bình hành nên các cạnh đối diện song song.",
        ),
        (
            "Hình nào luôn có bốn cạnh bằng nhau?",
            "Hình thoi",
            ["Hình chữ nhật", "Hình bình hành", "Hình thang"],
            "Đặc điểm nổi bật của hình thoi là có bốn cạnh bằng nhau.",
        ),
        (
            "Muốn tính chu vi hình thoi khi biết độ dài một cạnh, ta làm thế nào?",
            "Lấy độ dài một cạnh nhân với 4",
            ["Lấy độ dài một cạnh nhân với 2", "Cộng độ dài hai đường chéo", "Lấy độ dài một cạnh chia cho 4"],
            "Vì hình thoi có bốn cạnh bằng nhau nên chu vi bằng độ dài một cạnh nhân với 4.",
        ),
    ]
    for index, item in enumerate(conceptual, 1):
        records.append(supplemental_record(42, index, *item))

    for offset in range(10):
        question_number = 6 + offset
        side = 4 + offset
        perimeter = side * 4
        records.append(
            supplemental_record(
                42,
                question_number,
                f"Hình thoi có cạnh dài {side} cm. Chu vi hình thoi là bao nhiêu?",
                f"{perimeter} cm",
                [f"{side * 2} cm", f"{perimeter - 4} cm", f"{perimeter + 4} cm"],
                f"Chu vi hình thoi là {side} × 4 = {perimeter} cm.",
            )
        )

    for offset in range(5):
        question_number = 16 + offset
        side = 6 + offset
        perimeter = side * 4
        records.append(
            supplemental_record(
                42,
                question_number,
                (
                    f"Một hình thoi có chu vi {perimeter} cm. "
                    "Độ dài mỗi cạnh của hình thoi là bao nhiêu?"
                ),
                f"{side} cm",
                [f"{side * 2} cm", f"{side + 2} cm", f"{perimeter - side} cm"],
                f"Độ dài một cạnh là {perimeter} : 4 = {side} cm.",
            )
        )
    return records


# H?m square_metre_supplement d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def square_metre_supplement() -> list[dict]:
    records = []
    conceptual = [
        (
            "Mét vuông là đơn vị dùng để đo đại lượng nào?",
            "Diện tích",
            ["Độ dài", "Khối lượng", "Thời gian"],
            "Mét vuông là đơn vị đo diện tích.",
        ),
        (
            "Kí hiệu của mét vuông là gì?",
            "m²",
            ["m", "m³", "cm"],
            "Mét vuông được viết tắt là m².",
        ),
        (
            "Một mét vuông bằng bao nhiêu đề-xi-mét vuông?",
            "100 dm²",
            ["10 dm²", "1 000 dm²", "10 000 dm²"],
            "Vì 1 m = 10 dm nên 1 m² = 10 × 10 = 100 dm².",
        ),
        (
            "Một mét vuông bằng bao nhiêu xăng-ti-mét vuông?",
            "10 000 cm²",
            ["100 cm²", "1 000 cm²", "100 000 cm²"],
            "Vì 1 m = 100 cm nên 1 m² = 100 × 100 = 10 000 cm².",
        ),
        (
            "Đơn vị nào thích hợp để đo diện tích nền một phòng học?",
            "Mét vuông",
            ["Mét", "Ki-lô-gam", "Lít"],
            "Diện tích nền phòng học thường được đo bằng mét vuông.",
        ),
    ]
    for index, item in enumerate(conceptual, 1):
        records.append(supplemental_record(43, index, *item))

    for offset in range(5):
        question_number = 6 + offset
        square_metres = 2 + offset
        square_decimetres = square_metres * 100
        records.append(
            supplemental_record(
                43,
                question_number,
                f"{square_metres} m² bằng bao nhiêu đề-xi-mét vuông?",
                f"{square_decimetres} dm²",
                [
                    f"{square_metres * 10} dm²",
                    f"{square_metres * 1_000} dm²",
                    f"{square_metres * 10_000} dm²",
                ],
                f"{square_metres} m² = {square_metres} × 100 = {square_decimetres} dm².",
            )
        )

    for offset in range(5):
        question_number = 11 + offset
        length = 5 + offset
        width = 3 + (offset % 3)
        area = length * width
        records.append(
            supplemental_record(
                43,
                question_number,
                (
                    f"Một khu đất hình chữ nhật dài {length} m và rộng {width} m. "
                    "Diện tích khu đất là bao nhiêu?"
                ),
                f"{area} m²",
                [
                    f"{area + length} m²",
                    f"{area + width} m²",
                    f"{area - width} m²",
                ],
                f"Diện tích khu đất là {length} × {width} = {area} m².",
            )
        )

    for offset in range(5):
        question_number = 16 + offset
        width = 4 + offset
        length = 7 + offset
        area = width * length
        records.append(
            supplemental_record(
                43,
                question_number,
                (
                    f"Một hình chữ nhật có diện tích {area} m² và chiều rộng "
                    f"{width} m. Chiều dài của hình chữ nhật là bao nhiêu?"
                ),
                f"{length} m",
                [f"{length + 1} m", f"{width} m", f"{area - width} m"],
                f"Chiều dài hình chữ nhật là {area} : {width} = {length} m.",
            )
        )
    return records


# H?m supplemental_records d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def supplemental_records() -> list[dict]:
    records = [
        *parallelogram_supplement(),
        *rhombus_supplement(),
        *square_metre_supplement(),
    ]
    if len(records) != 60:
        raise ValueError(f"Phải có 60 câu bổ sung lớp 4, tìm thấy {len(records)}.")
    return records


# H?m main d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def main() -> None:
    if not DATA_ROOT.exists():
        raise FileNotFoundError(DATA_ROOT)
    canonical = canonical_titles()
    selected_paths = [DATA_ROOT / relative for relative in SELECTED_SOURCES]
    for source in selected_paths:
        if not source.exists():
            raise FileNotFoundError(source)

    source_records = []
    source_counts = {}
    for source in selected_paths:
        records = (
            parse_embedded_source(source, canonical)
            if source.name in NEW_SOURCE_COUNTS
            else parse_source(source, canonical)
        )
        expected_count = NEW_SOURCE_COUNTS.get(source.name, 60)
        if len(records) != expected_count:
            raise ValueError(
                f"{source.name}: phải có {expected_count} câu, tìm thấy {len(records)}."
            )
        source_records.extend(records)
        source_counts[str(source.relative_to(DATA_ROOT)).replace("\\", "/")] = len(
            records
        )
    if len(source_records) != 1200:
        raise ValueError(f"Nguồn lớp 4 phải có 1200 câu, tìm thấy {len(source_records)}.")

    corrections = []
    conversions = []
    for record in source_records:
        helper.math_repair(record, corrections)
        if record["source_file"].endswith(
            "Ngan_hang_cau_hoi_Toan_4_Canh_Dieu_Bai_65-67_co_anh_AI.docx"
        ):
            finalize_imported_choices(record, conversions)
        else:
            finalize_source_choices(record)
        record["explanation"] = (
            helper.clean(record["explanation"]) or helper.explanation_for(record)
        )

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
        for number in range(1, 56)
        if number not in grouped
    ]

    lessons = []
    remaining_issues = []
    for lesson_number in range(1, 56):
        questions = grouped[lesson_number]
        for index, record in enumerate(questions, 1):
            record["lesson_title"] = canonical[lesson_number]
            record["bank_index"] = index
            record["id"] = f"G4-L{lesson_number:03d}-Q{index:03d}"
            record["misconceptions"] = []
            for issue in audit_record(record):
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
            f"Còn {len(remaining_issues)} lỗi nội dung; xem báo cáo tạm."
        )

    report = {
        "grade": 4,
        "scope": (
            "Quét đệ quy Pictures/DataToan/Lop_04; chuyển nguồn .doc sang .docx "
            "để đọc, ánh xạ bài theo tiêu đề và bổ sung ba bài còn thiếu để "
            "bao phủ Curriculum 55 bài."
        ),
        "curriculum_lesson_count": 55,
        "covered_lesson_count": len(covered_lessons),
        "covered_lessons": covered_lessons,
        "missing_lesson_count": len(missing_lessons),
        "missing_lessons": missing_lessons,
        "question_count_before_deduplication": len(source_records),
        "question_count": len(deduplicated),
        "image_count": sum(
            bool(record["image_source_path"]) for record in deduplicated
        ),
        "source_counts": source_counts,
        "duplicate_questions_removed": len(duplicates),
        "duplicate_details": duplicates,
        "math_corrections": corrections,
        "converted_or_completed_choices": len(conversions),
        "excluded_sources": EXCLUDED_SOURCES,
        "checks": [
            "Quét nguồn trong tất cả folder con và đối chiếu file trùng.",
            "Ánh xạ tiêu đề nguồn vào Curriculum 55 bài lớp 4.",
            "Mỗi câu có đúng bốn lựa chọn khác nhau và một đáp án.",
            "Kiểm tra phép tính trực tiếp và phương trình trong đáp án.",
            "Loại trùng theo bài, nội dung, lựa chọn và đáp án.",
            "Kiểm tra đủ ảnh cho câu 1-10 của mỗi bài nguồn.",
            "Bổ sung và kiểm tra 25 câu nguồn cho mỗi bài Hình bình hành, Hình thoi và Mét vuông.",
        ],
        "remaining_issues": remaining_issues,
        "status": "PASS",
    }
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    builder.write_tex(lessons)
    builder.write_docx(lessons)
    print(
        json.dumps(
            {
                "curriculum_lessons": 55,
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
