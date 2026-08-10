# Script build grade5 question bank h? tr? nh?p, xu?t, ki?m tra ho?c b?o tr? d? li?u v? c?u h?nh c?a d? ?n.
from __future__ import annotations

import base64
import json
import re
import shutil
from collections import defaultdict
from pathlib import Path

from docx import Document
from docx.enum.section import WD_SECTION_START
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor
from PIL import Image

# Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c ch?nh.
try:
    from ftfy import fix_text
# H?m fix_text d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
except ImportError:
    def fix_text(value: str) -> str:
        return value


PROJECT = Path(__file__).resolve().parents[1]
GRADE = 5
EXPECTED_LESSON_NUMBERS = list(range(1, 92))
SOURCE_ROOT = Path(r"C:\Users\WIND-OF-FALL\Documents\Project\LYTHUYET")
SOURCE_TMP = SOURCE_ROOT / "tmp"
MAIN_IMAGE_ROOT = SOURCE_ROOT / "output" / "toan_5_canh_dieu" / "anh_cau_hoi"
EXTRA_IMAGE_ROOT = SOURCE_ROOT / "output" / "toan_5_canh_dieu" / "anh_cau_hoi_bo_sung"
OUTPUT_DOCX = PROJECT / "output" / "doc" / "ngan_hang_cau_hoi_toan_5_canh_dieu.docx"
OUTPUT_TEX = PROJECT / "data" / "grade5_question_bank.tex"
TEMP_IMAGES = SOURCE_ROOT / "tmp" / "docs" / "grade5_bank_compressed"

IMAGE_RE = re.compile(r"\[[^\]]*?:\s*`([^`]+\.(?:png|jpe?g))`\]", re.I)
LESSON_RE = re.compile(r"^#{2,3}\s+Bài\s+(\d+)\.\s*(.+)$")
QUESTION_RE = re.compile(r"^\*\*Câu\s+(\d+)\.\*\*\s*(.*)$")
CHOICE_RE = re.compile(r"(?:^|\s{2,})([A-D])\.\s*")
ANSWER_RE = re.compile(
    r"^\*\*Đáp án:\*\*\s*([A-D])\.\s*(.*?)(?:\s+\*\*Lời giải:\*\*\s*(.*))?$"
)
SOLUTION_RE = re.compile(r"^\*\*Lời giải:\*\*\s*(.*)$")


# H?m clean d?ng ?? chu?n h?a v? l?m s?ch d? li?u ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def clean(value: str) -> str:
    return re.sub(r"\s+", " ", fix_text(value or "")).strip()


# H?m parse_choices d?ng ?? ph?n t?ch ??u v?o th?nh c?u tr?c c? th? s? d?ng; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def parse_choices(line: str) -> list[dict]:
    matches = list(CHOICE_RE.finditer(line))
    return [
        {"key": match.group(1), "text": clean(line[match.end() : matches[index + 1].start() if index + 1 < len(matches) else None])}
        for index, match in enumerate(matches)
    ]


# H?m difficulty d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def difficulty(question_number: int, source_kind: str) -> str:
    if source_kind == "supplement":
        return ("MEDIUM", "MEDIUM", "HARD")[(question_number - 1) % 3]
    if question_number <= 7:
        return "EASY"
    if question_number <= 14:
        return "MEDIUM"
    return "HARD"


# H?m source_files d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def source_files() -> list[tuple[Path, str]]:
    main = [(path, "main") for path in sorted(SOURCE_TMP.glob("toan5_bai*.md"))]
    extra = [(path, "supplement") for path in sorted(SOURCE_TMP.glob("toan5_bo_sung*.md"))]
    return main + extra


# H?m parse_bank d?ng ?? ph?n t?ch ??u v?o th?nh c?u tr?c c? th? s? d?ng; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def parse_bank() -> list[dict]:
    lessons: dict[int, dict] = {}
    counters: defaultdict[int, int] = defaultdict(int)

    for path, source_kind in source_files():
        image_root = EXTRA_IMAGE_ROOT if source_kind == "supplement" else MAIN_IMAGE_ROOT
        current_lesson = None
        current_question = None

