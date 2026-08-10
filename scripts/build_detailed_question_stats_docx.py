# Script build detailed question stats docx hỗ trợ nhập, xuất, kiểm tra hoặc bảo trì dữ liệu và cấu hình của dự án.
from __future__ import annotations

import base64
import json
from collections import Counter
from pathlib import Path

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor


PROJECT = Path(__file__).resolve().parents[1]
OUTPUT = (
    PROJECT
    / "output"
    / "doc"
    / "thong_ke_chi_tiet_so_cau_hoi_tung_bai_lop_1_5.docx"
)

TEX_FILES = {
    1: "grade1_question_bank_reviewed.tex",
    2: "grade2_question_bank.tex",
    3: "grade3_question_bank.tex",
    4: "grade4_question_bank.tex",
    5: "grade5_question_bank.tex",
}
BLUEPRINT_FILES = {
    1: "grade-1-theory-blueprint.json",
    2: "grade-2-theory-blueprint-detailed.json",
    3: "grade-3-theory-blueprint-detailed.json",
    4: "grade-4-theory-blueprint-detailed.json",
    5: "grade-5-theory-blueprint-detailed.json",
}


# Hàm set_cell_fill dùng để cập nhật trạng thái hoặc dữ liệu theo quy tắc nghiệp vụ; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def set_cell_fill(cell, color: str) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        tc_pr.append(shd)
    shd.set(qn("w:fill"), color)


# Hàm set_repeat_table_header dùng để cập nhật trạng thái hoặc dữ liệu theo quy tắc nghiệp vụ; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def set_repeat_table_header(row) -> None:
    tr_pr = row._tr.get_or_add_trPr()
    tbl_header = OxmlElement("w:tblHeader")
    tbl_header.set(qn("w:val"), "true")
    tr_pr.append(tbl_header)


# Hàm prevent_row_split dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def prevent_row_split(row) -> None:
    tr_pr = row._tr.get_or_add_trPr()
    cant_split = OxmlElement("w:cantSplit")
    tr_pr.append(cant_split)


# Hàm set_cell_text dùng để cập nhật trạng thái hoặc dữ liệu theo quy tắc nghiệp vụ; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def set_cell_text(
    cell,
    text: object,
    *,
    bold: bool = False,
    color: str = "1F2937",
    align: WD_ALIGN_PARAGRAPH = WD_ALIGN_PARAGRAPH.LEFT,
) -> None:
    cell.text = ""
    paragraph = cell.paragraphs[0]
    paragraph.alignment = align
    paragraph.paragraph_format.space_after = Pt(0)
    run = paragraph.add_run(str(text))
    run.bold = bold
    run.font.name = "Arial"
    run.font.size = Pt(9)
    run.font.color.rgb = RGBColor.from_string(color)
    cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER


# Hàm read_question_counts dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def read_question_counts(grade: int) -> tuple[Counter, dict[int, str]]:
    counts: Counter = Counter()
    source_titles: dict[int, str] = {}
    path = PROJECT / "data" / TEX_FILES[grade]
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.startswith("% DBJSON "):
            continue
        payload = json.loads(base64.b64decode(line[9:].strip()).decode("utf-8"))
        number = int(payload["lesson_number"])
        counts[number] += 1
        source_titles[number] = str(payload.get("lesson_title", "")).strip()
    return counts, source_titles


# Hàm read_curriculum dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def read_curriculum(grade: int) -> list[dict]:
    path = PROJECT / "content-theory" / BLUEPRINT_FILES[grade]
    data = json.loads(path.read_text(encoding="utf-8"))
    lessons = []
    number = 0
    for chapter in data["chapters"]:
        for lesson in chapter["lessons"]:
            number += 1
            lessons.append(
                {
                    "number": number,
                    "title": str(lesson["lesson"]).strip(),
                }
            )
    return lessons


# Hàm grade_rows dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def grade_rows(grade: int) -> list[dict]:
    counts, source_titles = read_question_counts(grade)
    lessons = read_curriculum(grade)
    maximum = max([len(lessons), *counts.keys()])
    blueprint_titles = {row["number"]: row["title"] for row in lessons}
    return [
        {
            "number": number,
            "title": source_titles.get(number)
            or blueprint_titles.get(number)
            or f"Bài {number}",
            "count": counts[number],
        }
        for number in range(1, maximum + 1)
    ]


# Hàm style_document dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def style_document(document: Document) -> None:
    styles = document.styles
    normal = styles["Normal"]
    normal.font.name = "Arial"
    normal.font.size = Pt(10)
    normal.paragraph_format.space_after = Pt(3)

    for style_name, size, color in [
        ("Title", 20, "17365D"),
        ("Heading 1", 15, "17365D"),
        ("Heading 2", 11, "2F75B5"),
    ]:
        style = styles[style_name]
        style.font.name = "Arial"
        style.font.size = Pt(size)
        style.font.color.rgb = RGBColor.from_string(color)

    section = document.sections[0]
    section.top_margin = Inches(0.55)
    section.bottom_margin = Inches(0.55)
    section.left_margin = Inches(0.6)
    section.right_margin = Inches(0.6)


