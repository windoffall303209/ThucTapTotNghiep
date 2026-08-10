"""Xuất ngân hàng câu hỏi ra file Word theo đúng dữ liệu ĐANG DÙNG của hệ thống.

VÌ SAO PHẢI VIẾT MỚI THAY VÌ CHẠY LẠI build_gradeN_question_bank.py: các script cũ
là script SINH dữ liệu ban đầu. Chúng đọc từ thư mục nguồn gốc trên máy người tạo
dữ liệu, ví dụ C:\\Users\\...\\Project\\LYTHUYET và C:\\Users\\...\\Pictures\\DataToan,
rồi ghi đè cả file .docx lẫn file .tex. Chạy lại chúng bây giờ sẽ dựng lại ngân
hàng từ dữ liệu cũ và xoá sạch toàn bộ sửa chữa của đợt rà soát.

Script này đi theo chiều ngược lại: đọc từ file .tex trong data/ rồi dựng ra .docx.
File .tex là nguồn nạp lại ngân hàng và đã được đồng bộ với MySQL bằng
scripts/resync_tex_from_db.js, nên nó phản ánh đúng dữ liệu học sinh đang thấy.

TRƯỚC KHI CHẠY, hãy chạy lệnh sau và chắc chắn mọi khối lớp đều báo 0:

    node scripts/resync_tex_from_db.js

Nếu còn khối nào lệch thì file .docx xuất ra sẽ không khớp với hệ thống.

Định dạng giữ đúng như bản cũ để người đọc quen mắt: trang bìa, mục lục tự động,
mỗi bài một section riêng, mỗi câu gồm mã câu hỏi, đề bài, hình minh họa, bốn
phương án, đáp án và lời giải.

Dùng:
    python scripts/export_question_bank_docx.py            -> xuất cả 5 khối
    python scripts/export_question_bank_docx.py 1 3        -> chỉ xuất lớp 1 và 3
"""
# Script export question bank docx h? tr? nh?p, xu?t, ki?m tra ho?c b?o tr? d? li?u v? c?u h?nh c?a d? ?n.
from __future__ import annotations

import base64
import json
import re
import shutil
import sys
from collections import OrderedDict
from pathlib import Path
from urllib.parse import urlparse

from docx import Document
from docx.enum.section import WD_SECTION_START
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor
from PIL import Image

# Console Windows mặc định dùng bảng mã cp1252, in tiếng Việt sẽ ném
# UnicodeEncodeError sau khi tệp đã ghi xong, trông như script chạy hỏng.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
PUBLIC_DIR = ROOT / "public"
OUT_DIR = ROOT / "output" / "doc"
ANH_TAM = ROOT / "tmp" / "anh_docx_tam"
ANH_TAI_VE = ROOT / "tmp" / "anh_tai_ve"

TEX_THEO_KHOI = {
    1: "grade1_question_bank_reviewed.tex",
    2: "grade2_question_bank.tex",
    3: "grade3_question_bank.tex",
    4: "grade4_question_bank.tex",
    5: "grade5_question_bank.tex",
}

XANH_DAM = RGBColor(31, 78, 121)
XANH_VUA = RGBColor(47, 84, 150)
XANH_LA = RGBColor(0, 112, 60)


# H?m doc_payload d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
# --------------------------------------------------------------------- đọc .tex
def doc_payload(grade: int) -> list[dict]:
    """Đọc các dòng % DBJSON trong file .tex, giữ nguyên thứ tự xuất hiện."""
    tep = DATA_DIR / TEX_THEO_KHOI[grade]
    if not tep.exists():
        raise SystemExit(f"Không tìm thấy {tep}")

    ra: list[dict] = []
    for dong in tep.read_text(encoding="utf-8").split("\n"):
        if not dong.startswith("% DBJSON "):
            continue
        goi = dong[len("% DBJSON "):].strip()
        try:
            ra.append(json.loads(base64.b64decode(goi).decode("utf-8")))
        except (ValueError, UnicodeDecodeError):
            continue
    return ra