# H?m finish_question d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

        def finish_question() -> None:
            nonlocal current_question
            if not current_question:
                return
            number = current_question["lesson_number"]
            counters[number] += 1
            current_question["bank_index"] = counters[number]
            current_question["id"] = f"G{GRADE}-L{number:03d}-Q{counters[number]:03d}"
            current_question["difficulty"] = difficulty(current_question["source_question_number"], source_kind)
            lessons[number]["questions"].append(current_question)
            current_question = None

        for raw_line in fix_text(path.read_text(encoding="utf-8")).splitlines():
            line = raw_line.strip()
            if not line or line.startswith("# "):
                continue

            lesson_match = LESSON_RE.match(line)
            if lesson_match:
                finish_question()
                lesson_number = int(lesson_match.group(1))
                current_lesson = lessons.setdefault(
                    lesson_number,
                    {"number": lesson_number, "title": clean(lesson_match.group(2)), "questions": []},
                )
                continue

            question_match = QUESTION_RE.match(line)
            if question_match:
                finish_question()
                if current_lesson is None:
                    raise ValueError(f"Câu hỏi nằm ngoài bài học: {path.name}: {line}")
                prompt = question_match.group(2)
                image_match = IMAGE_RE.search(prompt)
                image_source = None
                image_relative = None
                if image_match:
                    image_relative = image_match.group(1).replace("\\", "/")
                    image_source = image_root.joinpath(*Path(image_relative).parts)
                    prompt = IMAGE_RE.sub("", prompt)
                current_question = {
                    "lesson_number": current_lesson["number"],
                    "lesson_title": current_lesson["title"],
                    "source_kind": source_kind,
                    "source_file": path.name,
                    "source_question_number": int(question_match.group(1)),
                    "prompt": clean(prompt),
                    "choices": [],
                    "correct_answer": "",
                    "answer_text": "",
                    "explanation": "",
                    "image_source_path": str(image_source.resolve()) if image_source else "",
                    "image_relative_path": image_relative or "",
                }
                continue

            if current_question is None:
                continue
            answer_match = ANSWER_RE.match(line)
            solution_match = SOLUTION_RE.match(line)
            if answer_match:
                current_question["correct_answer"] = answer_match.group(1)
                current_question["answer_text"] = clean(answer_match.group(2))
                if answer_match.group(3):
                    current_question["explanation"] = clean(answer_match.group(3))
            elif solution_match:
                current_question["explanation"] = clean(solution_match.group(1))
            elif re.match(r"^[A-D]\.\s*", line):
                parsed = parse_choices(line)
                if parsed:
                    if parsed[0]["key"] == "A" and len(parsed) > 1:
                        current_question["choices"] = parsed
                    else:
                        current_question["choices"].extend(parsed)
            elif not current_question["choices"] and not current_question["correct_answer"]:
                current_question["prompt"] = clean(f"{current_question['prompt']} {line}")
            else:
                current_question["explanation"] = clean(f"{current_question['explanation']} {line}")
        finish_question()

    result = [lessons[number] for number in sorted(lessons)]
    validate_bank(result)
    return result


# H?m validate_bank d?ng ?? ki?m tra t?nh h?p l? v? c?c ?i?u ki?n an to?n; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def validate_bank(lessons: list[dict]) -> None:
    errors = []
    if [item["number"] for item in lessons] != EXPECTED_LESSON_NUMBERS:
        errors.append(
            f"Ngân hàng không phủ đúng danh sách bài mong đợi: {EXPECTED_LESSON_NUMBERS[0]}-"
            f"{EXPECTED_LESSON_NUMBERS[-1]}."
        )
    for lesson in lessons:
        for question in lesson["questions"]:
            if not 2 <= len(question["choices"]) <= 4:
                errors.append(f"{question['id']}: có {len(question['choices'])} lựa chọn.")
            if question["correct_answer"] not in {"A", "B", "C", "D"}:
                errors.append(f"{question['id']}: thiếu đáp án đúng.")
            if not question["prompt"] or not question["explanation"]:
                errors.append(f"{question['id']}: thiếu nội dung hoặc lời giải.")
            if question["image_source_path"] and not Path(question["image_source_path"]).exists():
                errors.append(f"{question['id']}: thiếu ảnh {question['image_source_path']}.")
    if errors:
        raise ValueError("\n".join(errors[:50]))


