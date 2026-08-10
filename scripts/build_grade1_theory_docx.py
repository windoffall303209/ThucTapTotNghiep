# Script build grade1 theory docx h? tr? nh?p, xu?t, ki?m tra ho?c b?o tr? d? li?u v? c?u h?nh c?a d? ?n.
import json
from pathlib import Path

from docx import Document
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor


ROOT = Path(__file__).resolve().parents[1]
INPUT_PATH = ROOT / "content-theory" / "grade-1-theory-blueprint.json"
OUTPUT_PATH = ROOT / "output" / "doc" / "ly-thuyet-lop-1-codex.docx"

TYPE_LABELS = {
    "observe": "Quan sát",
    "concept": "Nhận biết",
    "model": "Làm mẫu",
    "quick_try": "Thử nhanh",
    "remember": "Ghi nhớ",
}

INTERACTION_LABELS = {
    "none": "Không tương tác",
    "choose": "Chọn đáp án",
    "drag_drop": "Kéo thả",
    "count": "Đếm",
    "fill_blank": "Điền số/ô trống",
    "sort": "Sắp xếp",
    "match": "Nối/Ghép cặp",
}


# H?m set_cell_shading d?ng ?? c?p nh?t tr?ng th?i ho?c d? li?u theo quy t?c nghi?p v?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def set_cell_shading(cell, fill):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:fill"), fill)
    tc_pr.append(shd)


# H?m set_run_font d?ng ?? c?p nh?t tr?ng th?i ho?c d? li?u theo quy t?c nghi?p v?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def set_run_font(run, size=10.5, bold=False, italic=False, color=None):
    run.font.name = "Arial"
    run._element.rPr.rFonts.set(qn("w:eastAsia"), "Arial")
    run.font.size = Pt(size)
    run.bold = bold
    run.italic = italic
    if color:
        run.font.color.rgb = RGBColor.from_string(color)


# H?m set_cell_text d?ng ?? c?p nh?t tr?ng th?i ho?c d? li?u theo quy t?c nghi?p v?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def set_cell_text(cell, text, bold=False):
    cell.text = ""
    paragraph = cell.paragraphs[0]
    run = paragraph.add_run(str(text or ""))
    set_run_font(run, size=9, bold=bold)


# H?m set_repeat_table_header d?ng ?? c?p nh?t tr?ng th?i ho?c d? li?u theo quy t?c nghi?p v?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def set_repeat_table_header(row):
    tr_pr = row._tr.get_or_add_trPr()
    tbl_header = OxmlElement("w:tblHeader")
    tbl_header.set(qn("w:val"), "true")
    tr_pr.append(tbl_header)


# H?m set_document_defaults d?ng ?? c?p nh?t tr?ng th?i ho?c d? li?u theo quy t?c nghi?p v?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def set_document_defaults(doc):
    section = doc.sections[0]
    section.top_margin = Inches(0.75)
    section.bottom_margin = Inches(0.75)
    section.left_margin = Inches(0.75)
    section.right_margin = Inches(0.75)

    styles = doc.styles
    normal = styles["Normal"]
    normal.font.name = "Arial"
    normal._element.rPr.rFonts.set(qn("w:eastAsia"), "Arial")
    normal.font.size = Pt(10.5)

    for style_name, size, color in [
        ("Title", 22, "1F4E79"),
        ("Heading 1", 16, "1F4E79"),
        ("Heading 2", 13, "2F5597"),
        ("Heading 3", 11, "1F1F1F"),
    ]:
        style = styles[style_name]
        style.font.name = "Arial"
        style._element.rPr.rFonts.set(qn("w:eastAsia"), "Arial")
        style.font.size = Pt(size)
        style.font.color.rgb = RGBColor.from_string(color)
        style.font.bold = True


# H?m add_meta_paragraph d?ng ?? t?o b?n ghi ho?c t?i nguy?n m?i sau khi ki?m tra ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def add_meta_paragraph(doc, label, value):
    paragraph = doc.add_paragraph()
    label_run = paragraph.add_run(f"{label}: ")
    set_run_font(label_run, bold=True)
    value_run = paragraph.add_run(str(value or ""))
    set_run_font(value_run)


# H?m add_bullets d?ng ?? t?o b?n ghi ho?c t?i nguy?n m?i sau khi ki?m tra ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def add_bullets(doc, items):
    for item in items:
        paragraph = doc.add_paragraph(style="List Bullet")
        run = paragraph.add_run(item)
        set_run_font(run)


# H?m add_table d?ng ?? t?o b?n ghi ho?c t?i nguy?n m?i sau khi ki?m tra ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def add_table(doc, headers, rows):
    table = doc.add_table(rows=1, cols=len(headers))
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.style = "Table Grid"

    header_row = table.rows[0]
    set_repeat_table_header(header_row)
    for index, header in enumerate(headers):
        set_cell_text(header_row.cells[index], header, bold=True)
        set_cell_shading(header_row.cells[index], "D9EAF7")
        header_row.cells[index].vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER

    for row in rows:
        cells = table.add_row().cells
        for index, value in enumerate(row):
            set_cell_text(cells[index], value)
            cells[index].vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.TOP

    return table


