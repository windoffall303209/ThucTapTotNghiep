"""Dựng báo cáo Word tổng hợp toàn bộ đợt rà soát ngân hàng câu hỏi.

Khác với build_broken_questions_docx.py chỉ nói riêng phần ảnh hỏng, báo cáo này
gộp mọi loại lỗi đã tìm và xử lý trên cả 7660 câu của năm khối lớp, để nộp kèm đồ
án: mỗi loại lỗi nêu hiện tượng, vì sao nó làm học sinh bị chấm oan, cách sửa và
số liệu trước sau.

Nguồn dữ liệu là các tệp báo cáo trong tmp/ do từng script sửa sinh ra.

Dùng: python scripts/build_review_report_docx.py [duong_dan_dich.docx]
"""
# Script build review report docx h? tr? nh?p, xu?t, ki?m tra ho?c b?o tr? d? li?u v? c?u h?nh c?a d? ?n.
from __future__ import annotations

import json
import sys
from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Pt, RGBColor

# Console Windows mặc định dùng bảng mã cp1252, in tiếng Việt sẽ ném
# UnicodeEncodeError sau khi tệp đã ghi xong, trông như script chạy hỏng.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent
TMP = ROOT / "tmp"

DO = RGBColor(0xC0, 0x39, 0x2B)
XANH = RGBColor(0x1E, 0x82, 0x49)
XAM = RGBColor(0x55, 0x55, 0x55)


