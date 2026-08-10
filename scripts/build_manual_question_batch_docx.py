"""Dàn trang nội dung câu hỏi đã được biên soạn thủ công thành DOCX.

Script này chỉ đọc dữ liệu có sẵn, áp dụng định dạng và chèn ảnh; không sinh,
viết lại hoặc biến đổi nội dung câu hỏi, đáp án hay lời giải.
"""
# Script build manual question batch docx hỗ trợ nhập, xuất, kiểm tra hoặc bảo trì dữ liệu và cấu hình của dự án.

import json
from pathlib import Path

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "manual_question_batches" / "grade5_b61_b66_b67.json"
ASSETS = ROOT / "output" / "doc" / "assets" / "grade5-b61-b66-b67" / "optimized"
OUTPUT = ROOT / "output" / "doc" / "Ngan_hang_cau_hoi_Toan_5_Bai_61_66_67_60_cau.docx"

LESSON_TITLES = {
    61: "Bài 61. Luyện tập chung",
    66: "Bài 66. Luyện tập",
    67: "Bài 67. Luyện tập chung",
}


# Hàm set_cell_shading dùng để cập nhật trạng thái hoặc dữ liệu theo quy tắc nghiệp vụ; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def set_cell_shading(cell, fill):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:fill"), fill)
    tc_pr.append(shd)


# Hàm set_repeat_table_header dùng để cập nhật trạng thái hoặc dữ liệu theo quy tắc nghiệp vụ; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def set_repeat_table_header(row):
    tr_pr = row._tr.get_or_add_trPr()
    tbl_header = OxmlElement("w:tblHeader")
    tbl_header.set(qn("w:val"), "true")
    tr_pr.append(tbl_header)


# Hàm add_labeled_paragraph dùng để tạo bản ghi hoặc tài nguyên mới sau khi kiểm tra đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def add_labeled_paragraph(doc, label, text, color="1F4E78", fill=None):
    if fill:
        table = doc.add_table(rows=1, cols=1)
        table.autofit = True
        cell = table.cell(0, 0)
        set_cell_shading(cell, fill)
        paragraph = cell.paragraphs[0]
    else:
        paragraph = doc.add_paragraph()
    paragraph.paragraph_format.space_after = Pt(4)
    run = paragraph.add_run(label)
    run.bold = True
    run.font.color.rgb = RGBColor.from_string(color)
    paragraph.add_run(text)
    return paragraph


# Hàm configure_document dùng để khởi tạo trạng thái và các phụ thuộc cần thiết; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def configure_document(doc):
    section = doc.sections[0]
    section.top_margin = Cm(1.7)
    section.bottom_margin = Cm(1.7)
    section.left_margin = Cm(1.8)
    section.right_margin = Cm(1.8)

    styles = doc.styles
    normal = styles["Normal"]
    normal.font.name = "Arial"
    normal.font.size = Pt(11)
    normal.paragraph_format.space_after = Pt(5)
    normal.paragraph_format.line_spacing = 1.12

    for style_name in ("Title", "Heading 1", "Heading 2"):
        style = styles[style_name]
        style.font.name = "Arial"
        style.font.color.rgb = RGBColor(31, 78, 121)

    styles["Title"].font.size = Pt(22)
    styles["Heading 1"].font.size = Pt(17)
    styles["Heading 2"].font.size = Pt(13)


# Hàm add_cover dùng để tạo bản ghi hoặc tài nguyên mới sau khi kiểm tra đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def add_cover(doc, payload):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(90)
    r = p.add_run("NGÂN HÀNG CÂU HỎI BỔ SUNG")
    r.bold = True
    r.font.size = Pt(24)
    r.font.color.rgb = RGBColor(31, 78, 121)

    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run("TOÁN 5 - CÁNH DIỀU")
    r.bold = True
    r.font.size = Pt(28)
    r.font.color.rgb = RGBColor(237, 125, 49)

    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run("Bài 61, Bài 66 và Bài 67")
    r.bold = True
    r.font.size = Pt(18)

    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(24)
    p.add_run("60 câu hỏi tự biên soạn - 30 câu có hình minh họa AI\n").bold = True
    p.add_run("Mỗi câu gồm đề bài, hình (nếu có), phần trả lời, đáp án và lời giải chi tiết.")

    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(28)
    r = p.add_run(payload["source"])
    r.italic = True
    r.font.size = Pt(10)
    r.font.color.rgb = RGBColor(89, 89, 89)

    doc.add_page_break()