# H?m build_docx d?ng ?? x?y d?ng k?t qu? t? c?c ngu?n d? li?u v? quy t?c li?n quan; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def build_docx():
    data = json.loads(INPUT_PATH.read_text(encoding="utf-8"))
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)

    doc = Document()
    set_document_defaults(doc)

    title = doc.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    title_run = title.add_run("LÝ THUYẾT TOÁN LỚP 1")
    set_run_font(title_run, size=24, bold=True, color="1F4E79")

    subtitle = doc.add_paragraph()
    subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER
    subtitle_run = subtitle.add_run("Bản thiết kế nội dung học theo thẻ - Codex")
    set_run_font(subtitle_run, size=13, italic=True)

    doc.add_paragraph()
    add_meta_paragraph(doc, "Nguồn tham khảo", data.get("source_textbook", "SGK Toán 1 Cánh Diều"))
    add_meta_paragraph(doc, "Phạm vi", "Lớp 1 - cấp Tiểu học")
    add_meta_paragraph(doc, "Ghi chú", data.get("scope_note", ""))

    profile = data["cognitive_profile"]
    doc.add_heading("Định hướng thiết kế cho học sinh lớp 1", level=1)
    add_bullets(
        doc,
        [
            "Khả năng đọc hiểu còn hạn chế, vì vậy mỗi thẻ chỉ dùng một câu ngắn.",
            "Ưu tiên học qua quan sát, đếm, chọn, nối, kéo thả và làm theo mẫu.",
            "Nội dung lý thuyết không trình bày như đoạn văn dài; mỗi thẻ chỉ xử lý một ý nhận thức.",
            profile["ai_policy"],
        ],
    )

    doc.add_heading("Các loại thẻ sử dụng", level=1)
    card_type_rows = [[TYPE_LABELS.get(key, key), value] for key, value in data["card_types"].items()]
    add_table(doc, ["Loại thẻ", "Ý nghĩa"], card_type_rows)

    doc.add_heading("Tổng quan nội dung lớp 1", level=1)
    overview_rows = []
    for index, chapter in enumerate(data["chapters"], 1):
        lesson_count = len(chapter["lessons"])
        card_count = sum(len(lesson["cards"]) for lesson in chapter["lessons"])
        overview_rows.append([index, chapter["title"], lesson_count, card_count])
    add_table(doc, ["STT", "Chủ đề", "Số bài", "Số thẻ"], overview_rows)

    for chapter_index, chapter in enumerate(data["chapters"], 1):
        doc.add_page_break()
        doc.add_heading(f"Chủ đề {chapter_index}: {chapter['title']}", level=1)
        for lesson_index, lesson in enumerate(chapter["lessons"], 1):
            doc.add_heading(f"{chapter_index}.{lesson_index}. {lesson['lesson']}", level=2)
            add_meta_paragraph(doc, "Mục tiêu", lesson.get("objective", ""))

            rows = []
            for card_index, card in enumerate(lesson.get("cards", []), 1):
                rows.append(
                    [
                        card_index,
                        TYPE_LABELS.get(card.get("type"), card.get("type", "")),
                        card.get("title", ""),
                        card.get("display_text", ""),
                        card.get("visual_prompt", ""),
                        card.get("student_task", ""),
                        INTERACTION_LABELS.get(card.get("interaction"), card.get("interaction", "")),
                    ]
                )
            add_table(
                doc,
                ["#", "Loại", "Tên thẻ", "Hiển thị", "Mô tả hình ảnh", "Nhiệm vụ học sinh", "Tương tác"],
                rows,
            )
            doc.add_paragraph()

    doc.add_page_break()
    doc.add_heading("Gợi ý triển khai sau bước duyệt nội dung", level=1)
    add_bullets(
        doc,
        [
            "Sau khi duyệt nội dung trong file Word, có thể chuyển từng thẻ sang JSON để import vào database.",
            "Với lớp 1, nên ưu tiên chuẩn hóa kho hình minh họa trước khi viết giao diện chi tiết.",
            "Các trường quan trọng khi import gồm: type, title, display_text, visual_prompt, student_task, interaction.",
            "Không bật Chat AI tự do cho lớp 1; chỉ nên dùng phản hồi cố định như Đúng rồi, Thử đếm lại, Con hãy quan sát nhóm bên trái.",
        ],
    )

    doc.save(OUTPUT_PATH)
    return OUTPUT_PATH


# Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u hi?n t?i.
if __name__ == "__main__":
    print(build_docx())
