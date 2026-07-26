"""Xuất báo cáo Word tổng hợp các câu hỏi có ảnh bị lỗi đã được xử lý.

Nguồn dữ liệu: tmp/bao_cao_sua_anh.json do scripts/fix_broken_image_questions.js
sinh ra sau khi gỡ ảnh và viết lại đề bài.

Mục đích của báo cáo: người làm đồ án rà lại được từng câu đã bị sửa, biết ảnh cũ
sai ở đâu và đề bài mới thay thế ra sao, để quyết định có vẽ lại ảnh hay giữ
nguyên đề thuần chữ.

Dùng: python scripts/build_broken_questions_docx.py [duong_dan_dich.docx]
"""
from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Pt, RGBColor

ROOT = Path(__file__).resolve().parent.parent
NGUON = ROOT / "tmp" / "bao_cao_sua_anh.json"

NHAN_LOAI = {
    "to_de_gop": "Ảnh là tờ đề gộp nhiều câu, in sẵn phương án bên trong",
    "thieu_du_kien": "Ảnh mâu thuẫn với dữ kiện của đề hoặc với đáp án đúng",
    "lech_noi_dung": "Ảnh vẽ nội dung không liên quan tới đề bài",
}


def dat_mau(run, mau: RGBColor) -> None:
    run.font.color.rgb = mau


def them_dong(doc, nhan: str, noi_dung: str, mau_nhan: RGBColor | None = None) -> None:
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(3)
    run_nhan = p.add_run(f"{nhan}: ")
    run_nhan.bold = True
    if mau_nhan is not None:
        dat_mau(run_nhan, mau_nhan)
    p.add_run(noi_dung or "(không có)")


