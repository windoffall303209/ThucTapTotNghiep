"""Đối chiếu file Word ngân hàng câu hỏi với dữ liệu thật trong MySQL.

Xuất ra file Word xong thì phải chứng minh được nó khớp dữ liệu hệ thống, nếu
không thì bản in và bản chạy nói hai đằng. Script này đọc lại từng câu trong .docx
rồi so với bản dump MySQL, so ĐẦY ĐỦ chứ không lấy mẫu.

So bốn thứ của mỗi câu: đề bài, danh sách phương án theo đúng thứ tự, nhãn đáp án
đúng, và lời giải. Ngoài ra kiểm luôn số ảnh nhúng có bằng số ảnh mà câu tham
chiếu không.

Cách dùng:
    node scripts/dump_questions_json.js            -> tạo tmp/dump_cau_hoi.json
    python scripts/verify_question_bank_docx.py    -> đối chiếu

Trả về mã thoát khác 0 nếu có bất kỳ câu nào lệch, để cắm vào quy trình tự động.
"""
# Script verify question bank docx hỗ trợ nhập, xuất, kiểm tra hoặc bảo trì dữ liệu và cấu hình của dự án.
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from docx import Document

# Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
DUMP = ROOT / "tmp" / "dump_cau_hoi.json"
OUT_DIR = ROOT / "output" / "doc"
BAO_CAO = ROOT / "tmp" / "bao_cao_doi_chieu_docx.json"

# "G5-L001-Q001 - EASY - Bộ chính"
MA_CAU = re.compile(r"^(G\d-L\d{3}-Q\d{3})\s+-\s+(\S+)\s+-\s+(.+)$")


# Hàm chuan dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def chuan(s: str) -> str:
    """Bỏ khác biệt vô hại về khoảng trắng để so cho công bằng."""
    return re.sub(r"\s+", " ", str(s or "")).strip()


# Hàm doc_docx dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def doc_docx(tep: Path) -> dict[str, dict]:
    """Bóc từng câu hỏi ra khỏi .docx theo đúng khuôn mà exporter đã ghi."""
    doc = Document(tep)
    cau: dict[str, dict] = {}
    ma_hien_tai = None
    khoi: list = []

# Hàm chot dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

    def chot():
        if ma_hien_tai is None:
            return
        de = ""
        phuong_an: list[str] = []
        dap_an = ""
        loi_giai = ""
        so_anh = 0
        for p in khoi:
            text = chuan(p.text)
            # Đếm theo thẻ MỞ "<a:graphicData". Nếu đếm chuỗi "graphicData" trần
            # thì mỗi ảnh bị tính hai lần vì khớp cả thẻ mở lẫn thẻ đóng.
            so_anh_doan = p._p.xml.count("<a:graphicData")
            if so_anh_doan:
                so_anh += so_anh_doan
                if not text:
                    continue
            if not text:
                continue
            if text.startswith("Đáp án:"):
                dap_an = chuan(text[len("Đáp án:"):])
            elif text.startswith("Lời giải:"):
                loi_giai = chuan(text[len("Lời giải:"):])
            elif re.match(r"^[A-D]\.\s", text) and not de.startswith(("A.", "B.", "C.", "D.")):
                # Các phương án nằm chung một đoạn, ngăn nhau bằng ngắt dòng.
                phuong_an = [chuan(x) for x in p.text.split("\n") if chuan(x)]
            elif not de:
                de = text
        cau[ma_hien_tai] = {
            "de": de,
            "phuong_an": phuong_an,
            "dap_an": dap_an,
            "loi_giai": loi_giai,
            "so_anh": so_anh,
        }

    for p in doc.paragraphs:
        if p.style.name == "Heading 2":
            khop = MA_CAU.match(chuan(p.text))
            if khop:
                chot()
                ma_hien_tai = khop.group(1)
                khoi = []
                continue
        if ma_hien_tai is not None:
            khoi.append(p)
    chot()
    return cau


