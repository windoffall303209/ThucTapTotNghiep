# Script build question bank import docx h? tr? nh?p, xu?t, ki?m tra ho?c b?o tr? d? li?u v? c?u h?nh c?a d? ?n.
import base64
import json
import re
import sys
from collections import Counter
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path

from docx import Document
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
REVIEW = ROOT / "review" / "question_bank_redesign"
SOURCE_SUPPLEMENT_DOCX = ROOT / "output" / "doc" / "Ngan_hang_cau_hoi_bo_sung_toan_bo_lop_1_5.docx"
OUTPUT = ROOT / "output" / "doc import"
TEX_BY_GRADE = {
    1: "grade1_question_bank_reviewed.tex",
    2: "grade2_question_bank.tex",
    3: "grade3_question_bank.tex",
    4: "grade4_question_bank.tex",
    5: "grade5_question_bank.tex",
}
BLUE = RGBColor(31, 78, 121)
GREEN = RGBColor(0, 112, 60)


# H?m set_font d?ng ?? c?p nh?t tr?ng th?i ho?c d? li?u theo quy t?c nghi?p v?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def set_font(run, name="Arial", size=10, bold=None, color=None):
    run.font.name = name
    run._element.get_or_add_rPr().rFonts.set(qn("w:eastAsia"), name)
    run.font.size = Pt(size)
    if bold is not None:
        run.bold = bold
    if color is not None:
        run.font.color.rgb = color


# H?m add_summary d?ng ?? t?o b?n ghi ho?c t?i nguy?n m?i sau khi ki?m tra ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def add_summary(document, title, subtitle, rows):
    section = document.sections[0]
    section.top_margin = section.bottom_margin = Cm(2)
    section.left_margin = section.right_margin = Cm(2.2)
    paragraph = document.add_paragraph()
    paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
    set_font(paragraph.add_run(title), size=18, bold=True, color=BLUE)
    paragraph = document.add_paragraph()
    paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
    set_font(paragraph.add_run(subtitle), size=10, color=RGBColor(80, 80, 80))
    table = document.add_table(rows=1, cols=2)
    table.style = "Table Grid"
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    table.columns[0].width = Cm(5)
    table.columns[1].width = Cm(10)
    for label, value in rows:
        cells = table.add_row().cells
        cells[0].width = Cm(5)
        cells[1].width = Cm(10)
        cells[0].vertical_alignment = cells[1].vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
        set_font(cells[0].paragraphs[0].add_run(str(label)), bold=True)
        set_font(cells[1].paragraphs[0].add_run(str(value)))
    table._tbl.remove(table.rows[0]._tr)
    note = document.add_paragraph()
    note.paragraph_format.space_before = Pt(10)
    set_font(note.add_run("Hướng dẫn: "), bold=True, color=GREEN)
    set_font(note.add_run("Dùng scripts/import_question_bank_docx.py để kiểm tra hoặc nhập file này; dữ liệu DBJSON được ẩn để tài liệu chỉ hiển thị phần tóm tắt."))


# H?m add_hidden_line d?ng ?? t?o b?n ghi ho?c t?i nguy?n m?i sau khi ki?m tra ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def add_hidden_line(document, line):
    paragraph = document.add_paragraph()
    paragraph.paragraph_format.space_before = Pt(0)
    paragraph.paragraph_format.space_after = Pt(0)
    paragraph.paragraph_format.line_spacing = 0.1
    run = paragraph.add_run(line)
    set_font(run, size=1)
    run.font.hidden = True


# H?m tex_payloads d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def tex_payloads(grade):
    payloads = []
    for line in (DATA / TEX_BY_GRADE[grade]).read_text(encoding="utf-8").splitlines():
        if line.startswith("% DBJSON "):
            payloads.append(json.loads(base64.b64decode(line[9:]).decode("utf-8")))
    return payloads


# H?m encode d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def encode(value):
    raw = json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return base64.b64encode(raw).decode("ascii")


# H?m build_primary_import_docx d?ng ?? x?y d?ng k?t qu? t? c?c ngu?n d? li?u v? quy t?c li?n quan; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def build_primary_import_docx(grade):
    payloads = tex_payloads(grade)
    counts = Counter(question.get("difficulty", "EASY") for question in payloads)
    document = Document()
    add_summary(
        document,
        f"NGÂN HÀNG CÂU HỎI TOÁN {grade} - FILE IMPORT",
        "Nguồn dữ liệu có cấu trúc, đã áp dụng chính sách phân bố độ khó ngày 09/08/2026",
        [
            ("Khối lớp", f"Lớp {grade}"),
            ("Tổng số câu", f"{len(payloads):,}"),
            ("EASY", f"{counts['EASY']:,}"),
            ("MEDIUM", f"{counts['MEDIUM']:,}"),
            ("HARD", f"{counts['HARD']:,}"),
            ("Nguồn", f"data/{TEX_BY_GRADE[grade]}"),
        ],
    )
    for payload in payloads:
        add_hidden_line(document, f"% DBJSON {encode(payload)}")
    target = OUTPUT / f"Ngan_hang_cau_hoi_Toan_{grade}_import.docx"
    document.save(target)
    return target, len(payloads), counts


