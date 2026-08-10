"""Dàn trang 66 câu đã biên soạn thủ công của Bài 78, 82 và 83."""
# Script build manual question batch b78 b82 b83 docx h? tr? nh?p, xu?t, ki?m tra ho?c b?o tr? d? li?u v? c?u h?nh c?a d? ?n.

import importlib.util
import json
from pathlib import Path

from docx import Document
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Pt, RGBColor


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "manual_question_batches" / "grade5_b78_b82_b83.json"
ASSETS = ROOT / "output" / "doc" / "assets" / "grade5-b78-b82-b83" / "final"
OUTPUT = ROOT / "output" / "doc" / "Ngan_hang_cau_hoi_Toan_5_Bai_78_82_83_66_cau.docx"
LESSONS = (78, 82, 83)
LESSON_TITLES = {
    78: "Bài 78. Em vui học Toán",
    82: "Bài 82. Ôn tập về số tự nhiên và các phép tính với số tự nhiên",
    83: "Bài 83. Ôn tập về phân số và các phép tính với phân số",
}


# H?m helpers d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def helpers():
    path = ROOT / "scripts" / "build_manual_question_batch_b68_b71_b73_docx.py"
    spec = importlib.util.spec_from_file_location("shared_question_layout", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.ASSETS = ASSETS
    module.LESSON_TITLES = LESSON_TITLES
    return module


# H?m validate d?ng ?? ki?m tra t?nh h?p l? v? c?c ?i?u ki?n an to?n; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def validate(questions):
    if len(questions) != 66:
        raise ValueError(f"Cần 66 câu, hiện có {len(questions)}")
    names = []
    for lesson in LESSONS:
        items = [q for q in questions if q["lesson"] == lesson]
        if len(items) != 22 or [q["number"] for q in items] != list(range(1, 23)):
            raise ValueError(f"Bài {lesson} phải có 22 câu đánh số liên tục")
        illustrated = [q for q in items if q.get("image")]
        if len(illustrated) != 11:
            raise ValueError(f"Bài {lesson} phải có 11 câu có hình")
        names.extend(q["image"] for q in illustrated)
    if len(names) != len(set(names)):
        raise ValueError("Mỗi câu phải dùng một ảnh riêng")
    for name in names:
        if not (ASSETS / name.replace(".png", ".jpg")).exists():
            raise FileNotFoundError(name)


# H?m cover d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def cover(doc, payload):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(90)
    run = p.add_run("NGÂN HÀNG CÂU HỎI BỔ SUNG")
    run.bold = True
    run.font.size = Pt(24)
    run.font.color.rgb = RGBColor(31, 78, 121)
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run("TOÁN 5 - CÁNH DIỀU")
    run.bold = True
    run.font.size = Pt(29)
    run.font.color.rgb = RGBColor(237, 125, 49)
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run("Bài 78  •  Bài 82  •  Bài 83")
    run.bold = True
    run.font.size = Pt(19)
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(24)
    run = p.add_run("66 CÂU HỎI TỰ BIÊN SOẠN")
    run.bold = True
    run.font.size = Pt(15)
    run.font.color.rgb = RGBColor(31, 78, 121)
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.add_run("22 câu mỗi bài • 33 câu có hình minh họa riêng • 50% câu có hình\n").bold = True
    p.add_run("Mỗi câu có đề bài, phần trả lời, đáp án và lời giải chi tiết.")
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(28)
    run = p.add_run(payload["source"])
    run.italic = True
    run.font.size = Pt(10)
    run.font.color.rgb = RGBColor(89, 89, 89)
    doc.add_page_break()


# H?m summary d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def summary(doc, questions, h):
    doc.add_heading("THÔNG TIN BỘ CÂU HỎI", level=1)
    table = doc.add_table(rows=1, cols=4)
    table.style = "Table Grid"
    for index, text in enumerate(("Bài học", "Số câu", "Câu có hình", "Tỉ lệ")):
        cell = table.cell(0, index)
        cell.text = text
        h.set_shading(cell, "D9EAF7")
        cell.paragraphs[0].runs[0].bold = True
    for lesson in LESSONS:
        items = [q for q in questions if q["lesson"] == lesson]
        cells = table.add_row().cells
        for cell, value in zip(cells, (LESSON_TITLES[lesson], "22", "11", "50%")):
            cell.text = value
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
            h.set_cell_margins(cell)
    for note in (
        "Nội dung tự biên soạn thủ công sau khi đọc đúng phạm vi SGK.",
        "Mỗi câu có hình dùng một ảnh riêng để đảo thứ tự độc lập.",
        "Dữ kiện được ghi trực tiếp trên ảnh; ảnh không logo, không watermark.",
        "Không sử dụng mặt đồng hồ thiếu 12 số.",
        "Lời giải nêu quy tắc, các bước tính và kết luận rõ ràng.",
    ):
        doc.add_paragraph(note, style="List Bullet")
    doc.add_page_break()


# H?m main d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def main():
    payload = json.loads(DATA.read_text(encoding="utf-8"))
    questions = payload["questions"]
    validate(questions)
    h = helpers()
    doc = Document()
    h.configure(doc)
    cover(doc, payload)
    summary(doc, questions, h)
    for lesson in LESSONS:
        doc.add_heading(LESSON_TITLES[lesson].upper(), level=1)
        doc.add_paragraph("22 câu • 11 câu có hình riêng • Đáp án và lời giải trình bày độc lập.")
        for q in (item for item in questions if item["lesson"] == lesson):
            h.add_question(doc, q)
            if not (lesson == 83 and q["number"] == 22):
                doc.add_page_break()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    doc.save(OUTPUT)
    print(f"Saved {OUTPUT}")


# Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u hi?n t?i.
if __name__ == "__main__":
    main()
