# Script build grade1 question docx h? tr? nh?p, xu?t, ki?m tra ho?c b?o tr? d? li?u v? c?u h?nh c?a d? ?n.
import argparse
import json
from datetime import date
from pathlib import Path

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor


ROOT = Path(__file__).resolve().parents[1]
PACK_DIR = ROOT / "output" / "grade1-question-pack"
QUESTIONS_PATH = PACK_DIR / "questions.json"
OUTPUT_DOCX = PACK_DIR / "Bo_cau_hoi_Toan_lop_1_Chu_de_1_2.docx"


# H?m add_page_number d?ng ?? t?o b?n ghi ho?c t?i nguy?n m?i sau khi ki?m tra ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def add_page_number(paragraph):
    paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = paragraph.add_run()
    fld_char_1 = OxmlElement("w:fldChar")
    fld_char_1.set(qn("w:fldCharType"), "begin")
    instr_text = OxmlElement("w:instrText")
    instr_text.set(qn("xml:space"), "preserve")
    instr_text.text = "PAGE"
    fld_char_2 = OxmlElement("w:fldChar")
    fld_char_2.set(qn("w:fldCharType"), "end")
    run._r.append(fld_char_1)
    run._r.append(instr_text)
    run._r.append(fld_char_2)


# H?m set_cell_shading d?ng ?? c?p nh?t tr?ng th?i ho?c d? li?u theo quy t?c nghi?p v?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def set_cell_shading(paragraph, color_hex):
    p_pr = paragraph._p.get_or_add_pPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:fill"), color_hex)
    p_pr.append(shd)


# H?m setup_styles d?ng ?? kh?i t?o tr?ng th?i v? c?c ph? thu?c c?n thi?t; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def setup_styles(doc):
    normal = doc.styles["Normal"]
    normal.font.name = "Calibri"
    normal._element.rPr.rFonts.set(qn("w:eastAsia"), "Calibri")
    normal.font.size = Pt(11)
    normal.paragraph_format.space_after = Pt(6)
    normal.paragraph_format.line_spacing = 1.25

    for style_name, size, color, before, after in [
        ("Heading 1", 16, "2E74B5", 18, 10),
        ("Heading 2", 13, "2E74B5", 14, 7),
        ("Heading 3", 12, "1F4D78", 10, 5),
    ]:
        style = doc.styles[style_name]
        style.font.name = "Calibri"
        style._element.rPr.rFonts.set(qn("w:eastAsia"), "Calibri")
        style.font.bold = True
        style.font.size = Pt(size)
        style.font.color.rgb = RGBColor.from_string(color)
        style.paragraph_format.space_before = Pt(before)
        style.paragraph_format.space_after = Pt(after)
        style.paragraph_format.keep_with_next = True


# H?m set_margins d?ng ?? c?p nh?t tr?ng th?i ho?c d? li?u theo quy t?c nghi?p v?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def set_margins(doc):
    section = doc.sections[0]
    section.top_margin = Inches(1)
    section.bottom_margin = Inches(1)
    section.left_margin = Inches(1)
    section.right_margin = Inches(1)
    section.header_distance = Inches(0.492)
    section.footer_distance = Inches(0.492)


# H?m add_header_footer d?ng ?? t?o b?n ghi ho?c t?i nguy?n m?i sau khi ki?m tra ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def add_header_footer(section, title):
    header = section.header
    h = header.paragraphs[0]
    h.text = title
    h.alignment = WD_ALIGN_PARAGRAPH.CENTER
    h.runs[0].font.size = Pt(9)
    h.runs[0].font.color.rgb = RGBColor(90, 98, 110)

    footer = section.footer
    f = footer.paragraphs[0]
    add_page_number(f)
    for run in f.runs:
        run.font.size = Pt(9)
        run.font.color.rgb = RGBColor(90, 98, 110)