# H?m gom_theo_bai d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def gom_theo_bai(payloads: list[dict]) -> list[dict]:
    """Gom câu hỏi theo bài, giữ thứ tự bài xuất hiện lần đầu trong file."""
    theo_bai: OrderedDict[int, dict] = OrderedDict()
    for p in payloads:
        so = p.get("lesson_number")
        if so not in theo_bai:
            theo_bai[so] = {
                "number": so,
                "title": str(p.get("lesson_title") or "").strip(),
                "questions": [],
            }
        theo_bai[so]["questions"].append(p)
    return list(theo_bai.values())


# H?m tai_anh_ngoai d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
# ---------------------------------------------------------------------- ảnh
def tai_anh_ngoai(url: str) -> Path | None:
    """Tải ảnh có đường dẫn http về máy để nhúng được vào Word.

    Lớp 1 có 26 câu dùng ảnh cắt trên Cloudinary bằng phép biến đổi c_crop, các
    ảnh này không tồn tại dưới dạng tệp trên đĩa nên phải tải mới nhúng được.
    """
    from urllib.request import Request, urlopen

    ANH_TAI_VE.mkdir(parents=True, exist_ok=True)
    ten = re.sub(r"[^A-Za-z0-9_.-]+", "_", urlparse(url).path.strip("/")) or "anh"
    dich = ANH_TAI_VE / f"{ten}.img"
    if dich.exists() and dich.stat().st_size > 0:
        return dich
    try:
        request = Request(url, headers={"User-Agent": "Mozilla/5.0 question-bank-exporter"})
        with urlopen(request, timeout=30) as response:
            dich.write_bytes(response.read())
        return dich
    except Exception as loi:  # noqa: BLE001 - chỉ cần bỏ qua ảnh lỗi
        print(f"  CHÚ Ý: không tải được {url}: {loi}")
        return None


# H?m duong_dan_anh d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def duong_dan_anh(url: str) -> Path | None:
    url = str(url or "").strip()
    if not url:
        return None
    if url.startswith("http://") or url.startswith("https://"):
        return tai_anh_ngoai(url)
    tep = PUBLIC_DIR / url.lstrip("/")
    return tep if tep.exists() else None


# H?m anh_da_nen d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def anh_da_nen(nguon: Path, ma: str, thu_tu: int) -> tuple[Path, float] | None:
    """Nén ảnh về JPEG cạnh dài tối đa 1400 để file Word không phình quá to.

    Trả về kèm tỉ lệ cao trên rộng, để bên gọi tính được chiều cao khi nhúng.
    """
    ANH_TAM.mkdir(parents=True, exist_ok=True)
    dich = ANH_TAM / f"{ma}-{thu_tu}.jpg"
    try:
        can_tao_lai = not dich.exists()
        if dich.exists():
            try:
                with Image.open(dich) as anh_tam:
                    anh_tam.verify()
            except Exception:  # Cache có thể dang dở nếu lần xuất trước bị dừng giữa chừng.
                can_tao_lai = True
        if can_tao_lai:
            with Image.open(nguon) as anh:
                anh = anh.convert("RGB")
                anh.thumbnail((1400, 1400), Image.Resampling.LANCZOS)
                anh.save(dich, "JPEG", quality=78, optimize=True, progressive=True)
        with Image.open(dich) as anh:
            rong, cao = anh.size
        return dich, (cao / rong if rong else 1.0)
    except Exception as loi:  # noqa: BLE001
        print(f"  CHÚ Ý: không xử lý được ảnh {nguon}: {loi}")
        return None


# H?m them_muc_luc d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
# ---------------------------------------------------------------------- docx
def them_muc_luc(document: Document) -> None:
    p = document.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run()
    bat_dau = OxmlElement("w:fldChar")
    bat_dau.set(qn("w:fldCharType"), "begin")
    lenh = OxmlElement("w:instrText")
    lenh.set(qn("xml:space"), "preserve")
    lenh.text = 'TOC \\o "1-2" \\h \\z \\u'
    ngan = OxmlElement("w:fldChar")
    ngan.set(qn("w:fldCharType"), "separate")
    cho = OxmlElement("w:t")
    cho.text = "Mở file trong Word và chọn Update Field để cập nhật mục lục."
    ket = OxmlElement("w:fldChar")
    ket.set(qn("w:fldCharType"), "end")
    run._r.extend([bat_dau, lenh, ngan, cho, ket])


