# Script build grade1 ai theory docx hỗ trợ nhập, xuất, kiểm tra hoặc bảo trì dữ liệu và cấu hình của dự án.
import json
import shutil
from pathlib import Path

from docx import Document
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor
from PIL import Image

from build_grade1_full_theory_docx import (
    CARD_GUIDES,
    INTERACTION_LABELS,
    STATIC_ANSWERS,
    TYPE_LABELS,
    WRONG_HINTS,
    expected_answer,
    theory_takeaway,
)


ROOT = Path(__file__).resolve().parents[1]
INPUT_PATH = ROOT / "content-theory" / "grade-1-theory-blueprint.json"
OUTPUT_DIR = ROOT / "output" / "doc"
AI_IMAGE_DIR = OUTPUT_DIR / "grade1_ai_lesson_images"
OUTPUT_PATH = OUTPUT_DIR / "ly-thuyet-lop-1-codex-ai.docx"
FALLBACK_OUTPUT_PATH = OUTPUT_DIR / "ly-thuyet-lop-1-codex-ai-fixed.docx"
GENERATED_ROOT = Path(r"C:\Users\WIND-OF-FALL\.codex\generated_images")


# Hàm set_run_font dùng để cập nhật trạng thái hoặc dữ liệu theo quy tắc nghiệp vụ; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def set_run_font(run, size=10.5, bold=False, italic=False, color=None):
    run.font.name = "Arial"
    run._element.rPr.rFonts.set(qn("w:eastAsia"), "Arial")
    run.font.size = Pt(size)
    run.bold = bold
    run.italic = italic
    if color:
        run.font.color.rgb = RGBColor.from_string(color)


# Hàm set_document_defaults dùng để cập nhật trạng thái hoặc dữ liệu theo quy tắc nghiệp vụ; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def set_document_defaults(doc):
    section = doc.sections[0]
    section.top_margin = Inches(0.65)
    section.bottom_margin = Inches(0.65)
    section.left_margin = Inches(0.7)
    section.right_margin = Inches(0.7)

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


# Hàm add_meta_paragraph dùng để tạo bản ghi hoặc tài nguyên mới sau khi kiểm tra đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def add_meta_paragraph(doc, label, value):
    paragraph = doc.add_paragraph()
    label_run = paragraph.add_run(f"{label}: ")
    set_run_font(label_run, bold=True)
    value_run = paragraph.add_run(str(value or ""))
    set_run_font(value_run)


# Hàm add_bullets dùng để tạo bản ghi hoặc tài nguyên mới sau khi kiểm tra đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def add_bullets(doc, items):
    for item in items:
        paragraph = doc.add_paragraph(style="List Bullet")
        run = paragraph.add_run(item)
        set_run_font(run)


# Hàm set_cell_text dùng để cập nhật trạng thái hoặc dữ liệu theo quy tắc nghiệp vụ; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def set_cell_text(cell, text, bold=False, size=9):
    cell.text = ""
    paragraph = cell.paragraphs[0]
    run = paragraph.add_run(str(text or ""))
    set_run_font(run, size=size, bold=bold)


# Hàm set_cell_shading dùng để cập nhật trạng thái hoặc dữ liệu theo quy tắc nghiệp vụ; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def set_cell_shading(cell, fill):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:fill"), fill)
    tc_pr.append(shd)


# Hàm add_overview_table dùng để tạo bản ghi hoặc tài nguyên mới sau khi kiểm tra đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def add_overview_table(doc, rows):
    table = doc.add_table(rows=1, cols=4)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.style = "Table Grid"
    headers = ["STT", "Chủ đề", "Số bài", "Số thẻ"]
    for index, header in enumerate(headers):
        set_cell_text(table.rows[0].cells[index], header, bold=True)
        set_cell_shading(table.rows[0].cells[index], "D9EAF7")
    for row in rows:
        cells = table.add_row().cells
        for index, value in enumerate(row):
            set_cell_text(cells[index], value)
            cells[index].vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.TOP


# Hàm build_card_detail dùng để xây dựng kết quả từ các nguồn dữ liệu và quy tắc liên quan; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def build_card_detail(card):
    card_type = card.get("type", "")
    interaction = card.get("interaction", "none")
    return [
        f"Nội dung hiển thị: {card.get('display_text', '')}",
        f"Kiến thức cần rút ra: {theory_takeaway({}, card)}",
        f"Cách triển khai: {CARD_GUIDES.get(card_type, '')}",
        f"Nhiệm vụ học sinh: {card.get('student_task', '')}",
        f"Tương tác đề xuất: {INTERACTION_LABELS.get(interaction, interaction)}",
        f"Gợi ý khi học sinh sai: {WRONG_HINTS.get(interaction, '')}",
    ]


# Hàm get_latest_sheet_images dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def get_latest_sheet_images(count=10):
    images = sorted(GENERATED_ROOT.rglob("*.png"), key=lambda path: path.stat().st_mtime, reverse=True)
    selected = images[:count]
    return list(reversed(selected))