# Hàm add_summary dùng để tạo bản ghi hoặc tài nguyên mới sau khi kiểm tra đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def add_summary(doc, questions):
    doc.add_heading("Thông tin bộ câu hỏi", level=1)
    table = doc.add_table(rows=1, cols=4)
    table.style = "Table Grid"
    headers = ["Bài học", "Số câu", "Câu có hình", "Tỉ lệ có hình"]
    for i, header in enumerate(headers):
        cell = table.rows[0].cells[i]
        cell.text = header
        set_cell_shading(cell, "D9EAF7")
        cell.paragraphs[0].runs[0].bold = True
    set_repeat_table_header(table.rows[0])

    for lesson in (61, 66, 67):
        items = [q for q in questions if q["lesson"] == lesson]
        illustrated = sum(1 for q in items if q.get("image"))
        cells = table.add_row().cells
        cells[0].text = LESSON_TITLES[lesson]
        cells[1].text = str(len(items))
        cells[2].text = str(illustrated)
        cells[3].text = f"{illustrated / len(items):.0%}"

    doc.add_paragraph(
        "Ghi chú: Hình minh họa được tạo mới bằng AI, dùng nền trắng, không logo, "
        "không watermark. Số đo được nêu trong đề để bảo đảm dữ kiện chính xác."
    )
    doc.add_page_break()


# Hàm add_question dùng để tạo bản ghi hoặc tài nguyên mới sau khi kiểm tra đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def add_question(doc, q):
    heading = doc.add_heading(f"Câu {q['number']}. {q['type']}", level=2)
    heading.paragraph_format.keep_with_next = True

    prompt = doc.add_paragraph()
    prompt.paragraph_format.keep_with_next = bool(q.get("image"))
    prompt.add_run(q["question"]).bold = True

    if q.get("image"):
        image_path = ASSETS / q["image"]
        if not image_path.exists():
            raise FileNotFoundError(image_path)
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_after = Pt(5)
        p.add_run().add_picture(str(image_path), width=Cm(13.8))

    if q.get("choices"):
        for choice in q["choices"]:
            p = doc.add_paragraph(style="List Bullet")
            p.paragraph_format.left_indent = Cm(0.8)
            p.add_run(choice)
    else:
        add_labeled_paragraph(doc, "Phần trả lời: ", q["response"], color="595959")

    add_labeled_paragraph(doc, "Đáp án: ", q["answer"], color="008000", fill="E2F0D9")
    add_labeled_paragraph(doc, "Lời giải chi tiết: ", q["explanation"], color="1F4E78", fill="EAF2F8")

    divider = doc.add_paragraph("•  •  •")
    divider.alignment = WD_ALIGN_PARAGRAPH.CENTER
    divider.paragraph_format.space_after = Pt(8)
    divider.runs[0].font.color.rgb = RGBColor(166, 166, 166)


# Hàm add_footer dùng để tạo bản ghi hoặc tài nguyên mới sau khi kiểm tra đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def add_footer(section):
    footer = section.footer
    p = footer.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.add_run("Ngân hàng câu hỏi bổ sung Toán 5 Cánh Diều - Bài 61, 66, 67")


# Hàm main dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def main():
    payload = json.loads(DATA.read_text(encoding="utf-8"))
    questions = payload["questions"]
    if len(questions) != 60:
        raise ValueError(f"Cần đúng 60 câu, hiện có {len(questions)}")
    for lesson in (61, 66, 67):
        lesson_questions = [q for q in questions if q["lesson"] == lesson]
        if len(lesson_questions) != 20:
            raise ValueError(f"Bài {lesson} phải có 20 câu")
        if sum(1 for q in lesson_questions if q.get("image")) < 10:
            raise ValueError(f"Bài {lesson} chưa đạt 50% câu có hình")

    doc = Document()
    configure_document(doc)
    add_footer(doc.sections[0])
    add_cover(doc, payload)
    add_summary(doc, questions)

    for lesson_index, lesson in enumerate((61, 66, 67)):
        if lesson_index:
            doc.add_section(WD_SECTION.NEW_PAGE)
        doc.add_heading(LESSON_TITLES[lesson], level=1)
        for q in [item for item in questions if item["lesson"] == lesson]:
            if q["number"] == 12:
                doc.add_page_break()
            add_question(doc, q)

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    doc.save(OUTPUT)
    print(OUTPUT)


# Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
if __name__ == "__main__":
    main()