# H?m add_cover d?ng ?? t?o b?n ghi ho?c t?i nguy?n m?i sau khi ki?m tra ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def add_cover(doc, data):
    spacer = doc.add_paragraph()
    spacer.paragraph_format.space_before = Pt(70)

    title = doc.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    title_run = title.add_run("BỘ CÂU HỎI TOÁN LỚP 1")
    title_run.bold = True
    title_run.font.size = Pt(28)
    title_run.font.color.rgb = RGBColor(31, 77, 120)

    subtitle = doc.add_paragraph()
    subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER
    subtitle_run = subtitle.add_run("Chủ đề 1 và Chủ đề 2")
    subtitle_run.font.size = Pt(18)
    subtitle_run.font.color.rgb = RGBColor(46, 116, 181)

    meta = doc.add_paragraph()
    meta.alignment = WD_ALIGN_PARAGRAPH.CENTER
    meta.paragraph_format.space_before = Pt(22)
    meta_run = meta.add_run(f"{data['lesson_count']} bài học · {data['question_count']} câu hỏi · {data['question_count']} ảnh minh họa AI")
    meta_run.font.size = Pt(12)
    meta_run.font.color.rgb = RGBColor(72, 84, 96)

    note = doc.add_paragraph()
    note.alignment = WD_ALIGN_PARAGRAPH.CENTER
    note.paragraph_format.space_before = Pt(28)
    note_run = note.add_run("Mỗi ảnh chỉ chứa câu hỏi. Đáp án và gợi ý sai được đặt ngay bên dưới để giáo viên kiểm tra.")
    note_run.italic = True
    note_run.font.size = Pt(11)
    note_run.font.color.rgb = RGBColor(72, 84, 96)

    stamp = doc.add_paragraph()
    stamp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    stamp.paragraph_format.space_before = Pt(70)
    stamp_run = stamp.add_run(date.today().strftime("Tháng %m/%Y"))
    stamp_run.font.size = Pt(10)
    stamp_run.font.color.rgb = RGBColor(110, 116, 125)

    doc.add_page_break()


# H?m add_contents d?ng ?? t?o b?n ghi ho?c t?i nguy?n m?i sau khi ki?m tra ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def add_contents(doc, lessons):
    doc.add_heading("Mục lục nội dung", level=1)
    current_chapter = None
    for lesson in lessons:
        if lesson["chapter"] != current_chapter:
            current_chapter = lesson["chapter"]
            p = doc.add_paragraph()
            r = p.add_run(current_chapter)
            r.bold = True
            r.font.color.rgb = RGBColor(31, 77, 120)
        p = doc.add_paragraph(style="List Bullet")
        p.paragraph_format.left_indent = Inches(0.25)
        p.add_run(lesson["lesson"])
    doc.add_page_break()


# H?m add_question_block d?ng ?? t?o b?n ghi ho?c t?i nguy?n m?i sau khi ki?m tra ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def add_question_block(doc, question):
    image_path = PACK_DIR / question["image_file"]
    if not image_path.exists():
        raise FileNotFoundError(f"Missing composed question image: {image_path}")

    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_after = Pt(8)
    run = p.add_run()
    run.add_picture(str(image_path), width=Inches(5.75))

    answer = doc.add_paragraph()
    answer.paragraph_format.keep_with_next = True
    answer.add_run("Đáp án: ").bold = True
    answer.add_run(question["answer"])

    label = doc.add_paragraph()
    label.paragraph_format.keep_with_next = True
    label.add_run("Sai thường gặp:").bold = True

    for mistake in question["common_mistakes"]:
        p = doc.add_paragraph(style="List Bullet")
        p.paragraph_format.left_indent = Inches(0.25)
        p.paragraph_format.space_after = Pt(3)
        p.add_run(f"{mistake['wrong_answer']}: ").bold = True
        p.add_run(mistake["hint"])


# H?m add_lessons d?ng ?? t?o b?n ghi ho?c t?i nguy?n m?i sau khi ki?m tra ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def add_lessons(doc, lessons, allow_missing=False):
    current_chapter = None
    first_lesson = True
    for lesson in lessons:
        if not first_lesson:
            doc.add_page_break()
        first_lesson = False

        if lesson["chapter"] != current_chapter:
            current_chapter = lesson["chapter"]
            doc.add_heading(current_chapter, level=1)
        doc.add_heading(lesson["lesson"], level=2)

        added_any = False
        for idx, question in enumerate(lesson["questions"]):
            image_path = PACK_DIR / question["image_file"]
            if allow_missing and not image_path.exists():
                continue
            if added_any:
                doc.add_page_break()
            add_question_block(doc, question)
            added_any = True


# H?m build d?ng ?? x?y d?ng k?t qu? t? c?c ngu?n d? li?u v? quy t?c li?n quan; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def build(allow_missing=False):
    data = json.loads(QUESTIONS_PATH.read_text(encoding="utf-8"))
    if not allow_missing:
        missing = []
        for lesson in data["lessons"]:
            for question in lesson["questions"]:
                if not (PACK_DIR / question["image_file"]).exists():
                    missing.append(question["image_file"])
        if missing:
            raise FileNotFoundError(f"Missing {len(missing)} composed images. First missing: {missing[0]}")

    doc = Document()
    set_margins(doc)
    setup_styles(doc)
    add_header_footer(doc.sections[0], "Bộ câu hỏi Toán lớp 1 - Chủ đề 1 và 2")
    add_cover(doc, data)
    add_contents(doc, data["lessons"])
    add_lessons(doc, data["lessons"], allow_missing=allow_missing)
    doc.save(OUTPUT_DOCX)
    print(OUTPUT_DOCX)


# H?m main d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--allow-missing", action="store_true")
    args = parser.parse_args()
    build(allow_missing=args.allow_missing)


# Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u hi?n t?i.
if __name__ == "__main__":
    main()