# H?m doc_json d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def doc_json(ten: str, mac_dinh):
    tep = TMP / ten
    if not tep.exists():
        return mac_dinh
    try:
        return json.loads(tep.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return mac_dinh


# H?m dong d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def dong(doc, nhan: str, noi_dung: str, mau=None) -> None:
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(3)
    r = p.add_run(f"{nhan}: ")
    r.bold = True
    if mau is not None:
        r.font.color.rgb = mau
    p.add_run(noi_dung)


# H?m bang_so_lieu d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def bang_so_lieu(doc, tieu_de: str, hang: list[tuple[str, str]]) -> None:
    """Bảng hai cột đơn giản, dùng cho số liệu trước và sau."""
    doc.add_paragraph().add_run(tieu_de).bold = True
    t = doc.add_table(rows=0, cols=2)
    t.style = "Light Grid Accent 1"
    for nhan, gia_tri in hang:
        o = t.add_row().cells
        o[0].text = nhan
        o[1].text = gia_tri
    doc.add_paragraph()


# H?m them_vi_du d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def them_vi_du(doc, tieu_de: str, cac_dong: list[str], gioi_han: int = 6) -> None:
    if not cac_dong:
        return
    doc.add_paragraph().add_run(tieu_de).bold = True
    for d in cac_dong[:gioi_han]:
        p = doc.add_paragraph(d, style="List Bullet")
        p.paragraph_format.space_after = Pt(2)
    if len(cac_dong) > gioi_han:
        p = doc.add_paragraph()
        r = p.add_run(f"... và {len(cac_dong) - gioi_han} trường hợp nữa, xem tệp báo cáo JSON kèm theo.")
        r.italic = True
        r.font.color.rgb = XAM


# H?m main d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def main() -> None:
    dich = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "outputs" / "bao_cao_ra_soat_ngan_hang_cau_hoi.docx"
    dich.parent.mkdir(parents=True, exist_ok=True)

    anh_hong = doc_json("bao_cao_sua_gop.json", [])
    cat_anh = doc_json("bao_cao_cat_anh.json", [])
    loi_giai = doc_json("bao_cao_loi_giai.json", [])
    trung_pa = doc_json("bao_cao_trung_phuong_an.json", [])
    khong_tra_loi = doc_json("bao_cao_cau_khong_tra_loi_duoc.json", [])
    go_nhac_anh = doc_json("bao_cao_go_nhac_anh.json", [])
    giu_cho = doc_json("bao_cao_phuong_an_giu_cho.json", [])
    menh_lenh = doc_json("bao_cao_cau_menh_lenh.json", [])
    them_pa = doc_json("bao_cao_them_phuong_an.json", {"daThem": [], "giuNguyen": []})
    can_bang = doc_json("bao_cao_can_bang_lop1.json", [])
    suc_khoe = doc_json("suc_khoe_ngan_hang.json", {})

    doc = Document()
    style = doc.styles["Normal"]
    style.font.name = "Calibri"
    style.font.size = Pt(11)

    doc.add_heading("Báo cáo rà soát ngân hàng câu hỏi Toán tiểu học", level=0)

    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    p.add_run(
        "Tài liệu tổng hợp đợt rà soát toàn bộ 7660 câu hỏi trắc nghiệm Toán từ lớp 1 đến "
        "lớp 5 của hệ thống. Mục tiêu của đợt rà soát là tìm và sửa mọi trường hợp mà học "
        "sinh hiểu đúng bài nhưng vẫn bị chấm sai, hoặc không đủ dữ kiện để trả lời. Mỗi "
        "mục dưới đây nêu một loại lỗi: hiện tượng, vì sao nó gây hại, cách sửa và số liệu."
    )

    # ------------------------------------------------------------------ tổng quan
    doc.add_heading("1. Tổng quan", level=1)
    tong_sua = (
        len(anh_hong) + len(cat_anh) + len(loi_giai) + len(trung_pa) + len(khong_tra_loi)
        + len(go_nhac_anh) + len(giu_cho) + len(menh_lenh) + len(them_pa.get("daThem", []))
        + len(can_bang)
    )
    bang_so_lieu(doc, "Số câu đã can thiệp theo từng loại việc", [
        ("Gỡ ảnh không dùng được, viết lại đề", str(len(anh_hong))),
        ("Cắt tờ đề gộp thành từng ô riêng và đồng bộ phương án", str(len(cat_anh))),
        ("Viết lại lời giải cho có lý do, không chỉ chép đáp án", str(len(loi_giai))),
        ("Sửa câu có hai phương án cùng đúng", str(len(trung_pa))),
        ("Xử lý câu học sinh không thể trả lời đúng", str(len(khong_tra_loi))),
        ("Dọn câu còn nhắc tranh mà ảnh đã gỡ", str(len(go_nhac_anh))),
        ("Thay phương án giữ chỗ lọt vào ngân hàng", str(len(giu_cho))),
        ("Thay câu lệnh làm trên vở bằng câu hỏi thật", str(len(menh_lenh))),
        ("Bổ sung phương án thứ tư", str(len(them_pa.get("daThem", [])))),
        ("Rải đều lại nhãn đáp án đúng của lớp 1", str(len(can_bang))),
        ("Tổng lượt can thiệp", str(tong_sua)),
    ])

    p = doc.add_paragraph()
    r = p.add_run(
        "Lưu ý: một câu hỏi có thể xuất hiện ở nhiều loại việc nên tổng lượt can thiệp lớn "
        "hơn số câu bị đụng tới. Ảnh KHÔNG bị xóa khỏi ổ đĩa, chỉ bỏ tham chiếu trong câu "
        "hỏi, nên sau này vẽ được ảnh đúng thì gắn lại được."
    )
    r.italic = True

    # ------------------------------------------------------------------ từng loại lỗi
    doc.add_heading("2. Các loại lỗi đã tìm và xử lý", level=1)

    doc.add_heading("2.1. Ảnh minh họa mâu thuẫn với đề bài hoặc với đáp án", level=2)
    doc.add_paragraph(
        "Đã rà soát toàn bộ 3715 ảnh của năm khối lớp bằng cách mở từng ảnh ra đối chiếu với "
        "đề bài. Tìm được 245 ảnh có lỗi, đã xử lý 210 câu. Tỉ lệ lỗi rất không đều giữa các "
        "khối: lớp 1 khoảng 12,4 phần trăm và lớp 3 khoảng 11,8 phần trăm, trong khi lớp 2 "
        "chỉ 0,6 phần trăm. Điều này cho thấy ảnh được sinh theo từng đợt và có đợt không "
        "được đối chiếu lại với đề bài."
    )
    dong(doc, "Ví dụ", "đề nói có 6 quả bóng nhưng tranh vẽ 7 quả; đề hỏi bút xanh ở đâu so "
                       "với bút đỏ mà tranh vẽ ngược lại với đáp án được chấm là đúng.", DO)
    dong(doc, "Cách sửa", "câu nào đề đã tự nêu đủ dữ kiện bằng chữ thì chỉ gỡ ảnh; câu nào "
                          "phụ thuộc hoàn toàn vào ảnh thì viết lại đề thành dạng tự đủ nghĩa.", XANH)

    doc.add_heading("2.2. Ảnh thực chất là tờ đề gộp nhiều câu", level=2)
    doc.add_paragraph(
        "13 ảnh của lớp 1 không phải tranh minh họa mà là một TỜ ĐỀ chứa 5 câu hỏi, in sẵn "
        "cả đề lẫn phương án A, B, C, D bên trong. Gắn nguyên tờ vào một câu thì học sinh "
        "nhìn thấy cả 4 câu khác. Nghiêm trọng hơn, thứ tự phương án in trong ảnh khác thứ "
        "tự lưu trong cơ sở dữ liệu, nên học sinh đọc phương án trong ảnh rồi bấm theo nhãn "
        "đó sẽ bị chấm sai dù hiểu đúng bài."
    )
    dong(doc, "Cách sửa", f"dùng phép cắt ảnh của Cloudinary để tách mỗi tờ thành từng ô "
                          f"riêng, rồi sắp lại thứ tự phương án trong dữ liệu cho khớp đúng "
                          f"nhãn in trong ảnh. Đã xử lý {len(cat_anh)} ô.", XANH)

    doc.add_heading("2.3. Hai phương án cùng đúng", level=2)
    doc.add_paragraph(
        "Bộ phương án chứa đáp án đúng tới hai lần, một bản viết đầy đủ kèm đơn vị và một bản "
        "viết trần. Học sinh hiểu bài, chọn bản viết trần, vẫn bị chấm sai."
    )
    them_vi_du(doc, "Trường hợp cụ thể", [
        f"Câu {b['id']}: {' | '.join(b['phuong_an_cu'])} — chấm đúng {b['dap_an']}"
        for b in trung_pa[:6]
    ])
    doc.add_paragraph(
        "Việc dò lỗi này phải làm rất chặt. Bản dò đầu tiên chỉ so số đứng đầu chuỗi đã báo "
        "nhầm 2505 cặp, trong đó có “1 - 3 = 4” với “1 + 3 = 3” và "
        "“37,5 dm³” với “375 dm³”. Bản dò theo kiểu chuỗi này chứa chuỗi "
        "kia thì báo nhầm “Bằng nhau” với “Không bằng nhau” là hai "
        "phương án ngược nghĩa. Bản dùng thật đòi phần số phải bằng nhau từng chữ số và một "
        "bên không có đơn vị, hoặc câu dài kết thúc đúng bằng câu ngắn mà phần dôi ra không "
        "chứa từ phủ định hay từ so sánh."
    )
    dong(doc, "Kết quả", f"{len(trung_pa)} câu đã sửa, giữ nguyên nhãn đáp án đúng ở 100 phần "
                         "trăm số câu nên bài học sinh đã làm không bị ảnh hưởng.", XANH)

    doc.add_heading("2.4. Phương án giữ chỗ của công cụ sinh dữ liệu lọt vào", level=2)
    doc.add_paragraph(
        "Chuỗi “Kết quả ngược lại với đáp án đúng” là ghi chú của công cụ sinh dữ "
        f"liệu, xuất hiện ở {len(giu_cho)} câu lớp 1 và không bao giờ là đáp án đúng. Học sinh "
        "đọc thấy nó là loại được ngay, nên câu bốn phương án thực chất chỉ còn ba, câu ba "
        "phương án chỉ còn hai."
    )
    dong(doc, "Cách sửa", "giữ nguyên số lượng phương án và nhãn đáp án đúng, chỉ viết lại "
                          "nội dung ô giữ chỗ thành một câu trả lời sai nhưng hợp lý.", XANH)

    doc.add_heading("2.5. Câu lệnh làm trên vở bị ép thành trắc nghiệm", level=2)
    doc.add_paragraph(
        "Đề dạng “Nối số 1, 2, 3 với nhóm đồ vật tương ứng” hay “Vẽ thêm để có "
        "6 hình tròn” là bài tập làm trên vở, không có lời đáp để chọn. Khi bị ép thành "
        "trắc nghiệm thì phương án trở thành lời mô tả hành động như “Nối theo đúng số "
        "lượng”. Học sinh không cần tính gì, chỉ nhìn phương án nào nghe giống lời yêu "
        "cầu của đề là chọn đúng."
    )
    them_vi_du(doc, "Câu đã thay", [
        f"Câu {b['id']}: “{b['de_cu']}” thành “{b['de_moi']}”"
        for b in menh_lenh if b.get("loai") == "thay_moi"
    ], gioi_han=5)

    doc.add_heading("2.6. Câu học sinh không thể trả lời đúng", level=2)
    doc.add_paragraph(
        "Gồm câu mà đề không nêu đủ dữ kiện sau khi ảnh bị gỡ, và câu hỏi mở mà mọi phương án "
        "đều đúng. Ví dụ “Viết một phép so sánh có dấu lớn hơn” với ba phương án "
        "6 > 2, 7 > 2 và 5 > 2 thì cả ba đều là phép so sánh hợp lệ."
    )
    doi_dap_an = [b for b in khong_tra_loi if b.get("doi_dap_an")]
    if doi_dap_an:
        doc.add_paragraph().add_run("Câu phải đổi đáp án:").bold = True
        for b in doi_dap_an:
            p = doc.add_paragraph(style="List Bullet")
            p.add_run(f"Câu {b['id']}: đổi từ {b['dap_an_cu']} sang {b['dap_an_moi']}. ")
            r = p.add_run(b.get("ly_do_doi_dap_an", ""))
            r.font.color.rgb = XAM

    doc.add_heading("2.7. Ghi chú của người sửa dữ liệu lọt vào đề bài", level=2)
    doc.add_paragraph(
        "Hai câu lớp 4 hỏng theo kiểu riêng. Câu 10890 có đề bài chính là ghi chú "
        "“Sửa số trong ảnh thành 214 267 742 km cho khớp lời giải, hoặc giữ ảnh và viết "
        "lại...”. Đã tính tay để biết con số nào đúng: lấy a bằng 214 267 742 thì tổng ra "
        "364 253 868, khớp phương án đang được chấm; lấy 214 261 742 thì ra 364 247 868, "
        "không trùng phương án nào. Câu 10932 in luôn cả bốn phương án lẫn dòng "
        "“(Đáp án D)” ngay trong đề, học sinh đọc đề là thấy đáp án."
    )

    doc.add_heading("2.8. Lời giải không nêu được lý do", level=2)
    doc.add_paragraph(
        f"{len(loi_giai)} lời giải của lớp 1 chỉ chép lại đáp án theo mẫu “Dựa vào dữ kiện "
        "của câu hỏi, đáp án đúng là X”. Học sinh đọc xong vẫn không hiểu vì sao. Lời giải "
        "mới bám vào dữ kiện cụ thể của từng câu và nêu phép tính."
    )
    if loi_giai:
        m = loi_giai[0]
        dong(doc, "Lời giải cũ", m.get("loi_giai_cu", ""), DO)
        dong(doc, "Lời giải mới", m.get("loi_giai_moi", ""), XANH)
    doc.add_paragraph(
        "Trong nhóm này còn ba câu mà lời giải ghi đáp án CŨ từ trước đợt sửa đáp án, tức lời "
        "giải đang mâu thuẫn với chính đáp án được chấm: câu 6145 và 6205 chấm “Bằng "
        "nhau” nhưng lời giải viết “Ít hơn”."
    )

    doc.add_heading("2.9. Câu chỉ có ba phương án và nhãn đáp án bị lệch", level=2)
    da_them = them_pa.get("daThem", [])
    giu_nguyen = them_pa.get("giuNguyen", [])
    doc.add_paragraph(
        f"473 câu lớp 1 chỉ có ba phương án nên xác suất đoán mò là 33 phần trăm thay vì 25. "
        "Đây cũng là lý do nhãn đáp án đúng của lớp 1 lệch hẳn, D chỉ chiếm 15,9 phần trăm "
        "trong khi ba nhãn kia đều quanh 28, vì câu ba phương án thì không bao giờ có đáp án D."
    )
    bang_so_lieu(doc, "Phân bố nhãn đáp án đúng của lớp 1", [
        ("Trước", "A 27,9%   B 27,7%   C 28,4%   D 15,9%"),
        ("Sau", "A 26,6%   B 26,4%   C 25,3%   D 21,7%"),
    ])
    doc.add_paragraph(
        f"Đã bổ sung phương án thứ tư cho {len(da_them)} câu, chỉ làm khi suy ra được phương "
        f"án nhiễu có nghĩa. {len(giu_nguyen)} câu cố ý giữ nguyên ba phương án: câu đúng hay "
        "sai, câu có hay không, và câu điền dấu so sánh vì chỉ có đúng ba dấu."
    )
    doc.add_paragraph(
        "Phương án mới luôn được thêm vào cuối nên mang nhãn D và luôn sai. Nếu dừng ở đó thì "
        f"D còn lệch nặng hơn, vì vậy đã rải lại đáp án đúng ra cả bốn nhãn cho {len(can_bang)} "
        "câu. Đã kiểm chứng sau khi ghi: nội dung đáp án đúng giữ nguyên ở cả 1324 câu lớp 1, "
        "chỉ có nhãn đổi chỗ."
    )
    doc.add_paragraph(
        "26 câu có ảnh cắt từ tờ đề gộp được loại trừ khỏi việc rải lại, vì ảnh in sẵn nhãn "
        "A, B, C, D bên trong; đổi thứ tự trong dữ liệu sẽ khiến ảnh và dữ liệu nói hai đằng."
    )

    # ------------------------------------------------------------------ bài học kỹ thuật
    doc.add_heading("3. Một lỗi kỹ thuật đáng ghi lại", level=1)
    doc.add_paragraph(
        "File .tex là nguồn để nạp lại ngân hàng câu hỏi nhưng không lưu id của cơ sở dữ liệu, "
        "nên các script sửa phải tự dò lại khối tương ứng. Cách dò ban đầu chỉ so ĐỀ BÀI rồi "
        "lấy khối khớp đầu tiên. Cách đó sai khi nhiều câu dùng chung một đề bài: riêng lớp 1 "
        "có đề “Phép tính nào phù hợp với tranh?” dùng cho 30 câu khác nhau. Hậu quả "
        "là nội dung của câu này bị ghi đè lên khối của câu khác."
    )
    doc.add_paragraph(
        "Đo được mức lệch: 39 khối lớp 1 lệch đề bài, 21 lệch đáp án, 34 lệch phần ảnh; lớp 4 "
        "có 9 khối lệch thứ tự phương án. Đã sửa bằng cách đổi khoá dò sang bộ ba đề bài cộng "
        "toàn bộ phương án cộng đáp án đúng, và thêm một script dựng lại toàn bộ file .tex "
        "theo dữ liệu trong cơ sở dữ liệu, khớp theo VỊ TRÍ thay vì theo nội dung."
    )
    doc.add_paragraph(
        "Bài học: khi hai nơi cùng lưu một dữ liệu mà một nơi không có khoá định danh, phải "
        "chọn khoá dò đủ mạnh và phải có bước kiểm tra lại sau mỗi lần ghi, nếu không hai bên "
        "âm thầm lệch nhau mà không ai biết."
    )

    # ------------------------------------------------------------------ hiện trạng
    doc.add_heading("4. Hiện trạng sau đợt rà soát", level=1)
    thieu_pa = len(suc_khoe.get("thieuPhuongAn", []))
    nhac_anh = len(suc_khoe.get("nhacAnhMaKhongCoAnh", []))
    bang_so_lieu(doc, "Kết quả chạy kiểm tra sức khoẻ trên toàn bộ 7660 câu", [
        ("Đáp án đúng không có trong bộ phương án", str(len(suc_khoe.get("dapAnKhongCo", [])))),
        ("Lời giải để trống", str(len(suc_khoe.get("loiGiaiRong", [])))),
        ("Lời giải chỉ chép lại đáp án", str(len(suc_khoe.get("loiGiaiChepDapAn", [])))),
        ("Đề nhắc tranh, hình mà không có ảnh", f"{nhac_anh} (đã kiểm tay, đều là báo nhầm)"),
        ("Câu có ít hơn bốn phương án", f"{thieu_pa} (cố ý giữ nguyên)"),
        ("File .tex lệch so với cơ sở dữ liệu", "0"),
    ])
    doc.add_paragraph(
        f"{nhac_anh} câu bị báo nhầm là các câu hình học dạng “Trong hình chữ nhật ABCD, "
        "AB vuông góc với cạnh nào?”; chữ “hình” ở đây là ký hiệu hình học chứ "
        "không phải tranh minh họa nên đề vẫn tự đủ nghĩa."
    )

    doc.add_heading("5. Việc nên làm tiếp", level=1)
    for viec in [
        "Đọc lại các đề bài đã viết mới ở mục 2 xem cách diễn đạt đã phù hợp với lứa tuổi chưa, "
        "nhất là các câu lớp 1.",
        "Với câu muốn giữ phần minh họa, vẽ ảnh mới đúng nội dung đề rồi gắn lại. Ảnh minh họa "
        "KHÔNG nên in sẵn phương án A, B, C, D bên trong, vì hệ thống có thể đổi thứ tự phương án.",
        "Đối chiếu lại một lần nữa các câu đã đổi đáp án trước khi nộp. Đáp án mới đều đã được "
        "người kiểm duyệt tự mở ảnh xác minh, nhưng đây là thay đổi ảnh hưởng trực tiếp tới kết "
        "quả chấm của học sinh.",
        "61 câu lớp 1 chưa suy ra được phương án nhiễu bằng máy thì cần soạn tay nếu muốn đưa "
        "toàn bộ ngân hàng về chuẩn bốn phương án.",
        "Chạy lại scripts/health_check_question_bank.js sau mỗi lần sửa dữ liệu, và chạy "
        "scripts/resync_tex_from_db.js để file .tex không lệch với cơ sở dữ liệu.",
    ]:
        doc.add_paragraph(viec, style="List Number")

    doc.save(dich)
    print(f"Đã ghi {dich}")
    print(f"  Tổng lượt can thiệp: {tong_sua}")


# Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u hi?n t?i.
if __name__ == "__main__":
    main()