# H?m latex_escape d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def latex_escape(value: str) -> str:
    replacements = {
        "\\": r"\textbackslash{}",
        "&": r"\&",
        "%": r"\%",
        "$": r"\$",
        "#": r"\#",
        "_": r"\_",
        "{": r"\{",
        "}": r"\}",
        "~": r"\textasciitilde{}",
        "^": r"\textasciicircum{}",
        "×": r"$\times$",
        "÷": r"$\div$",
        "−": r"$-$",
        "≈": r"$\approx$",
        "≠": r"$\neq$",
        "≤": r"$\leq$",
        "≥": r"$\geq$",
        "⟂": r"$\perp$",
        "□": r"$\square$",
        "°": r"$^\circ$",
        "²": r"$^2$",
        "³": r"$^3$",
    }
    return "".join(replacements.get(char, char) for char in value)


# H?m question_payload d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def question_payload(question: dict) -> dict:
    images = []
    if question["image_source_path"]:
        images.append(
            {
                "id": f"{question['id']}-IMG-01",
                "source_path": question["image_source_path"],
                "url": "",
                "alt_text": f"Hình minh họa {question['id']}",
                "width_percent": 100,
            }
        )
    return {
        "external_id": question["id"],
        "grade": GRADE,
        "lesson_number": question["lesson_number"],
        "lesson_title": question["lesson_title"],
        "question_type": "MULTIPLE_CHOICE",
        "difficulty": question["difficulty"],
        "layout_template": "SPLIT_HORIZONTAL_LEFT_IMAGE" if images else "STACK_VERTICAL",
        "content": {"text": question["prompt"], "images": images},
        "choices": [{**choice, "images": []} for choice in question["choices"]],
        "correct_answer": question["correct_answer"],
        "explanation": {"text": question["explanation"], "images": []},
        "misconceptions": question.get("misconceptions", []),
        "source_kind": question["source_kind"],
        "source_file": question["source_file"],
    }


# H?m write_tex d?ng ?? c?p nh?t tr?ng th?i ho?c d? li?u theo quy t?c nghi?p v?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def write_tex(lessons: list[dict]) -> None:
    OUTPUT_TEX.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        r"\documentclass[11pt,a4paper]{article}",
        r"\usepackage[utf8]{inputenc}",
        r"\usepackage[T5]{fontenc}",
        r"\usepackage[vietnamese]{babel}",
        r"\usepackage{amsmath,amssymb,enumitem,geometry,graphicx}",
        r"\geometry{margin=2cm}",
        rf"\title{{Ngân hàng câu hỏi Toán {GRADE} - Cánh Diều}}",
        r"\author{Project ThucTapTotNghiep}",
        r"\date{}",
        r"\begin{document}",
        r"\maketitle",
        r"\tableofcontents",
        r"\newpage",
        "",
        "% Mỗi dòng DBJSON chứa payload UTF-8 mã hóa Base64 để scripts/import_grade5_question_bank_tex.js import an toàn.",
    ]
    for lesson in lessons:
        lines.extend(["", rf"\section{{Bài {lesson['number']}. {latex_escape(lesson['title'])}}}"])
        for question in lesson["questions"]:
            payload = json.dumps(question_payload(question), ensure_ascii=False, separators=(",", ":"))
            encoded = base64.b64encode(payload.encode("utf-8")).decode("ascii")
            lines.extend(
                [
                    "",
                    f"% DBJSON {encoded}",
                    r"\noindent\begin{minipage}{\textwidth}",
                    rf"\noindent\textbf{{{question['id']} ({question['difficulty']}):}} {latex_escape(question['prompt'])}",
                    r"\begin{itemize}[label={}]",
                    *[
                        rf"\item {choice['key']}. {latex_escape(choice['text'])}"
                        for choice in question["choices"]
                    ],
                    r"\end{itemize}",
                    rf"\textbf{{Đáp án đúng:}} {question['correct_answer']}\\",
                    rf"\textbf{{Lời giải:}} {latex_escape(question['explanation'])}",
                ]
            )
            if question["image_source_path"]:
                image_label = Path(question["image_relative_path"]).name
                lines.append(
                    rf"\\ \textit{{Ảnh nguồn:}} "
                    rf"\texttt{{{latex_escape(image_label)}}}"
                )
            lines.extend([r"\end{minipage}", r"\vspace{0.8em}"])
    lines.extend(["", r"\end{document}", ""])
    OUTPUT_TEX.write_text("\n".join(lines), encoding="utf-8")