def main() -> None:
    dich = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "outputs" / "bao_cao_cau_hoi_anh_loi.docx"
    dich.parent.mkdir(parents=True, exist_ok=True)

    if not NGUON.exists():
        raise SystemExit(f"Không tìm thấy {NGUON}. Hãy chạy fix_broken_image_questions.js trước.")

    data = json.loads(NGUON.read_text(encoding="utf-8"))
    doc = Document()

    style = doc.styles["Normal"]
    style.font.name = "Calibri"
    style.font.size = Pt(11)

    doc.add_heading("Báo cáo các câu hỏi có ảnh bị lỗi đã xử lý", level=0)

    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    p.add_run(
        "Tài liệu này liệt kê các câu hỏi Toán lớp 1 có ảnh minh họa không dùng được, "
        "đã được gỡ ảnh và viết lại đề bài thành dạng tự đủ nghĩa. Bộ phương án và đáp án "
        "đúng của từng câu được giữ nguyên; đề bài mới được viết sao cho đáp án cũ vẫn đúng."
    )

    doc.add_heading("1. Tổng quan", level=1)
    theo_loai = Counter(item["loai_loi"] for item in data)
    them_dong(doc, "Tổng số câu đã xử lý", str(len(data)))
    for loai, so in theo_loai.most_common():
        them_dong(doc, f"Loại {loai}", f"{so} câu — {NHAN_LOAI.get(loai, loai)}")

    tong_anh = sum(len(item.get("anh_da_go") or []) for item in data)
    them_dong(doc, "Số tệp ảnh đã gỡ khỏi câu hỏi", str(tong_anh))

    p = doc.add_paragraph()
    p.add_run(
        "Ảnh KHÔNG bị xóa khỏi ổ đĩa, chỉ bỏ tham chiếu trong câu hỏi. "
        "Nếu sau này vẽ được ảnh mới đúng nội dung thì gắn lại được."
    ).italic = True

    doc.add_heading("2. Vì sao phải xử lý", level=1)
    doc.add_paragraph(
        "Nhóm thứ nhất, ảnh thực chất là một tờ đề chứa 5 câu hỏi và in sẵn các phương án "
        "A, B, C, D bên trong. Thứ tự phương án in trong ảnh khác thứ tự lưu trong cơ sở dữ "
        "liệu, nên học sinh đọc phương án trong ảnh rồi bấm theo nhãn đó sẽ bị chấm sai dù "
        "hiểu đúng bài. Ảnh còn để lộ 4 câu hỏi khác gây rối.",
        style="List Bullet",
    )
    doc.add_paragraph(
        "Nhóm thứ hai, ảnh mâu thuẫn với dữ kiện của đề hoặc với đáp án đúng. Ví dụ đề nói "
        "có 6 quả bóng nhưng tranh vẽ 7 quả, hoặc đề hỏi bút xanh ở đâu so với bút đỏ mà "
        "tranh vẽ ngược lại với đáp án được chấm là đúng.",
        style="List Bullet",
    )

    doc.add_heading("3. Chi tiết từng câu", level=1)

    do = RGBColor(0xC0, 0x39, 0x2B)
    xanh = RGBColor(0x1E, 0x82, 0x49)

    for thu_tu, item in enumerate(sorted(data, key=lambda x: x["id"]), start=1):
        doc.add_heading(f"3.{thu_tu}. Câu hỏi #{item['id']}", level=2)

        them_dong(doc, "Bài học", item.get("bai_hoc", ""))
        them_dong(doc, "Loại lỗi", NHAN_LOAI.get(item["loai_loi"], item["loai_loi"]), do)
        them_dong(doc, "Ảnh đã gỡ", ", ".join(item.get("anh_da_go") or []) or "(không có)")

        p = doc.add_paragraph()
        p.paragraph_format.space_after = Pt(3)
        p.add_run("Ảnh sai ở chỗ nào: ").bold = True
        p.add_run(item.get("mo_ta_loi", ""))

        them_dong(doc, "Đề bài CŨ", item.get("de_cu", ""), do)
        them_dong(doc, "Đề bài MỚI", item.get("de_moi", ""), xanh)

        p = doc.add_paragraph()
        p.paragraph_format.space_after = Pt(3)
        p.add_run("Phương án (giữ nguyên): ").bold = True
        cac_pa = item.get("phuong_an") or []
        for i, pa in enumerate(cac_pa):
            la_dung = pa["key"] == item.get("dap_an_dung")
            run = p.add_run(f"{pa['key']}. {pa['text']}")
            if la_dung:
                run.bold = True
                dat_mau(run, xanh)
            if i < len(cac_pa) - 1:
                p.add_run("   |   ")

        them_dong(doc, "Đáp án đúng", item.get("dap_an_dung", ""), xanh)
        if item.get("loi_giai"):
            them_dong(doc, "Lời giải hiện có", item["loi_giai"])

    doc.add_heading("4. Việc cần làm tiếp", level=1)
    doc.add_paragraph(
        "Rà lại từng đề bài mới ở mục 3 xem cách diễn đạt đã phù hợp với học sinh lớp 1 chưa.",
        style="List Number",
    )
    doc.add_paragraph(
        "Với các câu muốn giữ phần minh họa, vẽ ảnh mới đúng nội dung đề rồi gắn lại. "
        "Lưu ý ảnh minh họa KHÔNG nên in sẵn phương án A, B, C, D bên trong, vì hệ thống "
        "có thể thay đổi thứ tự phương án.",
        style="List Number",
    )
    doc.add_paragraph(
        "Kiểm tra thêm các ảnh chưa nằm trong đợt rà soát này, vì đợt vừa rồi tập trung vào "
        "nhóm nghi ngờ cao và mới xem 246 trong tổng số 846 ảnh của lớp 1.",
        style="List Number",
    )

    doc.save(dich)
    print(f"Đã ghi {dich}")
    print(f"  Số câu: {len(data)}")
    for loai, so in theo_loai.most_common():
        print(f"  {loai}: {so}")


if __name__ == "__main__":
    main()
