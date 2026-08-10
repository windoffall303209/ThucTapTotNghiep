# Script build grade2 complete question bank hỗ trợ nhập, xuất, kiểm tra hoặc bảo trì dữ liệu và cấu hình của dự án.
from __future__ import annotations

import base64
import hashlib
import importlib.util
import json
import random
import re
import shutil
import unicodedata
from collections import defaultdict
from pathlib import Path

from docx import Document
from docx.oxml.ns import qn


PROJECT = Path(__file__).resolve().parents[1]
DATA_ROOT = Path(r"C:\Users\WIND-OF-FALL\Pictures\DataToan\Lop_02")
CURRENT_TEX = PROJECT / "data" / "grade2_question_bank.tex"
CURRENT_SOURCE_TEX = PROJECT / "data" / "grade2_question_bank_lythuyet_source.tex"
OUTPUT_DOCX = PROJECT / "output" / "doc" / "ngan_hang_cau_hoi_toan_2_canh_dieu.docx"
OUTPUT_TEX = PROJECT / "data" / "grade2_question_bank.tex"
REPORT_PATH = PROJECT / "output" / "doc" / "grade2_content_review_report.json"
ASSET_DIR = PROJECT / "output" / "grade2-master-assets"

BASE_SCRIPT = PROJECT / "scripts" / "build_grade5_question_bank.py"
spec = importlib.util.spec_from_file_location("question_bank_builder", BASE_SCRIPT)
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)
builder.GRADE = 2
builder.EXPECTED_LESSON_NUMBERS = list(range(1, 52))
builder.OUTPUT_DOCX = OUTPUT_DOCX
builder.OUTPUT_TEX = OUTPUT_TEX
builder.TEMP_IMAGES = ASSET_DIR / "compressed"


# Hàm clean dùng để chuẩn hóa và làm sạch dữ liệu đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def clean(value: object) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip().rstrip()


# Hàm normalized dùng để chuẩn hóa và làm sạch dữ liệu đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def normalized(value: object) -> str:
    return clean(value).casefold().replace("−", "-").replace("×", "x")


# Hàm ascii_text dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def ascii_text(value: object) -> str:
    text = normalized(value).replace("đ", "d")
    return "".join(
        char
        for char in unicodedata.normalize("NFD", text)
        if unicodedata.category(char) != "Mn"
    )


# Hàm title_key dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def title_key(value: object) -> str:
    text = ascii_text(value)
    matches = list(re.finditer(r"\bbai\s*\d+\s*[.:-]\s*", text))
    if matches:
        text = text[matches[-1].end() :]
    text = text.replace("1 000", "1000")
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return clean(text)


# Hàm semantic_choice_key dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def semantic_choice_key(value: object) -> str:
    text = normalized(value)
    words = text.split()
    if len(words) <= 4 and not any(token in text for token in ("nhiều", "ít", "bằng")):
        for direction in ("trên", "dưới", "trái", "phải", "trước", "sau", "giữa"):
            if direction in text:
                return f"direction:{direction}"
    return text


# Hàm parse_current_payloads dùng để phân tích đầu vào thành cấu trúc có thể sử dụng; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def parse_current_payloads() -> list[dict]:
    records = []
    for line in CURRENT_SOURCE_TEX.read_text(encoding="utf-8").splitlines():
        if not line.startswith("% DBJSON "):
            continue
        payload = json.loads(base64.b64decode(line[9:]).decode("utf-8"))
        choices = [
            {"key": clean(item["key"]), "text": clean(item["text"])}
            for item in payload["choices"]
        ]
        answer = next(
            item["text"] for item in choices if item["key"] == payload["correct_answer"]
        )
        images = payload.get("content", {}).get("images", [])
        image_path = clean(images[0].get("source_path")) if images else ""
        records.append(
            {
                "lesson_number": int(payload["lesson_number"]),
                "source_kind": "main",
                "source_file": payload.get("source_file", CURRENT_TEX.name),
                "source_question_number": len(records) + 1,
                "prompt": clean(payload["content"]["text"]),
                "raw_choices": choices,
                "answer_key": clean(payload["correct_answer"]),
                "answer_text": clean(answer),
                "explanation": clean(payload.get("explanation", {}).get("text")),
                "difficulty": clean(payload.get("difficulty")) or "EASY",
                "image_source_path": image_path,
                "image_relative_path": Path(image_path).name if image_path else "",
            }
        )
    if len(records) != 1020:
        raise ValueError(f"Nguồn hiện tại phải có 1.020 câu, tìm thấy {len(records)}.")
    return records