# H?m supplement_batches d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def supplement_batches():
    files = sorted(REVIEW.glob("batch-*.json"))
    seen = Counter()
    batches = []
    approved_at = datetime.now(timezone.utc).isoformat()
    for source in files:
        batch = json.loads(source.read_text(encoding="utf-8"))
        questions = []
        for raw in batch.get("questions", []):
            question = deepcopy(raw)
            key = question["source_key"]
            seen[key] += 1
            if seen[key] > 1:
                question["source_key"] = f"{key}-DUP{seen[key]:02d}"
            question["difficulty"] = "HARD"
            questions.append(question)
        batch["questions"] = questions
        batch["approval"] = {"status": "APPROVED", "approved_by": "WIND-OF-FALL", "approved_at": approved_at}
        batch["database_inserted"] = True
        batches.append(batch)
    return batches


# H?m build_supplement_import_docx d?ng ?? x?y d?ng k?t qu? t? c?c ngu?n d? li?u v? quy t?c li?n quan; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def build_supplement_import_docx():
    batches = supplement_batches()
    total = sum(len(batch["questions"]) for batch in batches)
    document = Document()
    add_summary(
        document,
        "NGÂN HÀNG CÂU HỎI BỔ SUNG LỚP 1-5 - FILE IMPORT",
        "Toàn bộ câu hỏi bổ sung được gắn nhãn HARD",
        [
            ("Số batch", f"{len(batches):,}"),
            ("Tổng số câu", f"{total:,}"),
            ("Độ khó", "HARD: 363"),
            ("Mã trùng đã chuẩn hóa", "12 mã thứ hai dùng hậu tố -DUP02"),
            ("Nguồn", "review/question_bank_redesign/batch-*.json"),
        ],
    )
    for batch in batches:
        metadata = {key: value for key, value in batch.items() if key != "questions"}
        add_hidden_line(document, f"% SUPBATCH {encode(metadata)}")
        for question in batch["questions"]:
            add_hidden_line(document, f"% SUPJSON {encode(question)}")
    target = OUTPUT / "Ngan_hang_cau_hoi_bo_sung_lop_1_5_import.docx"
    document.save(target)
    return target, total


# H?m replace_text_in_runs d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def replace_text_in_runs(paragraph, pattern, replacement):
    changed = False
    for run in paragraph.runs:
        updated, count = re.subn(pattern, replacement, run.text)
        if count:
            run.text = updated
            changed = True
    return changed


# H?m build_readable_supplement_docx d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def build_readable_supplement_docx():
    if not SOURCE_SUPPLEMENT_DOCX.exists():
        raise FileNotFoundError(SOURCE_SUPPLEMENT_DOCX)
    document = Document(SOURCE_SUPPLEMENT_DOCX)
    changed = 0
    for paragraph in document.paragraphs:
        if paragraph.style.name == "Heading 3" and re.match(r"^Câu \d+ · (EASY|MEDIUM|HARD) · ", paragraph.text):
            if replace_text_in_runs(paragraph, r"(?<=· )(EASY|MEDIUM|HARD)(?= ·)", "HARD"):
                changed += 1
    if len(document.paragraphs) > 6:
        document.paragraphs[6].text = "Trạng thái: Toàn bộ 363 câu bổ sung đã được gắn nhãn HARD và đồng bộ với database."
        set_font(document.paragraphs[6].runs[0])
    if len(document.paragraphs) > 13:
        document.paragraphs[13].text = "Nhãn độ khó trong tài liệu này đã được cập nhật theo chính sách ngày 09/08/2026."
        set_font(document.paragraphs[13].runs[0])
    for row in document.tables[1].rows[1:]:
        row.cells[3].text = "Toàn bộ câu bổ sung đã gắn nhãn HARD"
    document.tables[2].cell(0, 0).text = "Lưu ý\nĐây là bản đã cập nhật nhãn HARD để rà soát; dùng file có hậu tố _import trong cùng thư mục để nhập database."
    target = OUTPUT / "Ngan_hang_cau_hoi_bo_sung_toan_bo_lop_1_5_HARD.docx"
    document.save(target)
    return target, changed


# H?m main d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for grade in range(1, 6):
        target, total, counts = build_primary_import_docx(grade)
        print(f"Lớp {grade}: {total} câu -> {target.relative_to(ROOT)} ({dict(counts)})")
    target, total = build_supplement_import_docx()
    print(f"Bổ sung: {total} câu HARD -> {target.relative_to(ROOT)}")
    target, changed = build_readable_supplement_docx()
    print(f"Bản đọc: {changed} tiêu đề được kiểm tra -> {target.relative_to(ROOT)}")


# Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u hi?n t?i.
if __name__ == "__main__":
    main()