# H?m add_toc d?ng ?? t?o b?n ghi ho?c t?i nguy?n m?i sau khi ki?m tra ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def add_toc(document: Document) -> None:
    paragraph = document.add_paragraph()
    paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = paragraph.add_run()
    field_begin = OxmlElement("w:fldChar")
    field_begin.set(qn("w:fldCharType"), "begin")
    instruction = OxmlElement("w:instrText")
    instruction.set(qn("xml:space"), "preserve")
    instruction.text = 'TOC \\o "1-2" \\h \\z \\u'
    field_separate = OxmlElement("w:fldChar")
    field_separate.set(qn("w:fldCharType"), "separate")
    placeholder = OxmlElement("w:t")
    placeholder.text = "Mở file trong Word và chọn Update Field để cập nhật mục lục."
    field_end = OxmlElement("w:fldChar")
    field_end.set(qn("w:fldCharType"), "end")
    run._r.extend([field_begin, instruction, field_separate, placeholder, field_end])


# H?m compressed_image d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def compressed_image(source: Path, question_id: str) -> Path:
    target = TEMP_IMAGES / f"{question_id}.jpg"
    if target.exists() and target.stat().st_mtime >= source.stat().st_mtime:
        try:
            with Image.open(target) as cached:
                cached.verify()
            return target
        except Exception:
            target.unlink(missing_ok=True)
    TEMP_IMAGES.mkdir(parents=True, exist_ok=True)
    with Image.open(source) as image:
        image = image.convert("RGB")
        image.thumbnail((1400, 1400), Image.Resampling.LANCZOS)
        image.save(target, "JPEG", quality=78, optimize=True, progressive=True)
    return target


# H?m set_keep d?ng ?? c?p nh?t tr?ng th?i ho?c d? li?u theo quy t?c nghi?p v?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def set_keep(paragraph, next_paragraph: bool = False) -> None:
    paragraph.paragraph_format.keep_together = True
    paragraph.paragraph_format.keep_with_next = next_paragraph