# Hàm canonical_titles dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def canonical_titles(records: list[dict]) -> dict[int, str]:
    result = {}
    for record in records:
        result.setdefault(record["lesson_number"], "")
    for line in CURRENT_SOURCE_TEX.read_text(encoding="utf-8").splitlines():
        if line.startswith("% DBJSON "):
            payload = json.loads(base64.b64decode(line[9:]).decode("utf-8"))
            result[int(payload["lesson_number"])] = clean(payload["lesson_title"])
    if set(result) != set(range(1, 52)):
        raise ValueError("Không đọc đủ 51 tiêu đề bài lớp 2.")
    return result


# Hàm selected_data_files dùng để lựa chọn phương án phù hợp dựa trên trạng thái và ưu tiên; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def selected_data_files() -> tuple[list[Path], list[Path]]:
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


# Hàm is_question_line dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def is_question_line(text: str) -> bool:
    return (
        len(text) > 6
        and text[0] == "C"
        and text[3:4] == " "
        and text[4:5].isdigit()
        and (":" in text[:12] or "." in text[:12])
    )


# Hàm strip_question_number dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def strip_question_number(text: str) -> str:
    colon = text.find(":")
    dot = text.find(".")
    positions = [item for item in (colon, dot) if 0 <= item < 12]
    return clean(text[min(positions) + 1 :] if positions else text)


# Hàm parse_choices dùng để phân tích đầu vào thành cấu trúc có thể sử dụng; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def parse_choices(text: str) -> list[dict]:
    if ":" in text and normalized(text).startswith(("lựa chọn", "lua chon")):
        text = text.split(":", 1)[1]
    matches = list(re.finditer(r"(?<!\S)([A-D])\.\s*", text))
    choices = []
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        choice_text = clean(text[match.end() : end])
        if choice_text:
            choices.append({"key": match.group(1), "text": choice_text})
    return choices


# Hàm parse_answer dùng để phân tích đầu vào thành cấu trúc có thể sử dụng; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def parse_answer(text: str) -> tuple[str, str]:
    answer = clean(text.split(":", 1)[1] if ":" in text else text).rstrip(".")
    match = re.match(r"^([A-D])\.\s*(.+)$", answer)
    if match:
        return match.group(1), clean(match.group(2)).rstrip(".")
    return "", answer


# Hàm lesson_number_for_heading dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def lesson_number_for_heading(
    heading: str,
    canonical: dict[int, str],
) -> int:
    direct = re.match(r"^BÀI\s+(\d+)\s+-\s+CHƯƠNG", heading, re.IGNORECASE)
    if direct:
        number = int(direct.group(1))
        if 1 <= number <= 51:
            return number

    key = title_key(heading)
    candidates = [
        number for number, title in canonical.items() if title_key(title) == key
    ]
    if len(candidates) == 1:
        return candidates[0]
    if len(candidates) > 1:
        return min(candidates)

    manual = {
        "thuc hanh lap ghep xep hinh phang": 23,
        "luyen tap chung phan 1": 34,
        "luyen tap chung phan 2": 34,
        "thuc hanh lap ghep xep hinh khoi": 35,
    }
    if key in manual:
        return manual[key]
    raise ValueError(f"Không map được tiêu đề DataToan: {heading!r} (key={key!r})")


# Hàm save_paragraph_images dùng để cập nhật trạng thái hoặc dữ liệu theo quy tắc nghiệp vụ; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def save_paragraph_images(paragraph, source: Path, question_number: int) -> list[Path]:
    result = []
    blips = paragraph._p.xpath(".//a:blip")
    if not blips:
        return result
    folder_hash = hashlib.sha1(str(source).encode("utf-8")).hexdigest()[:10]
    target_dir = ASSET_DIR / folder_hash
    target_dir.mkdir(parents=True, exist_ok=True)
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


# Hàm parse_data_docx dùng để phân tích đầu vào thành cấu trúc có thể sử dụng; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def parse_data_docx(
    path: Path,
    canonical: dict[int, str],
    source_kind: str,
) -> list[dict]:
    document = Document(path)
    records = []
    current_lesson = None
    current = None
    local_question_number = 0