# H?m giu_khoi d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def giu_khoi(paragraph, dinh_doan_sau: bool = False) -> None:
    paragraph.paragraph_format.keep_together = True
    paragraph.paragraph_format.keep_with_next = dinh_doan_sau


# H?m ep_font d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def ep_font(style, ten_font: str) -> None:
    """Đặt font cho đủ bốn nhóm ký tự của Word.

    Gán style.font.name chỉ ghi thuộc tính w:ascii. Các style tiêu đề của Word lại
    thừa kế font chữ Latin từ theme thông qua w:asciiTheme, và thuộc tính theme
    thắng w:ascii, nên tiêu đề vẫn hiện Calibri dù đã đặt Arial. Phải xoá các
    thuộc tính theme rồi ghi thẳng cả bốn nhóm.
    """
    style.font.name = ten_font
    rPr = style.element.get_or_add_rPr()
    rFonts = rPr.find(qn("w:rFonts"))
    if rFonts is None:
        rFonts = OxmlElement("w:rFonts")
        rPr.append(rFonts)
    for thuoc_tinh in ("asciiTheme", "hAnsiTheme", "eastAsiaTheme", "cstheme"):
        khoa = qn(f"w:{thuoc_tinh}")
        if khoa in rFonts.attrib:
            del rFonts.attrib[khoa]
    for thuoc_tinh in ("ascii", "hAnsi", "eastAsia", "cs"):
        rFonts.set(qn(f"w:{thuoc_tinh}"), ten_font)


# H?m them_chan_trang d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def them_chan_trang(section) -> None:
    """Đặt số trang ở chân trang. Tài liệu dài vài nghìn trang mà không có số trang
    thì không tra cứu và không đóng quyển được."""
    p = section.footer.paragraphs[0] if section.footer.paragraphs else section.footer.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    for r in list(p.runs):
        r._r.getparent().remove(r._r)
    p.add_run("Trang ")
    run = p.add_run()
    bat_dau = OxmlElement("w:fldChar")
    bat_dau.set(qn("w:fldCharType"), "begin")
    lenh = OxmlElement("w:instrText")
    lenh.set(qn("xml:space"), "preserve")
    lenh.text = "PAGE"
    ket = OxmlElement("w:fldChar")
    ket.set(qn("w:fldCharType"), "end")
    run._r.extend([bat_dau, lenh, ket])


# H?m dat_kieu d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def dat_kieu(document: Document) -> None:
    section = document.sections[0]
    section.top_margin = section.bottom_margin = Cm(1.6)
    section.left_margin = section.right_margin = Cm(1.8)
    section.header_distance = Cm(0.7)
    section.footer_distance = Cm(0.7)

    normal = document.styles["Normal"]
    ep_font(normal, "Arial")
    normal.font.size = Pt(10)
    normal.paragraph_format.space_after = Pt(3)
    normal.paragraph_format.line_spacing = 1.05

    for ten, co, mau in [
        ("Title", 22, XANH_DAM),
        ("Heading 1", 16, XANH_DAM),
        ("Heading 2", 12, XANH_VUA),
        ("Subtitle", 10, RGBColor(0x55, 0x55, 0x55)),
    ]:
        style = document.styles[ten]
        ep_font(style, "Arial")
        style.font.size = Pt(co)
        style.font.color.rgb = mau


# Khổ A4 cao 29,7 cm, trừ lề trên dưới 1,6 cm mỗi bên còn 26,5 cm vùng in. Một câu
# hỏi còn có tiêu đề, đề bài, phương án, đáp án và lời giải nên ảnh chỉ được chiếm
# một phần. Giới hạn 12 cm để cả khối câu hỏi vừa một trang.
ANH_RONG_TOI_DA = 14.5
ANH_CAO_TOI_DA = 12.0