# H?m write_docx d?ng ?? c?p nh?t tr?ng th?i ho?c d? li?u theo quy t?c nghi?p v?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def write_docx(lessons: list[dict]) -> None:
    OUTPUT_DOCX.parent.mkdir(parents=True, exist_ok=True)
    document = Document()
    section = document.sections[0]
    section.top_margin = section.bottom_margin = Cm(1.6)
    section.left_margin = section.right_margin = Cm(1.8)
    section.header_distance = Cm(0.7)
    section.footer_distance = Cm(0.7)

    normal = document.styles["Normal"]
    normal.font.name = "Arial"
    normal.font.size = Pt(10)
    normal.paragraph_format.space_after = Pt(3)
    normal.paragraph_format.line_spacing = 1.05
    for style_name, size, color in [
        ("Title", 22, RGBColor(31, 78, 121)),
        ("Heading 1", 16, RGBColor(31, 78, 121)),
        ("Heading 2", 12, RGBColor(47, 84, 150)),
    ]:
        style = document.styles[style_name]
        style.font.name = "Arial"
        style.font.size = Pt(size)
        style.font.color.rgb = color

    title = document.add_paragraph(style="Title")
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    title.add_run(f"NGÂN HÀNG CÂU HỎI TOÁN {GRADE} - CÁNH DIỀU")
    total_questions = sum(len(item["questions"]) for item in lessons)
    main_questions = sum(
        question["source_kind"] == "main"
        for item in lessons
        for question in item["questions"]
    )
    supplement_questions = total_questions - main_questions
    covered_lessons = sum(bool(item["questions"]) for item in lessons)
    subtitle = document.add_paragraph()
    subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER
    subtitle.add_run(
        f"Tổng hợp {total_questions:,} câu hỏi nguồn - "
        f"{covered_lessons}/{len(lessons)} bài có dữ liệu"
    ).bold = True
    summary = document.add_paragraph()
    summary.alignment = WD_ALIGN_PARAGRAPH.CENTER
    if supplement_questions:
        summary.add_run(
            f"Gồm {main_questions:,} câu chính và {supplement_questions:,} câu bổ sung; "
            "có đáp án, lời giải và hình minh họa."
        )
    else:
        summary.add_run("Có đầy đủ đáp án, lời giải và hình minh họa.")
    document.add_paragraph()
    add_toc(document)
    document.add_page_break()

    for lesson_index, lesson in enumerate(lessons):
        if lesson_index:
            document.add_section(WD_SECTION_START.NEW_PAGE)
        document.add_heading(f"Bài {lesson['number']}. {lesson['title']}", level=1)
        document.add_paragraph(f"{len(lesson['questions'])} câu hỏi", style="Subtitle")
        for question in lesson["questions"]:
            heading = document.add_paragraph(style="Heading 2")
            heading.paragraph_format.space_before = Pt(8)
            heading.paragraph_format.space_after = Pt(3)
            heading.add_run(
                f"{question['id']} - {question['difficulty']} - "
                f"{'Bổ sung' if question['source_kind'] == 'supplement' else 'Bộ chính'}"
            )
            set_keep(heading, True)

            prompt = document.add_paragraph()
            prompt.add_run(question["prompt"]).bold = True
            set_keep(prompt, bool(question["image_source_path"]))

            if question["image_source_path"]:
                image_paragraph = document.add_paragraph()
                image_paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
                image_paragraph.add_run().add_picture(
                    str(compressed_image(Path(question["image_source_path"]), question["id"])),
                    width=Cm(14.5),
                )
                set_keep(image_paragraph, True)

            choices = document.add_paragraph()
            for index, choice in enumerate(question["choices"]):
                run = choices.add_run(f"{choice['key']}. {choice['text']}")
                if index < len(question["choices"]) - 1:
                    run.add_break()
            set_keep(choices, True)

            answer = document.add_paragraph()
            answer_run = answer.add_run(f"Đáp án: {question['correct_answer']}. {question['answer_text']}")
            answer_run.bold = True
            answer_run.font.color.rgb = RGBColor(0, 112, 60)
            set_keep(answer, True)

            explanation = document.add_paragraph()
            explanation.add_run("Lời giải: ").bold = True
            explanation.add_run(question["explanation"])

    document.save(OUTPUT_DOCX)
    shutil.rmtree(TEMP_IMAGES, ignore_errors=True)


# H?m main d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def main() -> None:
    lessons = parse_bank()
    write_tex(lessons)
    write_docx(lessons)
    total = sum(len(item["questions"]) for item in lessons)
    images = sum(bool(question["image_source_path"]) for item in lessons for question in item["questions"])
    print(json.dumps({"lessons": len(lessons), "questions": total, "images": images, "docx": str(OUTPUT_DOCX), "tex": str(OUTPUT_TEX)}, ensure_ascii=False))


# Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u hi?n t?i.
if __name__ == "__main__":
    main()