# Hàm flush dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

    def flush() -> None:
        nonlocal current
        if current is None:
            return
        if current_lesson is None:
            raise ValueError(f"Câu hỏi đứng trước tiêu đề bài trong {path.name}.")
        if not current["answer_text"]:
            raise ValueError(f"Thiếu đáp án trong {path.name}: {current['prompt']}")
        current["lesson_number"] = current_lesson
        image_paths = current.pop("_images")
        current["image_source_path"] = str(image_paths[0]) if image_paths else ""
        current["image_relative_path"] = (
            f"{path.name}/{image_paths[0].name}" if image_paths else ""
        )
        records.append(current)
        current = None

    for paragraph in document.paragraphs:
        text = clean(paragraph.text)
        style = paragraph.style.name
        if style == "Heading 1" and not is_question_line(text):
            flush()
            current_lesson = lesson_number_for_heading(text, canonical)
            local_question_number = 0
            continue
        if is_question_line(text):
            flush()
            if current_lesson is None:
                raise ValueError(f"Không có bài cho câu {text!r} trong {path.name}.")
            local_question_number += 1
            current = {
                "source_kind": source_kind,
                "source_file": path.name,
                "source_question_number": local_question_number,
                "prompt": strip_question_number(text),
                "raw_choices": [],
                "answer_key": "",
                "answer_text": "",
                "explanation": "",
                "difficulty": "EASY" if local_question_number <= 10 else "MEDIUM",
                "_images": [],
            }
        if current is None:
            continue
        current["_images"].extend(
            save_paragraph_images(paragraph, path, len(records) + 1)
        )
        if text.startswith("Lựa chọn"):
            current["raw_choices"] = parse_choices(text)
        elif text.startswith("Đáp án"):
            current["answer_key"], current["answer_text"] = parse_answer(text)
        elif text.startswith("Lời giải"):
            current["explanation"] = clean(text.split(":", 1)[1] if ":" in text else text)
    flush()
    return records


# Hàm number_distractors dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def number_distractors(answer: int) -> list[str]:
    candidates = [
        answer - 1,
        answer + 1,
        answer - 10,
        answer + 10,
        answer - 2,
        answer + 2,
        0,
    ]
    return [str(item) for item in dict.fromkeys(candidates) if item >= 0 and item != answer]


# Hàm distractors_for dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def distractors_for(prompt: str, answer: str) -> list[str]:
    if re.fullmatch(r"-?\d+", answer):
        return number_distractors(int(answer))
    unit = re.fullmatch(r"(-?\d+)\s*(cm|dm|m|km|kg|l|giờ|phút)", normalized(answer))
    if unit:
        number, suffix = int(unit.group(1)), unit.group(2)
        return [f"{item} {suffix}" for item in number_distractors(number)]
    if answer in {"<", ">", "="}:
        return [item for item in ("<", ">", "=") if item != answer]
    sequence = re.findall(r"\d+", answer)
    if len(sequence) >= 2:
        values = [int(item) for item in sequence]
        return [
            ", ".join(map(str, reversed(values))),
            ", ".join(str(item + 1) for item in values),
            ", ".join(str(max(0, item - 1)) for item in values),
        ]
    if any(symbol in answer for symbol in ("+", "-", "×", ":", "=")):
        match = re.search(r"(-?\d+)(?!.*\d)", answer)
        if match:
            value = int(match.group(1))
            return [
                answer[: match.start()] + item + answer[match.end() :]
                for item in number_distractors(value)
            ]
    return [
        "Phương án ngược lại",
        "Không đủ dữ kiện",
        "Một kết quả khác không phù hợp",
        "Không thực hiện được",
    ]


# Hàm expression_value dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def expression_value(left: int, operator: str, right: int) -> int | None:
    if operator in {"+", "＋"}:
        return left + right
    if operator in {"-", "−"}:
        return left - right
    if operator in {"x", "×", "*"}:
        return left * right
    if operator in {":", "÷"} and right and left % right == 0:
        return left // right
    return None