# Hàm crop_sheet_panels dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def crop_sheet_panels(sheet_paths, expected_lessons):
    AI_IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    for old in AI_IMAGE_DIR.glob("*.png"):
        old.unlink()

    panel_paths = []
    for sheet_index, sheet_path in enumerate(sheet_paths, 1):
        with Image.open(sheet_path) as img:
            img = img.convert("RGB")
            width, height = img.size
            boxes = [
                (0, 0, width // 2, height // 2),
                (width // 2, 0, width, height // 2),
                (0, height // 2, width // 2, height),
                (width // 2, height // 2, width, height),
            ]
            for panel_index, box in enumerate(boxes, 1):
                panel = img.crop(box)
                # Trim a small border created by the 2x2 sheet layout.
                margin_x = int(panel.width * 0.025)
                margin_y = int(panel.height * 0.025)
                panel = panel.crop((margin_x, margin_y, panel.width - margin_x, panel.height - margin_y))
                output = AI_IMAGE_DIR / f"lesson-panel-{len(panel_paths) + 1:02d}.png"
                panel.save(output)
                panel_paths.append(output)

    if len(panel_paths) < expected_lessons:
        raise RuntimeError(f"Không đủ panel ảnh AI: cần {expected_lessons}, có {len(panel_paths)}")
    return panel_paths[:expected_lessons]


# Hàm build_docx dùng để xây dựng kết quả từ các nguồn dữ liệu và quy tắc liên quan; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def build_docx():
    data = json.loads(INPUT_PATH.read_text(encoding="utf-8"))
    lessons = [(chapter, lesson) for chapter in data["chapters"] for lesson in chapter["lessons"]]
    existing_panels = sorted(AI_IMAGE_DIR.glob("lesson-panel-*.png"))
    if len(existing_panels) >= len(lessons):
        lesson_images = existing_panels[: len(lessons)]
    else:
        sheet_paths = get_latest_sheet_images(10)
        lesson_images = crop_sheet_panels(sheet_paths, len(lessons))

    doc = Document()
    set_document_defaults(doc)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    title = doc.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    title_run = title.add_run("LÝ THUYẾT TOÁN LỚP 1")
    set_run_font(title_run, size=24, bold=True, color="1F4E79")

    subtitle = doc.add_paragraph()
    subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER
    subtitle_run = subtitle.add_run("Bản học liệu có ảnh AI minh họa theo từng bài - Codex")
    set_run_font(subtitle_run, size=13, italic=True)

    doc.add_paragraph()
    add_meta_paragraph(doc, "Nguồn tham khảo", data.get("source_textbook", "SGK Toán 1 Cánh Diều"))
    add_meta_paragraph(doc, "Phạm vi", "Lớp 1 - cấp Tiểu học")
    add_meta_paragraph(doc, "Ghi chú ảnh", "Ảnh trong tài liệu là ảnh AI tạo trong phiên Codex hiện tại, dùng để duyệt học liệu. Các phép tính/đáp án chuẩn nằm trong phần chữ bên dưới từng thẻ.")

    doc.add_heading("Định hướng thiết kế", level=1)
    add_bullets(
        doc,
        [
            "Mỗi bài có ảnh minh họa riêng để học sinh quan sát trước khi đọc nhiệm vụ.",
            "Mỗi thẻ có nội dung hiển thị, kiến thức cần rút ra, nhiệm vụ, tương tác, gợi ý sai và đáp án/kết quả mong đợi.",
            "Với lớp 1, phần chữ được giữ ngắn; trọng tâm là quan sát, đếm, chọn, nối và thao tác trực quan.",
            data["cognitive_profile"]["ai_policy"],
        ],
    )

    doc.add_heading("Tổng quan nội dung", level=1)
    overview_rows = []
    for index, chapter in enumerate(data["chapters"], 1):
        lesson_count = len(chapter["lessons"])
        card_count = sum(len(lesson["cards"]) for lesson in chapter["lessons"])
        overview_rows.append([index, chapter["title"], lesson_count, card_count])
    add_overview_table(doc, overview_rows)

    lesson_image_index = 0
    for chapter_index, chapter in enumerate(data["chapters"], 1):
        doc.add_page_break()
        doc.add_heading(f"Chủ đề {chapter_index}: {chapter['title']}", level=1)
        for lesson_index, lesson in enumerate(chapter["lessons"], 1):
            lesson_image = lesson_images[lesson_image_index]
            lesson_image_index += 1

            doc.add_heading(f"{chapter_index}.{lesson_index}. {lesson['lesson']}", level=2)
            image_paragraph = doc.add_paragraph()
            image_paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
            image_paragraph.add_run().add_picture(str(lesson_image), width=Inches(6.6))
            add_meta_paragraph(doc, "Mục tiêu bài học", lesson.get("objective", ""))
            add_meta_paragraph(doc, "Cách học phù hợp", "Học sinh quan sát tranh, nghe/đọc câu lệnh ngắn, thao tác theo yêu cầu rồi đối chiếu đáp án.")

            for card_index, card in enumerate(lesson.get("cards", []), 1):
                doc.add_heading(
                    f"Thẻ {card_index}: {TYPE_LABELS.get(card.get('type'), card.get('type', ''))} - {card.get('title', '')}",
                    level=3,
                )
                add_bullets(doc, build_card_detail(card))
                add_meta_paragraph(doc, "Đáp án/Kết quả mong đợi", expected_answer(lesson, card_index))
                add_meta_paragraph(doc, "Mô tả tranh cần đạt", card.get("visual_prompt", ""))
            doc.add_paragraph()

    doc.add_page_break()
    doc.add_heading("Ghi chú kiểm duyệt ảnh", level=1)
    add_bullets(
        doc,
        [
            "Ảnh AI đã được tạo trực tiếp trong phiên này và cắt thành từng ảnh bài học.",
            "Với các bài đếm số lượng, nên ưu tiên kiểm tra lại số lượng đồ vật trong ảnh trước khi đưa vào giao diện chính thức.",
            "Nếu cần chính xác tuyệt đối từng đồ vật, có thể dùng ảnh AI làm nền/phong cách và dựng lại đối tượng toán học bằng asset có kiểm soát.",
        ],
    )

    try:
        doc.save(OUTPUT_PATH)
        return OUTPUT_PATH
    except PermissionError:
        doc.save(FALLBACK_OUTPUT_PATH)
        return FALLBACK_OUTPUT_PATH


# Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
if __name__ == "__main__":
    print(build_docx())
