"""Dàn trang 66 câu đã biên soạn thủ công thành một tệp DOCX.

Script chỉ đọc nội dung từ JSON, chèn ảnh và áp dụng định dạng Word.
"""
# Script build manual question batch b75 b76 b77 docx hỗ trợ nhập, xuất, kiểm tra hoặc bảo trì dữ liệu và cấu hình của dự án.

import importlib.util
import json
from pathlib import Path

from docx import Document
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Pt, RGBColor


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "manual_question_batches" / "grade5_b75_b76_b77.json"
ASSETS = ROOT / "output" / "doc" / "assets" / "grade5-b75-b76-b77" / "final"
OUTPUT = ROOT / "output" / "doc" / "Ngan_hang_cau_hoi_Toan_5_Bai_75_76_77_66_cau.docx"
LESSON_TITLES = {
    75: "Bài 75. Em ôn lại những gì đã học",
    76: "Bài 76. Em vui học Toán",
    77: "Bài 77. Em ôn lại những gì đã học",
}


# Hàm load_layout_helpers dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def load_layout_helpers():
    path = ROOT / "scripts" / "build_manual_question_batch_b68_b71_b73_docx.py"
    spec = importlib.util.spec_from_file_location("previous_batch_layout", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.ASSETS = ASSETS
    module.LESSON_TITLES = LESSON_TITLES
    return module


# Hàm validate dùng để kiểm tra tính hợp lệ và các điều kiện an toàn; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def validate(questions):
    if len(questions) != 66:
        raise ValueError(f"Cần đúng 66 câu, hiện có {len(questions)}")
    images = []
    for lesson in (75, 76, 77):
        items = [q for q in questions if q["lesson"] == lesson]
        if len(items) != 22:
            raise ValueError(f"Bài {lesson} phải có đúng 22 câu")
        expected_numbers = list(range(1, 23))
        if [q["number"] for q in items] != expected_numbers:
            raise ValueError(f"Bài {lesson} phải được đánh số liên tục từ 1 đến 22")
        illustrated = [q for q in items if q.get("image")]
        if len(illustrated) != 11:
            raise ValueError(f"Bài {lesson} phải có đúng 11 câu có hình")
        images.extend(q["image"] for q in illustrated)
    if len(images) != len(set(images)):
        raise ValueError("Mỗi câu có hình phải dùng một ảnh riêng")
    missing = [name for name in images if not (ASSETS / name.replace(".png", ".jpg")).exists()]
    if missing:
        raise FileNotFoundError(f"Thiếu ảnh: {missing}")


# Hàm add_cover dùng để tạo bản ghi hoặc tài nguyên mới sau khi kiểm tra đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def add_cover(doc, payload):
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
    run = p.add_run("Bài 75  •  Bài 76  •  Bài 77")
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
    p.add_run("22 câu mỗi bài • 33 câu có hình minh họa riêng biệt • 50% câu có hình\n").bold = True
    p.add_run("Mỗi câu có đề bài, phần trả lời, đáp án và lời giải chi tiết.")

    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(28)
    run = p.add_run(payload["source"])
    run.italic = True
    run.font.size = Pt(10)
    run.font.color.rgb = RGBColor(89, 89, 89)
    doc.add_page_break()


# Hàm add_summary dùng để tạo bản ghi hoặc tài nguyên mới sau khi kiểm tra đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def add_summary(doc, questions, helpers):
    doc.add_heading("THÔNG TIN BỘ CÂU HỎI", level=1)
    table = doc.add_table(rows=1, cols=4)
    table.style = "Table Grid"
    for index, text in enumerate(("Bài học", "Số câu", "Câu có hình", "Tỉ lệ")):
        cell = table.cell(0, index)
        cell.text = text
        helpers.set_shading(cell, "D9EAF7")
        cell.paragraphs[0].runs[0].bold = True
    for lesson in (75, 76, 77):
        items = [q for q in questions if q["lesson"] == lesson]
        illustrated = sum(bool(q.get("image")) for q in items)
        cells = table.add_row().cells
        values = (LESSON_TITLES[lesson], str(len(items)), str(illustrated), "50%")
        for cell, value in zip(cells, values):
            cell.text = value
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
            helpers.set_cell_margins(cell)

    notes = (
        "Nội dung được tự biên soạn thủ công sau khi đọc đúng phạm vi kiến thức trong SGK.",
        "Mỗi câu có hình dùng một ảnh riêng để có thể đảo thứ tự độc lập.",
        "Dữ kiện số đo, vận tốc, quãng đường và thời gian được ghi trực tiếp trên ảnh.",
        "Ảnh minh họa nền sáng, không logo, không watermark; không có mặt đồng hồ thiếu số.",
        "Lời giải trình bày theo từng bước, có giải thích vì sao dùng phép tính.",
    )
    for note in notes:
        doc.add_paragraph(note, style="List Bullet")
    doc.add_page_break()


# Hàm main dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def main():
    payload = json.loads(DATA.read_text(encoding="utf-8"))
    questions = payload["questions"]
    validate(questions)
    helpers = load_layout_helpers()

    doc = Document()
    helpers.configure(doc)
    add_cover(doc, payload)
    add_summary(doc, questions, helpers)
    for lesson in (75, 76, 77):
        doc.add_heading(LESSON_TITLES[lesson].upper(), level=1)
        doc.add_paragraph(
            "22 câu • 11 câu có hình riêng • Câu hỏi, đáp án và lời giải được trình bày độc lập."
        )
        for question in (q for q in questions if q["lesson"] == lesson):
            helpers.add_question(doc, question)
            if not (lesson == 77 and question["number"] == 22):
                doc.add_page_break()

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    doc.save(OUTPUT)
    print(f"Saved {OUTPUT}")


# Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
if __name__ == "__main__":
    main()