# Hàm math_repair dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def math_repair(record: dict, corrections: list[dict]) -> None:
    prompt = record["prompt"].replace("−", "-").replace("×", "x")
    answer = clean(record["answer_text"])
    direct = re.search(r"(?<!\d)(\d+)\s*([+\-x:])\s*(\d+)\s*=\s*\?", prompt)
    standalone_blank = r"(?<!\d)(?:□|_+)(?!\d)"
    blank_patterns = [
        (rf"(\d+)\s*\+\s*{standalone_blank}\s*=\s*(\d+)", lambda a, b: b - a),
        (rf"{standalone_blank}\s*\+\s*(\d+)\s*=\s*(\d+)", lambda a, b: b - a),
        (rf"(\d+)\s*-\s*{standalone_blank}\s*=\s*(\d+)", lambda a, b: a - b),
        (rf"(\d+)\s*x\s*{standalone_blank}\s*=\s*(\d+)", lambda a, b: b // a if a and b % a == 0 else None),
    ]
    expected = None
    if direct:
        expected = expression_value(int(direct.group(1)), direct.group(2), int(direct.group(3)))
    else:
        for pattern, solve in blank_patterns:
            match = re.search(pattern, prompt)
            if match:
                expected = solve(int(match.group(1)), int(match.group(2)))
                break
    if expected is not None and re.fullmatch(r"-?\d+", answer) and int(answer) != expected:
        old = answer
        expected_text = str(expected)
        matching = next(
            (
                item
                for item in record["raw_choices"]
                if normalized(item["text"]) == normalized(expected_text)
            ),
            None,
        )
        record["answer_text"] = expected_text
        record["answer_key"] = matching["key"] if matching else ""
        corrections.append(
            {
                "source": record["source_file"],
                "lesson_number": record.get("lesson_number"),
                "question": record["prompt"],
                "old_answer": old,
                "new_answer": expected_text,
                "reason": "Sửa theo phép tính trực tiếp/ô trống.",
            }
        )

# Hàm finalize_choices dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def finalize_choices(record: dict, conversions: list[dict]) -> None:
    answer_key = clean(record.get("answer_key"))
    answer_text = clean(record.get("answer_text")).rstrip(".")
    if answer_key:
        keyed = next(
            (item for item in record["raw_choices"] if item["key"] == answer_key),
            None,
        )
        if keyed:
            answer_text = clean(keyed["text"]).rstrip(".")

    unique = []
    seen = set()
    for item in record["raw_choices"]:
        text = clean(item["text"]).rstrip(".")
        key = semantic_choice_key(text)
        if text and key not in seen:
            seen.add(key)
            unique.append(text)
    answer_semantic = semantic_choice_key(answer_text)
    if answer_semantic not in seen:
        unique.insert(0, answer_text)
        seen.add(answer_semantic)

    original_count = len(unique)
    for distractor in distractors_for(record["prompt"], answer_text):
        key = semantic_choice_key(distractor)
        if key and key not in seen:
            seen.add(key)
            unique.append(clean(distractor))
        if len(unique) >= 4:
            break
    if len(unique) < 4:
        raise ValueError(f"Không tạo đủ bốn lựa chọn: {record['prompt']}")
    correct_text = next(
        item for item in unique if semantic_choice_key(item) == answer_semantic
    )
    others = [item for item in unique if semantic_choice_key(item) != answer_semantic]
    unique = [correct_text, *others[:3]]
    rng = random.Random(
        f"{record['source_file']}|{record.get('lesson_number')}|{record['source_question_number']}"
    )
    rng.shuffle(unique)
    record["choices"] = [
        {"key": chr(65 + index), "text": text} for index, text in enumerate(unique)
    ]
    record["correct_answer"] = next(
        item["key"]
        for item in record["choices"]
        if semantic_choice_key(item["text"]) == answer_semantic
    )
    record["answer_text"] = correct_text
    if original_count < 4:
        conversions.append(
            {
                "source": record["source_file"],
                "lesson_number": record.get("lesson_number"),
                "question": record["prompt"],
                "action": "Bổ sung phương án để đủ bốn lựa chọn.",
            }
        )


# Hàm explanation_for dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def explanation_for(record: dict) -> str:
    if record["explanation"]:
        return record["explanation"]
    return f"Dựa vào dữ kiện và phép tính phù hợp, đáp án đúng là: {record['answer_text']}."


# Hàm record_signature dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def record_signature(record: dict) -> tuple:
    return (
        int(record["lesson_number"]),
        normalized(record["prompt"]),
        tuple(sorted(normalized(item["text"]) for item in record["choices"])),
        normalized(record["answer_text"]),
    )


# Hàm audit_record dùng để đối chiếu kết quả với các điều kiện mong đợi và báo cáo sai lệch; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def audit_record(record: dict) -> list[str]:
    issues = []
    choices = record["choices"]
    if len(choices) != 4:
        issues.append("Không có đúng bốn lựa chọn.")
    if len({semantic_choice_key(item["text"]) for item in choices}) != len(choices):
        issues.append("Có lựa chọn trùng hoặc đồng nghĩa.")
    if record["correct_answer"] not in {item["key"] for item in choices}:
        issues.append("Khóa đáp án không tồn tại.")
    correct_text = next(
        (item["text"] for item in choices if item["key"] == record["correct_answer"]),
        "",
    )
    prompt_ascii = ascii_text(record["prompt"])
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
        value = expression_value(
            int(simple_equation.group(1)),
            simple_equation.group(2),
            int(simple_equation.group(3)),
        )
        if value is not None and value != int(simple_equation.group(4)):
            issues.append(f"Phương trình đáp án sai: {correct_text}")
    if "\ufffd" in record["prompt"] or "\u00c3" in record["prompt"]:
        issues.append("Nội dung có dấu hiệu lỗi mã hóa.")
    return issues


# Hàm main dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def main() -> None:
    if not DATA_ROOT.exists():
        raise FileNotFoundError(DATA_ROOT)
    if not CURRENT_SOURCE_TEX.exists():
        shutil.copy2(CURRENT_TEX, CURRENT_SOURCE_TEX)
    current_records = parse_current_payloads()
    canonical = canonical_titles(current_records)
    selected, excluded = selected_data_files()

    data_records = []
    data_source_counts = {}
    for path in selected:
        records = parse_data_docx(path, canonical, "supplement")
        data_records.extend(records)
        data_source_counts[path.name] = len(records)
    if len(data_records) != 1113:
        raise ValueError(f"Nguồn DataToan phải có 1.113 câu, tìm thấy {len(data_records)}.")

    source_records = [*current_records, *data_records]
    corrections = []
    conversions = []
    for record in source_records:
        math_repair(record, corrections)
        finalize_choices(record, conversions)
        record["explanation"] = explanation_for(record)

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

    remaining_issues = []
    lessons = []
    for lesson_number in range(1, 52):
        questions = grouped[lesson_number]
        for index, record in enumerate(questions, 1):
            record["lesson_title"] = canonical[lesson_number]
            record["bank_index"] = index
            record["id"] = f"G2-L{lesson_number:03d}-Q{index:03d}"
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
            f"Còn {len(remaining_issues)} lỗi:\n"
            + json.dumps(remaining_issues[:30], ensure_ascii=False, indent=2)
        )

    source_counts = defaultdict(int)
    included_counts = defaultdict(int)
    for record in source_records:
        source_counts[record["source_file"]] += 1
    for record in deduplicated:
        included_counts[record["source_file"]] += 1

    report = {
        "grade": 2,
        "scope": "Hai nguồn: LYTHUYET hiện tại và Pictures/DataToan/Lop_02.",
        "lesson_count": 51,
        "question_count_before_deduplication": len(source_records),
        "question_count": len(deduplicated),
        "image_count": sum(bool(record["image_source_path"]) for record in deduplicated),
        "current_source_question_count": len(current_records),
        "datatoan_source_question_count": len(data_records),
        "source_counts": dict(source_counts),
        "included_counts": dict(included_counts),
        "duplicate_questions_removed": len(duplicates),
        "duplicate_details": duplicates,
        "math_corrections": corrections,
        "converted_or_completed_choices": len(conversions),
        "excluded_duplicate_files": [
            {
                "file": str(path),
                "reason": "Có bản (1) cùng tên gốc; giữ bản (1) vì đầy đủ/lớn hơn.",
            }
            for path in excluded
        ],
        "checks": [
            "Đủ 51 bài trong Curriculum lớp 2.",
            "Mỗi câu có đúng bốn lựa chọn khác nhau và một đáp án.",
            "Kiểm tra phép cộng, trừ, nhân, chia trực tiếp và số điền khuyết.",
            "Kiểm tra phương trình trong lựa chọn đúng.",
            "Loại trùng theo bài, nội dung, lựa chọn và đáp án.",
            "Kiểm tra ảnh nguồn tồn tại trước khi đóng gói Word/database.",
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
                "lessons": 51,
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


# Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
if __name__ == "__main__":
    main()