# H?m them_anh d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def them_anh(document: Document, images: list, ma: str, giu_sau: bool) -> int:
    """Nhúng ảnh vào tài liệu, trả về số ảnh đã nhúng được.

    Ảnh được giới hạn cả chiều rộng lẫn chiều cao. Bản đầu chỉ ép rộng 14,5 cm nên
    ảnh dạng dọc bị kéo cao tới 21,8 cm, chiếm gần trọn chiều cao trang in và đẩy
    phần phương án sang trang sau.
    """
    da_nhung = 0
    for thu_tu, im in enumerate(images or [], start=1):
        nguon = duong_dan_anh((im or {}).get("url"))
        if nguon is None:
            continue
        ket_qua = anh_da_nen(nguon, ma, thu_tu)
        if ket_qua is None:
            continue
        nen, ti_le_cao_tren_rong = ket_qua

        rong = ANH_RONG_TOI_DA
        if rong * ti_le_cao_tren_rong > ANH_CAO_TOI_DA:
            rong = ANH_CAO_TOI_DA / ti_le_cao_tren_rong

        p = document.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        picture = p.add_run().add_picture(str(nen), width=Cm(rong))
        alt_text = str((im or {}).get("alt_text") or f"Hình minh họa cho câu hỏi {ma}").strip()
        doc_pr = picture._inline.docPr
        doc_pr.set("descr", alt_text)
        doc_pr.set("title", f"Hình minh họa {ma}")
        giu_khoi(p, giu_sau)
        da_nhung += 1
    return da_nhung


# H?m dung_docx d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def dung_docx(grade: int, bai_hoc: list[dict], dich: Path) -> dict:
    document = Document()
    dat_kieu(document)
    them_chan_trang(document.sections[0])

    tong_cau = sum(len(b["questions"]) for b in bai_hoc)
    cau_chinh = sum(
        1 for b in bai_hoc for q in b["questions"] if q.get("source_kind") == "main"
    )
    cau_bo_sung = tong_cau - cau_chinh
    bai_co_du_lieu = sum(1 for b in bai_hoc if b["questions"])

    tieu_de = document.add_paragraph(style="Title")
    tieu_de.alignment = WD_ALIGN_PARAGRAPH.CENTER
    tieu_de.add_run(f"NGÂN HÀNG CÂU HỎI TOÁN {grade} - CÁNH DIỀU")

    phu_de = document.add_paragraph()
    phu_de.alignment = WD_ALIGN_PARAGRAPH.CENTER
    phu_de.add_run(
        f"Tổng hợp {tong_cau:,} câu hỏi - {bai_co_du_lieu}/{len(bai_hoc)} bài có dữ liệu"
    ).bold = True

    tom_tat = document.add_paragraph()
    tom_tat.alignment = WD_ALIGN_PARAGRAPH.CENTER
    if cau_bo_sung:
        tom_tat.add_run(
            f"Gồm {cau_chinh:,} câu chính và {cau_bo_sung:,} câu bổ sung; "
            "có đáp án, lời giải và hình minh họa."
        )
    else:
        tom_tat.add_run("Có đầy đủ đáp án, lời giải và hình minh họa.")

    ghi_chu = document.add_paragraph()
    ghi_chu.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = ghi_chu.add_run(
        "Bản xuất từ dữ liệu đang chạy của hệ thống, sau đợt rà soát toàn bộ ngân hàng câu hỏi."
    )
    r.italic = True
    r.font.color.rgb = RGBColor(0x55, 0x55, 0x55)

    document.add_paragraph()
    them_muc_luc(document)
    document.add_page_break()

    so_anh = 0
    so_anh_loi = 0

    for chi_so, bai in enumerate(bai_hoc):
        if chi_so:
            moi = document.add_section(WD_SECTION_START.NEW_PAGE)
            # Section mới trong Word mặc định có chân trang riêng và rỗng. Nối lại
            # với section trước để số trang chạy liên tục suốt tài liệu.
            moi.footer.is_linked_to_previous = True
        document.add_heading(f"Bài {bai['number']}. {bai['title']}", level=1)
        document.add_paragraph(f"{len(bai['questions'])} câu hỏi", style="Subtitle")

        for q in bai["questions"]:
            ma = str(q.get("external_id") or "")
            noi_dung = q.get("content") or {}
            phuong_an = q.get("choices") or []
            giai = q.get("explanation") or {}
            anh_de = [im for im in (noi_dung.get("images") or []) if (im or {}).get("url")]
            anh_giai = [im for im in (giai.get("images") or []) if (im or {}).get("url")]

            tieu = document.add_paragraph(style="Heading 2")
            tieu.paragraph_format.space_before = Pt(8)
            tieu.paragraph_format.space_after = Pt(3)
            nhan_bo = "Bổ sung" if q.get("source_kind") == "supplement" else "Bộ chính"
            tieu.add_run(f"{ma} - {q.get('difficulty') or 'EASY'} - {nhan_bo}")
            giu_khoi(tieu, True)

            de = document.add_paragraph()
            de.add_run(str(noi_dung.get("text") or "").strip()).bold = True
            # Luôn dính với đoạn sau, dù có ảnh hay không. Bản đầu chỉ đặt khi có
            # ảnh nên 4164 câu bị Word cắt ngay giữa đề bài và danh sách phương án.
            giu_khoi(de, True)

            nhung = them_anh(document, anh_de, ma, True)
            so_anh += nhung
            so_anh_loi += len(anh_de) - nhung

            p_pa = document.add_paragraph()
            for i, c in enumerate(phuong_an):
                run = p_pa.add_run(f"{c.get('key')}. {str(c.get('text') or '').strip()}")
                if i < len(phuong_an) - 1:
                    run.add_break()
            giu_khoi(p_pa, True)

            khoa = q.get("correct_answer")
            noi_dung_dap_an = next(
                (str(c.get("text") or "").strip() for c in phuong_an if c.get("key") == khoa),
                "",
            )
            p_dap = document.add_paragraph()
            run = p_dap.add_run(f"Đáp án: {khoa}. {noi_dung_dap_an}")
            run.bold = True
            run.font.color.rgb = XANH_LA
            giu_khoi(p_dap, True)

            p_giai = document.add_paragraph()
            p_giai.add_run("Lời giải: ").bold = True
            p_giai.add_run(str(giai.get("text") or "").strip())
            giu_khoi(p_giai, bool(anh_giai))

            nhung_giai = them_anh(document, anh_giai, f"{ma}-giai", False)
            so_anh += nhung_giai
            so_anh_loi += len(anh_giai) - nhung_giai

    dich.parent.mkdir(parents=True, exist_ok=True)
    document.save(dich)

    return {
        "tong_cau": tong_cau,
        "cau_chinh": cau_chinh,
        "cau_bo_sung": cau_bo_sung,
        "so_bai": len(bai_hoc),
        "so_anh": so_anh,
        "so_anh_loi": so_anh_loi,
    }