# Hàm main dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def main() -> None:
    if not DUMP.exists():
        raise SystemExit(f"Chưa có {DUMP}. Chạy trước: node scripts/dump_questions_json.js")

    du_lieu = json.loads(DUMP.read_text(encoding="utf-8"))
    theo_khoi: dict[str, list] = {}
    for c in du_lieu:
        theo_khoi.setdefault(str(c["grade"]), []).append(c)

    tat_ca_lech = []
    tong_kiem = 0

    for grade in sorted(theo_khoi):
        tep = OUT_DIR / f"ngan_hang_cau_hoi_toan_{grade}_canh_dieu_sau_ra_soat.docx"
        if not tep.exists():
            print(f"Lớp {grade}: KHÔNG có {tep.name}, bỏ qua.")
            continue

        trong_docx = doc_docx(tep)
        trong_db = {c["external_id"]: c for c in theo_khoi[grade]}

        thieu = [m for m in trong_db if m not in trong_docx]
        thua = [m for m in trong_docx if m not in trong_db]
        lech = []

        for ma, db in trong_db.items():
            if ma not in trong_docx:
                continue
            tong_kiem += 1
            dx = trong_docx[ma]

            pa_db = [f"{c['key']}. {chuan(c['text'])}" for c in db["choices"]]
            dap_db = chuan(f"{db['correct_answer']}. {db['dap_an_text']}")

            cac_loi = []
            if chuan(db["de"]) != dx["de"]:
                cac_loi.append(("đề bài", chuan(db["de"]), dx["de"]))
            if pa_db != dx["phuong_an"]:
                cac_loi.append(("phương án", " | ".join(pa_db), " | ".join(dx["phuong_an"])))
            if dap_db != dx["dap_an"]:
                cac_loi.append(("đáp án", dap_db, dx["dap_an"]))
            if chuan(db["loi_giai"]) != dx["loi_giai"]:
                cac_loi.append(("lời giải", chuan(db["loi_giai"]), dx["loi_giai"]))
            if db["so_anh"] != dx["so_anh"]:
                cac_loi.append(("số ảnh", str(db["so_anh"]), str(dx["so_anh"])))

            if cac_loi:
                lech.append({
                    "external_id": ma, "db_id": db["id"], "grade": db["grade"],
                    "cac_loi": [{"truong": t, "trong_db": a, "trong_docx": b} for t, a, b in cac_loi],
                })

        trang_thai = "KHỚP" if not (lech or thieu or thua) else "CÓ LỆCH"
        print(
            f"Lớp {grade}: {len(trong_db)} câu trong MySQL, {len(trong_docx)} câu đọc được "
            f"từ Word -> {trang_thai}"
        )
        if thieu:
            print(f"   thiếu trong Word: {len(thieu)}  ví dụ {thieu[:5]}")
        if thua:
            print(f"   thừa trong Word:  {len(thua)}  ví dụ {thua[:5]}")
        if lech:
            print(f"   lệch nội dung:    {len(lech)}")
            for m in lech[:5]:
                for e in m["cac_loi"][:2]:
                    print(f"     {m['external_id']} [{e['truong']}]")
                    print(f"        MySQL: {e['trong_db'][:96]}")
                    print(f"        Word : {e['trong_docx'][:96]}")

        tat_ca_lech.extend(lech)
        tat_ca_lech.extend({"external_id": m, "grade": grade, "cac_loi": [{"truong": "thiếu trong Word"}]} for m in thieu)
        tat_ca_lech.extend({"external_id": m, "grade": grade, "cac_loi": [{"truong": "thừa trong Word"}]} for m in thua)

    BAO_CAO.write_text(json.dumps(tat_ca_lech, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\nĐã đối chiếu {tong_kiem:,} câu. Số câu lệch: {len(tat_ca_lech)}")
    print(f"Báo cáo: {BAO_CAO.relative_to(ROOT)}")

    if tat_ca_lech:
        sys.exit(1)


# Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
if __name__ == "__main__":
    main()