# Hàm add_summary dùng để tạo bản ghi hoặc tài nguyên mới sau khi kiểm tra đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def add_summary(document: Document, all_rows: dict[int, list[dict]]) -> None:
    title = document.add_paragraph(style="Title")
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    title.add_run("THỐNG KÊ CHI TIẾT NGÂN HÀNG CÂU HỎI TOÁN LỚP 1-5")

    subtitle = document.add_paragraph()
    subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = subtitle.add_run(
        "Liệt kê riêng từng bài học và số câu hỏi hiện có trong ngân hàng."
    )
    run.italic = True
    run.font.color.rgb = RGBColor.from_string("667085")

    table = document.add_table(rows=1, cols=5)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.style = "Table Grid"
    headers = ["Lớp", "Số bài", "Bài có câu", "Bài chưa có", "Tổng câu"]
    for index, label in enumerate(headers):
        set_cell_text(
            table.rows[0].cells[index],
            label,
            bold=True,
            color="FFFFFF",
            align=WD_ALIGN_PARAGRAPH.CENTER,
        )
        set_cell_fill(table.rows[0].cells[index], "2F75B5")

    for grade, rows in all_rows.items():
        row = table.add_row()
        covered = sum(item["count"] > 0 for item in rows)
        values = [
            f"Lớp {grade}",
            len(rows),
            covered,
            len(rows) - covered,
            sum(item["count"] for item in rows),
        ]
        for index, value in enumerate(values):
            set_cell_text(
                row.cells[index],
                value,
                bold=index in {0, 4},
                align=WD_ALIGN_PARAGRAPH.CENTER,
            )
        if covered == len(rows):
            set_cell_fill(row.cells[2], "E2F0D9")
        else:
            set_cell_fill(row.cells[3], "FCE4D6")

    document.add_paragraph(
        "Lưu ý: số liệu được đếm trực tiếp từ các dòng DBJSON trong file LaTeX "
        "của từng lớp; bài chưa có dữ liệu được ghi rõ là 0 câu."
    )


# Hàm add_grade_section dùng để tạo bản ghi hoặc tài nguyên mới sau khi kiểm tra đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def add_grade_section(document: Document, grade: int, rows: list[dict]) -> None:
    document.add_page_break()
    heading = document.add_heading(f"LỚP {grade}", level=1)
    heading.alignment = WD_ALIGN_PARAGRAPH.LEFT

    total = sum(item["count"] for item in rows)
    covered = sum(item["count"] > 0 for item in rows)
    summary = document.add_paragraph()
    summary.add_run(
        f"Tổng: {total:,} câu - {covered}/{len(rows)} bài có dữ liệu"
    ).bold = True

    table = document.add_table(rows=1, cols=4)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.style = "Table Grid"
    table.autofit = False
    widths = [Inches(0.55), Inches(0.8), Inches(5.35), Inches(0.85)]
    headers = ["STT", "Bài", "Tên bài học", "Số câu"]
    for index, label in enumerate(headers):
        cell = table.rows[0].cells[index]
        cell.width = widths[index]
        set_cell_text(
            cell,
            label,
            bold=True,
            color="FFFFFF",
            align=WD_ALIGN_PARAGRAPH.CENTER,
        )
        set_cell_fill(cell, "2F75B5")
    set_repeat_table_header(table.rows[0])

    for index, item in enumerate(rows, 1):
        row = table.add_row()
        prevent_row_split(row)
        values = [index, f"Bài {item['number']}", item["title"], item["count"]]
        for column, value in enumerate(values):
            cell = row.cells[column]
            cell.width = widths[column]
            set_cell_text(
                cell,
                value,
                bold=column == 3,
                color="375623" if item["count"] else "9C0006",
                align=(
                    WD_ALIGN_PARAGRAPH.LEFT
                    if column == 2
                    else WD_ALIGN_PARAGRAPH.CENTER
                ),
            )
        set_cell_fill(row.cells[3], "E2F0D9" if item["count"] else "FCE4D6")


# Hàm main dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def main() -> None:
    all_rows = {grade: grade_rows(grade) for grade in range(1, 6)}
    document = Document()
    style_document(document)
    add_summary(document, all_rows)
    for grade, rows in all_rows.items():
        add_grade_section(document, grade, rows)

    core_properties = document.core_properties
    core_properties.title = "Thống kê chi tiết số câu hỏi từng bài lớp 1-5"
    core_properties.subject = "Ngân hàng câu hỏi Toán Cánh Diều"

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    document.save(OUTPUT)
    print(
        json.dumps(
            {
                "output": str(OUTPUT),
                "grades": {
                    str(grade): {
                        "lessons": len(rows),
                        "covered": sum(item["count"] > 0 for item in rows),
                        "questions": sum(item["count"] for item in rows),
                    }
                    for grade, rows in all_rows.items()
                },
            },
            ensure_ascii=False,
        )
    )


# Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
if __name__ == "__main__":
    main()