# H?m main d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def main() -> None:
    khoi = [int(a) for a in sys.argv[1:] if a.isdigit()] or [1, 2, 3, 4, 5]

    print("Nhắc trước: hãy chắc chắn `node scripts/resync_tex_from_db.js` báo 0 ở mọi khối lớp,")
    print("nếu không thì file Word xuất ra sẽ không khớp với dữ liệu hệ thống đang dùng.\n")

    tong = {"cau": 0, "anh": 0, "anh_loi": 0}
    for g in khoi:
        dich = OUT_DIR / f"ngan_hang_cau_hoi_toan_{g}_canh_dieu_sau_ra_soat.docx"
        payloads = doc_payload(g)
        bai_hoc = gom_theo_bai(payloads)
        tk = dung_docx(g, bai_hoc, dich)
        co = dich.stat().st_size / (1024 * 1024)
        print(
            f"Lớp {g}: {tk['tong_cau']:,} câu / {tk['so_bai']} bài / "
            f"{tk['so_anh']} ảnh nhúng"
            + (f" / {tk['so_anh_loi']} ảnh KHÔNG nhúng được" if tk["so_anh_loi"] else "")
        )
        print(f"   -> {dich.relative_to(ROOT)}  ({co:,.1f} MB)")
        tong["cau"] += tk["tong_cau"]
        tong["anh"] += tk["so_anh"]
        tong["anh_loi"] += tk["so_anh_loi"]

    print(f"\nTổng: {tong['cau']:,} câu, {tong['anh']:,} ảnh nhúng, {tong['anh_loi']} ảnh lỗi.")
    shutil.rmtree(ANH_TAM, ignore_errors=True)


# Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u hi?n t?i.
if __name__ == "__main__":
    main()
