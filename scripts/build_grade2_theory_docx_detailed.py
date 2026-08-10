# Script build grade2 theory docx detailed hỗ trợ nhập, xuất, kiểm tra hoặc bảo trì dữ liệu và cấu hình của dự án.
import json
import math
import textwrap
import unicodedata
from pathlib import Path

from docx import Document
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "output" / "doc"
IMAGE_DIR = OUTPUT_DIR / "grade2_theory_images_detailed"
BLUEPRINT_PATH = ROOT / "content-theory" / "grade-2-theory-blueprint-detailed.json"
OUTPUT_PATH = OUTPUT_DIR / "ly-thuyet-lop-2-codex-chi-tiet.docx"
FALLBACK_OUTPUT_PATH = OUTPUT_DIR / "ly-thuyet-lop-2-codex-chi-tiet-fixed.docx"

FONT_REGULAR = Path("C:/Windows/Fonts/arial.ttf")
FONT_BOLD = Path("C:/Windows/Fonts/arialbd.ttf")


CHAPTERS = [
    {
        "title": "Ôn tập lớp 1. Phép cộng, phép trừ có nhớ trong phạm vi 20",
        "lessons": [
            "Tia số. Số liền trước, số liền sau",
            "Đề-xi-mét",
            "Số hạng - Tổng",
            "Số bị trừ - Số trừ - Hiệu",
            "Phép cộng có nhớ trong phạm vi 20",
            "Phép cộng có nhớ trong phạm vi 20 (tiếp theo)",
            "Bảng cộng có nhớ trong phạm vi 20",
            "Phép trừ có nhớ trong phạm vi 20",
            "Phép trừ có nhớ trong phạm vi 20 (tiếp theo)",
            "Bảng trừ có nhớ trong phạm vi 20",
            "Bài toán liên quan đến phép cộng, phép trừ",
            "Bài toán liên quan đến phép cộng, phép trừ (tiếp theo)",
        ],
    },
    {
        "title": "Phép cộng, phép trừ có nhớ trong phạm vi 100",
        "lessons": [
            "Phép cộng có nhớ trong phạm vi 100",
            "Phép cộng có nhớ trong phạm vi 100 (tiếp theo)",
            "Phép trừ có nhớ trong phạm vi 100",
            "Phép trừ có nhớ trong phạm vi 100 (tiếp theo)",
            "Ki-lô-gam",
            "Lít",
            "Hình tứ giác",
            "Điểm, đoạn thẳng",
            "Đường thẳng, đường cong, đường gấp khúc",
            "Độ dài đoạn thẳng. Độ dài đường gấp khúc",
            "Đo độ dài đoạn thẳng, độ dài đường gấp khúc",
        ],
    },
    {
        "title": "Phép nhân, phép chia",
        "lessons": [
            "Làm quen với phép nhân. Dấu nhân",
            "Phép nhân",
            "Thừa số, tích",
            "Bảng nhân 2",
            "Bảng nhân 5",
            "Làm quen với phép chia. Dấu chia",
            "Phép chia",
            "Phép chia (tiếp theo)",
            "Bảng chia 2",
            "Bảng chia 5",
            "Số bị chia, số chia, thương",
            "Khối trụ - Khối cầu",
            "Ngày - giờ",
            "Giờ - Phút",
            "Ngày - Tháng",
        ],
    },
    {
        "title": "Các số trong phạm vi 1000. Phép cộng, phép trừ trong phạm vi 1000",
        "lessons": [
            "Các số trong phạm vi 1000",
            "Các số có ba chữ số",
            "Các số có ba chữ số (tiếp theo)",
            "So sánh các số có ba chữ số",
            "Phép cộng không nhớ trong phạm vi 1000",
            "Phép trừ không nhớ trong phạm vi 1000",
            "Mét",
            "Ki-lô-mét",
            "Phép cộng có nhớ trong phạm vi 1000",
            "Phép trừ có nhớ trong phạm vi 1000",
            "Thu thập - Kiểm đếm",
            "Biểu đồ tranh",
            "Chắc chắn - Có thể - Không thể",
        ],
    },
]


# Hàm font dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def font(size, bold=False):
    path = FONT_BOLD if bold and FONT_BOLD.exists() else FONT_REGULAR
    if path.exists():
        return ImageFont.truetype(str(path), size=size)
    return ImageFont.load_default()


# Hàm strip_accents dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def strip_accents(text):
    text = text.replace("Đ", "D").replace("đ", "d")
    return "".join(c for c in unicodedata.normalize("NFD", text) if unicodedata.category(c) != "Mn")


# Hàm norm dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def norm(text):
    return strip_accents(text).lower()


# Hàm wrap_lines dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def wrap_lines(text, width=42):
    lines = []
    for part in str(text).splitlines():
        lines.extend(textwrap.wrap(part, width=width) or [""])
    return lines


# Hàm text_wh dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def text_wh(draw, text, fnt):
    box = draw.textbbox((0, 0), text, font=fnt)
    return box[2] - box[0], box[3] - box[1]


# Hàm draw_center dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def draw_center(draw, xy, text, fnt, fill="#0f172a"):
    x, y = xy
    w, h = text_wh(draw, text, fnt)
    draw.text((x - w / 2, y - h / 2), text, font=fnt, fill=fill)


# Hàm draw_wrapped dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def draw_wrapped(draw, text, xy, fnt, fill="#172033", width=44, spacing=8):
    x, y = xy
    for line in wrap_lines(text, width):
        draw.text((x, y), line, font=fnt, fill=fill)
        y += fnt.size + spacing
    return y


# Hàm rounded dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def rounded(draw, box, fill, outline="#cbd5e1", width=3, radius=22):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width if outline else 1)


# Hàm label_box dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def label_box(draw, box, text, fill="#eff6ff", outline="#1d4ed8", color="#1e3a8a", size=24):
    rounded(draw, box, fill, outline, 3, 16)
    draw_center(draw, ((box[0] + box[2]) / 2, (box[1] + box[3]) / 2), text, font(size, True), color)


# Hàm header dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def header(draw, lesson, card_title):
    rounded(draw, (34, 34, 1166, 641), "#ffffff", "#cbd5e1", 3, 30)
    draw.text((78, 65), "Toán lớp 2", font=font(27, True), fill="#1f4e79")
    draw.text((78, 103), lesson, font=font(30, True), fill="#0f172a")
    label_box(draw, (860, 62, 1122, 116), card_title, fill="#e0f2fe", outline="#0369a1", color="#075985", size=24)
    draw.line((78, 145, 1122, 145), fill="#e2e8f0", width=3)


# Hàm draw_apple dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def draw_apple(draw, cx, cy, scale=1.0, color="#ef4444"):
    r = int(18 * scale)
    draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=color, outline="#991b1b", width=max(1, int(2 * scale)))
    draw.rectangle((cx - 3, cy - r - 13, cx + 3, cy - r), fill="#7c2d12")
    draw.ellipse((cx + 4, cy - r - 14, cx + 20, cy - r), fill="#22c55e", outline="#15803d")


# Hàm draw_coin dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def draw_coin(draw, cx, cy, text="", scale=1.0):
    r = int(20 * scale)
    draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill="#fde68a", outline="#a16207", width=2)
    if text:
        draw_center(draw, (cx, cy), text, font(int(16 * scale), True), "#92400e")


# Hàm draw_person dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def draw_person(draw, x, y, label="Bạn nhỏ"):
    draw.ellipse((x + 34, y, x + 78, y + 44), fill="#fed7aa", outline="#9a3412", width=2)
    draw.rectangle((x + 43, y + 44, x + 69, y + 115), fill="#60a5fa", outline="#1d4ed8", width=2)
    draw.line((x + 43, y + 62, x + 10, y + 92), fill="#1d4ed8", width=5)
    draw.line((x + 69, y + 62, x + 102, y + 92), fill="#1d4ed8", width=5)
    draw.line((x + 48, y + 115, x + 30, y + 160), fill="#1d4ed8", width=5)
    draw.line((x + 64, y + 115, x + 85, y + 160), fill="#1d4ed8", width=5)
    draw.text((x - 8, y + 168), label, font=font(18, True), fill="#0f172a")


# Hàm draw_group_panel dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def draw_group_panel(draw, box, count, label, item="apple", color="#eff6ff"):
    rounded(draw, box, color, "#94a3b8", 3, 22)
    x1, y1, x2, y2 = box
    draw.text((x1 + 18, y1 + 16), label, font=font(24, True), fill="#0f172a")
    cols = min(5, max(1, count))
    for i in range(count):
        cx = x1 + 42 + (i % cols) * 45
        cy = y1 + 78 + (i // cols) * 48
        if item == "coin":
            draw_coin(draw, cx, cy)
        elif item == "book":
            rounded(draw, (cx - 18, cy - 18, cx + 18, cy + 20), "#93c5fd", "#1d4ed8", 2, 6)
        else:
            draw_apple(draw, cx, cy)


# Hàm draw_base_ten dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def draw_base_ten(draw, x, y, hundreds=0, tens=0, ones=0, label=""):
    if label:
        draw.text((x, y - 38), label, font=font(24, True), fill="#0f172a")
    for i in range(hundreds):
        bx = x + (i % 3) * 86
        by = y + (i // 3) * 86
        rounded(draw, (bx, by, bx + 70, by + 70), "#bfdbfe", "#1d4ed8", 2, 10)
        for k in range(1, 5):
            draw.line((bx + k * 14, by, bx + k * 14, by + 70), fill="#60a5fa", width=1)
            draw.line((bx, by + k * 14, bx + 70, by + k * 14), fill="#60a5fa", width=1)
    start_x = x + 285
    for i in range(tens):
        bx = start_x + i * 28
        rounded(draw, (bx, y, bx + 20, y + 142), "#fde68a", "#a16207", 2, 7)
        for k in range(1, 10):
            draw.line((bx, y + k * 14, bx + 20, y + k * 14), fill="#f59e0b", width=1)
    start_x2 = start_x + max(tens, 1) * 32 + 34
    for i in range(ones):
        ox = start_x2 + (i % 5) * 34
        oy = y + (i // 5) * 34
        rounded(draw, (ox, oy, ox + 22, oy + 22), "#bbf7d0", "#15803d", 2, 6)


# Hàm draw_vertical_add dùng để tạo bản ghi hoặc tài nguyên mới sau khi kiểm tra đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def draw_vertical_add(draw, x, y, top, bottom, result, op="+"):
    draw.text((x, y), f"  {top}", font=font(56, True), fill="#0f172a")
    draw.text((x, y + 62), f"{op} {bottom}", font=font(56, True), fill="#0f172a")
    draw.line((x, y + 132, x + 210, y + 132), fill="#0f172a", width=5)
    draw.text((x, y + 148), f"  {result}", font=font(56, True), fill="#1d4ed8")


# Hàm draw_number_line dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def draw_number_line(draw, x, y, start, end, highlight=None, title=""):
    if title:
        draw.text((x, y - 72), title, font=font(26, True), fill="#0f172a")
    draw.line((x, y, x + (end - start) * 88 + 36, y), fill="#1d4ed8", width=6)
    draw.polygon([(x + (end - start) * 88 + 36, y), (x + (end - start) * 88 + 12, y - 14), (x + (end - start) * 88 + 12, y + 14)], fill="#1d4ed8")
    for i, n in enumerate(range(start, end + 1)):
        xx = x + i * 88
        draw.line((xx, y - 22, xx, y + 22), fill="#1d4ed8", width=4)
        if n == highlight:
            draw.ellipse((xx - 34, y - 86, xx + 34, y - 18), fill="#fde68a", outline="#a16207", width=4)
            draw_center(draw, (xx, y - 52), str(n), font(26, True), "#92400e")
        draw_center(draw, (xx, y + 52), str(n), font(24, True), "#111827")


# Hàm lesson_kind dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def lesson_kind(name):
    n = norm(name)
    if "tia so" in n:
        return "number_line"
    if "de-xi-met" in n:
        return "dm"
    if "ki-lo-gam" in n:
        return "kg"
    if n == "lit":
        return "lit"
    if n == "met":
        return "meter"
    if "ki-lo-met" in n:
        return "km"
    if "ngay - gio" in n:
        return "day_hour"
    if "gio - phut" in n:
        return "hour_minute"
    if "ngay - thang" in n:
        return "calendar"
    if "so hang" in n:
        return "parts_add"
    if "so bi tru" in n:
        return "parts_sub"
    if "thua so" in n:
        return "parts_mul"
    if "so bi chia" in n:
        return "parts_div"
    if "bang cong" in n:
        return "fact_add"
    if "bang tru" in n:
        return "fact_sub"
    if "bang nhan 2" in n:
        return "fact_mul2"
    if "bang nhan 5" in n:
        return "fact_mul5"
    if "bang chia 2" in n:
        return "fact_div2"
    if "bang chia 5" in n:
        return "fact_div5"
    if "phep cong" in n:
        return "add_1000" if "1000" in n else ("add_100" if "100" in n else "add_20")
    if "phep tru" in n:
        return "sub_1000" if "1000" in n else ("sub_100" if "100" in n else "sub_20")
    if "bai toan" in n:
        return "word_problem"
    if "lam quen voi phep nhan" in n or n == "phep nhan":
        return "multiplication"
    if "lam quen voi phep chia" in n or n.startswith("phep chia"):
        return "division"
    if "hinh tu giac" in n:
        return "quadrilateral"
    if "diem" in n:
        return "point_segment"
    if "duong thang" in n:
        return "line_types"
    if "do dai" in n or "do do dai" in n:
        return "polyline_length"
    if "khoi tru" in n:
        return "solid"
    if "so sanh" in n:
        return "compare_3digit"
    if "so trong pham vi 1000" in n or "ba chu so" in n:
        return "place_value"
    if "thu thap" in n:
        return "tally"
    if "bieu do" in n:
        return "pictograph"
    if "chac chan" in n:
        return "probability"
    return "general"


# Hàm lesson_spec dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def lesson_spec(name):
    k = lesson_kind(name)
    specs = {
        "number_line": ("Nhận biết tia số, số liền trước và số liền sau.", "Trên tia số, 27 đứng ngay trước 28; 29 đứng ngay sau 28.", "Số liền sau của 35 là 36.", "36"),
        "dm": ("Nhận biết đơn vị đề-xi-mét và quan hệ 1 dm = 10 cm.", "Thước dài 10 cm tương ứng 1 dm.", "3 dm = 30 cm.", "30 cm"),
        "parts_add": ("Gọi đúng tên số hạng và tổng trong phép cộng.", "Trong 8 + 5 = 13, 8 và 5 là số hạng, 13 là tổng.", "Trong 6 + 7 = 13, tổng là 13.", "13"),
        "parts_sub": ("Gọi đúng tên số bị trừ, số trừ và hiệu.", "Trong 15 - 7 = 8, 15 là số bị trừ, 7 là số trừ, 8 là hiệu.", "Trong 18 - 9 = 9, hiệu là 9.", "9"),
        "add_20": ("Cộng có nhớ trong phạm vi 20 bằng cách làm tròn chục.", "8 + 5 = 13 vì 8 + 2 = 10, 10 + 3 = 13.", "9 + 4 = 13.", "13"),
        "fact_add": ("Ghi nhớ và vận dụng bảng cộng có nhớ trong phạm vi 20.", "8 + 5 = 13; 9 + 4 = 13; 7 + 6 = 13.", "6 + 8 = 14.", "14"),
        "sub_20": ("Trừ có nhớ trong phạm vi 20 bằng cách tách số trừ.", "13 - 5 = 8 vì 13 - 3 = 10, 10 - 2 = 8.", "14 - 6 = 8.", "8"),
        "fact_sub": ("Ghi nhớ và vận dụng bảng trừ có nhớ trong phạm vi 20.", "13 - 5 = 8; 14 - 6 = 8; 15 - 7 = 8.", "12 - 7 = 5.", "5"),
        "word_problem": ("Đọc tình huống, chọn phép tính phù hợp và trả lời.", "Mai có 12 nhãn vở, Lan cho thêm 5 nhãn vở. Mai có 17 nhãn vở.", "Có 18 quả cam, bán 7 quả, còn 11 quả cam.", "11 quả cam"),
        "add_100": ("Cộng có nhớ trong phạm vi 100 theo hàng đơn vị và hàng chục.", "38 + 27 = 65: 8 + 7 = 15, viết 5 nhớ 1 chục.", "46 + 28 = 74.", "74"),
        "sub_100": ("Trừ có nhớ trong phạm vi 100 theo hàng đơn vị và hàng chục.", "52 - 28 = 24: mượn 1 chục để trừ hàng đơn vị.", "63 - 27 = 36.", "36"),
        "kg": ("Nhận biết ki-lô-gam là đơn vị đo khối lượng.", "Túi gạo 5 kg nặng hơn túi gạo 2 kg.", "Túi 4 kg nặng hơn túi 1 kg.", "4 kg"),
        "lit": ("Nhận biết lít là đơn vị đo dung tích.", "Bình 3 l có nhiều nước hơn bình 1 l.", "Can 5 l nhiều hơn chai 2 l.", "5 l"),
        "quadrilateral": ("Nhận biết hình tứ giác có 4 cạnh.", "Hình có 4 cạnh là hình tứ giác.", "Hình vẽ có 4 cạnh.", "Hình tứ giác"),
        "point_segment": ("Nhận biết điểm và đoạn thẳng nối hai điểm.", "Đoạn thẳng AB nối điểm A và điểm B.", "Hai đầu của đoạn thẳng là hai điểm.", "Điểm A và điểm B"),
        "line_types": ("Phân biệt đường thẳng, đường cong và đường gấp khúc.", "Đường gấp khúc gồm nhiều đoạn thẳng nối nhau.", "Hình gồm 3 đoạn thẳng nối nhau là đường gấp khúc.", "Đường gấp khúc"),
        "polyline_length": ("Tính độ dài đường gấp khúc bằng tổng độ dài các đoạn.", "Đường gấp khúc gồm 3 cm và 4 cm dài 7 cm.", "2 cm + 5 cm = 7 cm.", "7 cm"),
        "multiplication": ("Hiểu phép nhân là cộng các số hạng bằng nhau.", "2 + 2 + 2 = 6 viết thành 2 x 3 = 6.", "4 nhóm, mỗi nhóm 2 quả: 2 x 4 = 8.", "8 quả"),
        "parts_mul": ("Gọi đúng tên thừa số và tích trong phép nhân.", "Trong 2 x 5 = 10, 2 và 5 là thừa số, 10 là tích.", "Trong 5 x 3 = 15, tích là 15.", "15"),
        "fact_mul2": ("Ghi nhớ và vận dụng bảng nhân 2.", "2 x 4 = 8 vì có 4 nhóm, mỗi nhóm 2.", "2 x 6 = 12.", "12"),
        "fact_mul5": ("Ghi nhớ và vận dụng bảng nhân 5.", "5 x 3 = 15 vì có 3 nhóm, mỗi nhóm 5.", "5 x 6 = 30.", "30"),
        "division": ("Hiểu phép chia là chia đều hoặc chia theo nhóm.", "6 đồ vật chia đều thành 2 phần, mỗi phần 3 đồ vật: 6 : 2 = 3.", "10 : 2 = 5.", "5"),
        "fact_div2": ("Ghi nhớ và vận dụng bảng chia 2.", "8 : 2 = 4 vì chia đều 8 đồ vật thành 2 phần.", "12 : 2 = 6.", "6"),
        "fact_div5": ("Ghi nhớ và vận dụng bảng chia 5.", "20 : 5 = 4 vì chia đều 20 đồ vật thành 5 phần.", "25 : 5 = 5.", "5"),
        "parts_div": ("Gọi đúng tên số bị chia, số chia và thương.", "Trong 10 : 2 = 5, 10 là số bị chia, 2 là số chia, 5 là thương.", "Trong 20 : 5 = 4, thương là 4.", "4"),
        "solid": ("Nhận biết khối trụ và khối cầu qua đồ vật quen thuộc.", "Lon sữa giống khối trụ; quả bóng giống khối cầu.", "Quả bóng là khối cầu.", "Khối cầu"),
        "day_hour": ("Nhận biết một ngày có 24 giờ và đọc giờ quen thuộc.", "Một ngày có 24 giờ.", "Buổi sáng đi học lúc 7 giờ.", "7 giờ"),
        "hour_minute": ("Nhận biết 1 giờ = 60 phút.", "1 giờ = 60 phút.", "2 giờ = 120 phút.", "120 phút"),
        "calendar": ("Nhận biết ngày, tháng trên lịch.", "Một tháng có thể có 28, 29, 30 hoặc 31 ngày.", "Tháng 1 có 31 ngày.", "31 ngày"),
        "place_value": ("Đọc, viết và phân tích số có ba chữ số.", "326 gồm 3 trăm, 2 chục và 6 đơn vị.", "405 gồm 4 trăm, 0 chục và 5 đơn vị.", "4 trăm, 0 chục, 5 đơn vị"),
        "compare_3digit": ("So sánh các số có ba chữ số theo hàng trăm, chục, đơn vị.", "345 < 412 vì 3 trăm bé hơn 4 trăm.", "608 > 580.", ">"),
        "add_1000": ("Cộng trong phạm vi 1000 theo từng hàng.", "326 + 152 = 478.", "245 + 132 = 377.", "377"),
        "sub_1000": ("Trừ trong phạm vi 1000 theo từng hàng.", "478 - 152 = 326.", "377 - 132 = 245.", "245"),
        "meter": ("Nhận biết mét và quan hệ 1 m = 100 cm.", "1 m = 100 cm.", "2 m = 200 cm.", "200 cm"),
        "km": ("Nhận biết ki-lô-mét dùng để đo quãng đường dài.", "5 km dài hơn 2 km.", "Từ nhà đến trường 3 km.", "3 km"),
        "tally": ("Thu thập và kiểm đếm dữ liệu đơn giản.", "Mỗi vạch kiểm đếm biểu thị một lần chọn.", "Có 4 vạch nghĩa là có 4 bạn chọn.", "4 bạn"),
        "pictograph": ("Đọc biểu đồ tranh đơn giản.", "Mỗi hình quả táo biểu thị 1 quả táo.", "Có 5 hình quả táo nghĩa là có 5 quả táo.", "5 quả táo"),
        "probability": ("Phân biệt chắc chắn, có thể và không thể.", "Mặt trời mọc vào buổi sáng là chắc chắn; ngày mai có mưa là có thể; cá sống trên cây là không thể.", "Ngày mai có mưa là có thể.", "Có thể"),
    }
    objective, model, quick, answer = specs.get(k, ("Nhận biết kiến thức mới và vận dụng vào bài tập ngắn.", "Quan sát ví dụ mẫu rồi nêu cách làm.", "Hoàn thành một câu cùng dạng.", "Hoàn thành đúng"))
    return {
        "kind": k,
        "objective": objective,
        "model": model,
        "quick": quick,
        "answer": answer,
    }


# Hàm draw_scene_by_kind dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def draw_scene_by_kind(draw, name, k, card_index):
    if k == "number_line":
        draw_number_line(draw, 190, 350, 24 if card_index != 3 else 33, 30 if card_index != 3 else 37, 28 if card_index != 3 else 35, "Tìm số đứng ngay trước và ngay sau")
        if card_index != 3:
            label_box(draw, (265, 500, 440, 555), "27 liền trước", "#dcfce7", "#15803d", "#166534", 21)
            label_box(draw, (620, 500, 785, 555), "29 liền sau", "#fee2e2", "#dc2626", "#991b1b", 21)
    elif k == "dm":
        rounded(draw, (160, 330, 940, 410), "#fef3c7", "#a16207", 4, 8)
        for i in range(11):
            x = 190 + i * 70
            draw.line((x, 330, x, 390), fill="#78350f", width=3)
            draw_center(draw, (x, 438), str(i), font(20, True), "#78350f")
        draw.text((330, 245), "10 cm = 1 dm", font=font(56, True), fill="#1d4ed8")
    elif k in {"kg", "lit", "meter", "km", "day_hour", "hour_minute", "calendar"}:
        draw_measurement(draw, k, card_index)
    elif k in {"parts_add", "parts_sub", "parts_mul", "parts_div"}:
        draw_operation_parts(draw, k)
    elif k in {"add_20", "fact_add"}:
        draw_group_panel(draw, (135, 245, 455, 475), 8, "Có 8 quả")
        draw_group_panel(draw, (515, 245, 835, 475), 5, "Thêm 5 quả", color="#f0fdf4")
        draw.text((890, 330), "8 + 5 = 13", font=font(44, True), fill="#1d4ed8")
    elif k in {"sub_20", "fact_sub"}:
        draw_group_panel(draw, (140, 235, 570, 500), 13, "Có 13 quả")
        label_box(draw, (650, 285, 920, 345), "Bớt 5 quả", "#fee2e2", "#dc2626", "#991b1b", 26)
        draw.text((670, 390), "13 - 5 = 8", font=font(48, True), fill="#1d4ed8")
    elif k in {"add_100", "add_1000"}:
        if k == "add_1000":
            draw_base_ten(draw, 130, 250, 3, 2, 6, "326")
            draw_base_ten(draw, 130, 445, 1, 5, 2, "152")
            draw_vertical_add(draw, 805, 260, 326, 152, 478, "+")
        else:
            draw_base_ten(draw, 110, 280, 0, 3, 8, "38")
            draw_base_ten(draw, 560, 280, 0, 2, 7, "27")
            draw_vertical_add(draw, 865, 285, 38, 27, 65, "+")
    elif k in {"sub_100", "sub_1000"}:
        if k == "sub_1000":
            draw_base_ten(draw, 130, 250, 4, 7, 8, "478")
            draw_vertical_add(draw, 805, 260, 478, 152, 326, "-")
        else:
            draw_base_ten(draw, 130, 285, 0, 5, 2, "52")
            label_box(draw, (560, 290, 790, 355), "Bớt 28", "#fee2e2", "#dc2626", "#991b1b", 27)
            draw_vertical_add(draw, 850, 285, 52, 28, 24, "-")
    elif k in {"multiplication", "fact_mul2", "fact_mul5"}:
        each = 5 if k == "fact_mul5" else 2
        groups = 3 if card_index != 3 else 4
        for g in range(groups):
            draw_group_panel(draw, (120 + g * 225, 255, 300 + g * 225, 470), each, f"Nhóm {g + 1}", color="#f8fafc")
        draw.text((760, 510), f"{each} x {groups} = {each * groups}", font=font(48, True), fill="#15803d")
    elif k in {"division", "fact_div2", "fact_div5"}:
        parts = 5 if k == "fact_div5" else 2
        total = 20 if k == "fact_div5" else (8 if k == "fact_div2" else 6)
        each = total // parts
        draw_group_panel(draw, (120, 230, 530, 435), total if total <= 12 else 10, f"{total} đồ vật ban đầu", color="#fefce8")
        for p in range(parts):
            x1 = 620 + (p % 3) * 165
            y1 = 235 + (p // 3) * 150
            draw_group_panel(draw, (x1, y1, x1 + 135, y1 + 120), min(each, 5), f"Phần {p + 1}", color="#eff6ff")
        draw.text((720, 525), f"{total} : {parts} = {each}", font=font(48, True), fill="#1d4ed8")
    elif k in {"quadrilateral", "point_segment", "line_types", "polyline_length", "solid"}:
        draw_geometry(draw, k)
    elif k in {"place_value", "compare_3digit"}:
        if k == "compare_3digit":
            draw_base_ten(draw, 120, 250, 3, 4, 5, "345")
            draw_base_ten(draw, 620, 250, 4, 1, 2, "412")
            draw.text((500, 405), "<", font=font(72, True), fill="#dc2626")
        else:
            draw_base_ten(draw, 130, 270, 3, 2, 6, "Số 326")
            draw.text((700, 275), "3 trăm", font=font(36, True), fill="#1d4ed8")
            draw.text((700, 335), "2 chục", font=font(36, True), fill="#a16207")
            draw.text((700, 395), "6 đơn vị", font=font(36, True), fill="#15803d")
    elif k in {"tally", "pictograph"}:
        draw_data(draw, k)
    elif k == "probability":
        draw_probability(draw)
    else:
        draw_wrapped(draw, "Quan sát tranh, đọc ví dụ và làm thử.", (160, 280), font(40, True), width=35)


# Hàm draw_measurement dùng để tính toán kết quả từ các tham số đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def draw_measurement(draw, k, card_index):
    if k == "kg":
        draw_person(draw, 140, 270, "Nam")
        rounded(draw, (350, 300, 535, 475), "#fef3c7", "#a16207", 4, 25)
        draw.text((395, 355), "5 kg", font=font(42, True), fill="#92400e")
        rounded(draw, (670, 330, 815, 475), "#e0f2fe", "#0369a1", 4, 25)
        draw.text((700, 375), "2 kg", font=font(38, True), fill="#075985")
        draw.text((865, 375), "5 kg nặng hơn", font=font(34, True), fill="#0f172a")
    elif k == "lit":
        rounded(draw, (250, 235, 430, 515), "#dbeafe", "#1d4ed8", 4, 22)
        draw.rectangle((275, 355, 405, 490), fill="#60a5fa")
        draw.text((295, 280), "3 l", font=font(44, True), fill="#1d4ed8")
        rounded(draw, (610, 300, 745, 515), "#fef3c7", "#a16207", 4, 22)
        draw.rectangle((630, 420, 725, 492), fill="#facc15")
        draw.text((650, 335), "1 l", font=font(40, True), fill="#92400e")
        draw.text((815, 395), "3 l nhiều hơn 1 l", font=font(32, True), fill="#0f172a")
    elif k == "meter":
        rounded(draw, (180, 360, 920, 430), "#fef3c7", "#a16207", 4, 8)
        draw.text((360, 280), "1 m = 100 cm", font=font(56, True), fill="#1d4ed8")
        draw.line((200, 445, 900, 445), fill="#dc2626", width=5)
    elif k == "km":
        draw.line((160, 465, 1020, 465), fill="#64748b", width=18)
        rounded(draw, (170, 300, 330, 415), "#dbeafe", "#1d4ed8", 4, 16)
        draw.text((202, 330), "Nhà", font=font(34, True), fill="#1d4ed8")
        rounded(draw, (810, 285, 1030, 420), "#dcfce7", "#15803d", 4, 16)
        draw.text((845, 330), "Trường", font=font(34, True), fill="#166534")
        draw.text((470, 385), "3 km", font=font(50, True), fill="#dc2626")
    elif k in {"day_hour", "hour_minute"}:
        draw.ellipse((260, 210, 560, 510), fill="#ffffff", outline="#1e3a8a", width=7)
        for h in range(1, 13):
            angle = math.radians(h * 30 - 90)
            draw_center(draw, (410 + math.cos(angle) * 118, 360 + math.sin(angle) * 118), str(h), font(18, True), "#0f172a")
        draw.line((410, 360, 410, 250), fill="#2563eb", width=7)
        draw.line((410, 360, 495, 360), fill="#ef4444", width=9)
        text = "1 giờ = 60 phút" if k == "hour_minute" else "Một ngày có 24 giờ"
        draw.text((650, 330), text, font=font(46, True), fill="#1d4ed8")
    else:
        rounded(draw, (245, 215, 805, 520), "#ffffff", "#1d4ed8", 5, 20)
        draw.rectangle((245, 215, 805, 285), fill="#bfdbfe", outline="#1d4ed8", width=5)
        draw.text((395, 235), "THÁNG 1", font=font(38, True), fill="#1e3a8a")
        day = 1
        for r in range(5):
            for c in range(7):
                if day <= 31:
                    x = 275 + c * 72
                    y = 310 + r * 38
                    draw.text((x, y), str(day), font=font(24, True), fill="#0f172a")
                    day += 1
        draw.text((850, 345), "31 ngày", font=font(48, True), fill="#dc2626")


# Hàm draw_operation_parts dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def draw_operation_parts(draw, k):
    if k == "parts_add":
        equation, labels = "8 + 5 = 13", [("8", "số hạng"), ("5", "số hạng"), ("13", "tổng")]
    elif k == "parts_sub":
        equation, labels = "15 - 7 = 8", [("15", "số bị trừ"), ("7", "số trừ"), ("8", "hiệu")]
    elif k == "parts_mul":
        equation, labels = "2 x 5 = 10", [("2", "thừa số"), ("5", "thừa số"), ("10", "tích")]
    else:
        equation, labels = "10 : 2 = 5", [("10", "số bị chia"), ("2", "số chia"), ("5", "thương")]
    draw.text((350, 245), equation, font=font(70, True), fill="#0f172a")
    x = 175
    colors = ["#dcfce7", "#fef3c7", "#dbeafe"]
    for i, (num, label) in enumerate(labels):
        label_box(draw, (x + i * 315, 405, x + i * 315 + 250, 485), f"{num}: {label}", colors[i], "#334155", "#0f172a", 24)


# Hàm draw_geometry dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def draw_geometry(draw, k):
    if k == "quadrilateral":
        draw.polygon([(210, 260), (500, 220), (590, 430), (280, 500)], fill="#bfdbfe", outline="#1d4ed8")
        for p in [(210, 260), (500, 220), (590, 430), (280, 500)]:
            draw.ellipse((p[0] - 8, p[1] - 8, p[0] + 8, p[1] + 8), fill="#dc2626")
        draw.text((690, 330), "4 cạnh", font=font(58, True), fill="#1d4ed8")
    elif k == "point_segment":
        draw.ellipse((240, 340, 270, 370), fill="#dc2626")
        draw.ellipse((820, 340, 850, 370), fill="#dc2626")
        draw.line((255, 355, 835, 355), fill="#1d4ed8", width=7)
        draw.text((232, 385), "A", font=font(36, True), fill="#0f172a")
        draw.text((820, 385), "B", font=font(36, True), fill="#0f172a")
        draw.text((420, 420), "Đoạn thẳng AB", font=font(38, True), fill="#1d4ed8")
    elif k == "line_types":
        draw.line((160, 260, 540, 260), fill="#1d4ed8", width=7)
        draw.text((230, 285), "Đường thẳng", font=font(25, True), fill="#1d4ed8")
        draw.arc((145, 345, 545, 500), 180, 360, fill="#dc2626", width=7)
        draw.text((250, 510), "Đường cong", font=font(25, True), fill="#dc2626")
        pts = [(670, 250), (775, 340), (880, 285), (1010, 405)]
        for a, b in zip(pts, pts[1:]):
            draw.line((a[0], a[1], b[0], b[1]), fill="#15803d", width=7)
        draw.text((750, 430), "Đường gấp khúc", font=font(25, True), fill="#15803d")
    elif k == "polyline_length":
        pts = [(220, 395), (420, 285), (660, 410)]
        draw.line((pts[0], pts[1]), fill="#1d4ed8", width=8)
        draw.line((pts[1], pts[2]), fill="#1d4ed8", width=8)
        for p in pts:
            draw.ellipse((p[0] - 9, p[1] - 9, p[0] + 9, p[1] + 9), fill="#dc2626")
        draw.text((290, 300), "3 cm", font=font(30, True), fill="#0f172a")
        draw.text((520, 335), "4 cm", font=font(30, True), fill="#0f172a")
        draw.text((750, 345), "3 + 4 = 7 cm", font=font(42, True), fill="#1d4ed8")
    else:
        rounded(draw, (190, 260, 390, 500), "#93c5fd", "#1d4ed8", 5, 18)
        draw.ellipse((190, 235, 390, 300), fill="#bfdbfe", outline="#1d4ed8", width=5)
        draw.text((205, 520), "Khối trụ", font=font(32, True), fill="#1d4ed8")
        draw.ellipse((650, 245, 930, 525), fill="#fca5a5", outline="#b91c1c", width=5)
        draw.text((700, 520), "Khối cầu", font=font(32, True), fill="#b91c1c")


# Hàm draw_data dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def draw_data(draw, k):
    if k == "tally":
        draw.text((180, 235), "Môn thể thao yêu thích", font=font(36, True), fill="#0f172a")
        rows = [("Bóng đá", 5), ("Cầu lông", 3), ("Bơi", 4)]
        for i, (label, count) in enumerate(rows):
            y = 310 + i * 80
            draw.text((220, y), label, font=font(28, True), fill="#0f172a")
            for j in range(count):
                x = 470 + j * 32
                draw.line((x, y, x, y + 45), fill="#1d4ed8", width=5)
            draw.text((720, y), f"{count} bạn", font=font(28, True), fill="#1d4ed8")
    else:
        fruits = [("Táo", 5, "#ef4444"), ("Cam", 3, "#f97316"), ("Chuối", 4, "#eab308")]
        for i, (label, count, color) in enumerate(fruits):
            y = 260 + i * 90
            draw.text((170, y), label, font=font(30, True), fill="#0f172a")
            for j in range(count):
                draw.ellipse((340 + j * 58, y - 4, 382 + j * 58, y + 38), fill=color, outline="#334155", width=2)
            draw.text((830, y), f"{count}", font=font(30, True), fill="#1d4ed8")


# Hàm draw_probability dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def draw_probability(draw):
    panels = [
        ("Chắc chắn", "Mặt trời mọc", "#dcfce7", "#15803d"),
        ("Có thể", "Ngày mai có mưa", "#fef3c7", "#ca8a04"),
        ("Không thể", "Cá sống trên cây", "#fee2e2", "#dc2626"),
    ]
    for i, (title, text, fill, outline) in enumerate(panels):
        x = 130 + i * 340
        rounded(draw, (x, 245, x + 280, 500), fill, outline, 4, 24)
        draw.text((x + 35, 270), title, font=font(30, True), fill=outline)
        if i == 0:
            draw.ellipse((x + 95, 335, x + 185, 425), fill="#facc15", outline="#a16207", width=4)
        elif i == 1:
            draw.rectangle((x + 95, 355, x + 185, 420), fill="#bfdbfe", outline="#1d4ed8", width=4)
            for r in range(4):
                draw.line((x + 105 + r * 20, 435, x + 95 + r * 20, 465), fill="#1d4ed8", width=3)
        else:
            draw.ellipse((x + 90, 360, x + 190, 420), fill="#60a5fa", outline="#1d4ed8", width=4)
            draw.polygon([(x + 90, 390), (x + 50, 360), (x + 50, 420)], fill="#60a5fa", outline="#1d4ed8")
            draw.line((x + 75, 330, x + 215, 455), fill="#dc2626", width=8)
        draw_wrapped(draw, text, (x + 30, 510), font(22, True), fill="#0f172a", width=18)


# Hàm render_card_image dùng để chuẩn bị và hiển thị kết quả cho người dùng; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def render_card_image(chapter_index, lesson_index, card_index, lesson_name, card):
    IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    img = Image.new("RGB", (1200, 675), "#f1f5f9")
    draw = ImageDraw.Draw(img)
    header(draw, lesson_name, card["title"])
    draw_scene_by_kind(draw, lesson_name, card["kind"], card_index)
    rounded(draw, (78, 560, 1122, 618), "#f8fafc", "#e2e8f0", 2, 18)
    draw_wrapped(draw, card["caption"], (105, 575), font(22, True), fill="#0f172a", width=84, spacing=4)
    out = IMAGE_DIR / f"grade2-c{chapter_index:02d}-l{lesson_index:02d}-card{card_index:02d}.png"
    img.save(out)
    return out


# Hàm build_cards dùng để xây dựng kết quả từ các nguồn dữ liệu và quy tắc liên quan; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def build_cards(lesson_name):
    spec = lesson_spec(lesson_name)
    k = spec["kind"]
    return [
        {
            "type": "concept_scene",
            "title": "Quan sát",
            "kind": k,
            "display_text": f"Quan sát tình huống minh họa cho bài: {lesson_name}.",
            "caption": spec["objective"],
            "student_task": "Nêu dữ kiện nhìn thấy trong tranh và gọi tên kiến thức chính.",
            "interaction": "choose_or_say",
            "expected_answer": spec["objective"],
            "wrong_hint": "Cho học sinh chỉ trực tiếp vào vật, số, nhãn hoặc nhóm đồ vật trong tranh trước khi trả lời.",
        },
        {
            "type": "worked_model",
            "title": "Làm mẫu",
            "kind": k,
            "display_text": spec["model"],
            "caption": spec["model"],
            "student_task": "Đọc ví dụ mẫu và nhắc lại bước làm chính.",
            "interaction": "none",
            "expected_answer": spec["model"],
            "wrong_hint": "Tách câu mẫu thành từng bước nhỏ, sau đó đối chiếu lại với hình minh họa.",
        },
        {
            "type": "quick_try",
            "title": "Thử nhanh",
            "kind": k,
            "display_text": spec["quick"],
            "caption": f"Đáp án cần đạt: {spec['answer']}",
            "student_task": "Tự làm một câu ngắn cùng dạng với ví dụ mẫu.",
            "interaction": "fill_blank",
            "expected_answer": spec["answer"],
            "wrong_hint": "Quay lại thẻ làm mẫu, thay số hoặc đối tượng mới rồi làm lại theo đúng thứ tự.",
        },
    ]


# Hàm build_blueprint dùng để xây dựng kết quả từ các nguồn dữ liệu và quy tắc liên quan; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def build_blueprint():
    chapters = []
    for chapter in CHAPTERS:
        lessons = []
        for name in chapter["lessons"]:
            spec = lesson_spec(name)
            lessons.append(
                {
                    "lesson": name,
                    "kind": spec["kind"],
                    "objective": spec["objective"],
                    "cards": build_cards(name),
                }
            )
        chapters.append({"title": chapter["title"], "lessons": lessons})
    return {
        "grade": 2,
        "source_textbook": "SGK Toán 2 Cánh Diều",
        "version_note": "Bản chi tiết: mỗi bài có 3 tranh minh họa riêng cho quan sát, làm mẫu và thử nhanh.",
        "cognitive_profile": {
            "reading_level": "Học sinh lớp 2 đã đọc được câu ngắn, nhưng hình ảnh vẫn phải rõ đối tượng, rõ số lượng, rõ nhãn và rõ bước làm.",
            "learning_style": "Quan sát tình huống thật gần gũi, đối chiếu với mô hình toán, sau đó làm thử một câu ngắn.",
            "ai_policy": "Không dùng Chat AI tự do cho lớp 2; chỉ nên dùng gợi ý cố định hoặc gợi ý từng bước khi làm sai.",
        },
        "chapters": chapters,
    }


# Hàm set_run_font dùng để cập nhật trạng thái hoặc dữ liệu theo quy tắc nghiệp vụ; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def set_run_font(run, size=10.5, bold=False, italic=False, color=None):
    run.font.name = "Arial"
    run._element.rPr.rFonts.set(qn("w:eastAsia"), "Arial")
    run.font.size = Pt(size)
    run.bold = bold
    run.italic = italic
    if color:
        run.font.color.rgb = RGBColor.from_string(color)


# Hàm set_defaults dùng để cập nhật trạng thái hoặc dữ liệu theo quy tắc nghiệp vụ; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def set_defaults(doc):
    section = doc.sections[0]
    section.top_margin = Inches(0.62)
    section.bottom_margin = Inches(0.62)
    section.left_margin = Inches(0.68)
    section.right_margin = Inches(0.68)
    normal = doc.styles["Normal"]
    normal.font.name = "Arial"
    normal._element.rPr.rFonts.set(qn("w:eastAsia"), "Arial")
    normal.font.size = Pt(10.5)
    for style_name, size, color in [
        ("Title", 22, "1F4E79"),
        ("Heading 1", 16, "1F4E79"),
        ("Heading 2", 13, "2F5597"),
        ("Heading 3", 11, "1F1F1F"),
    ]:
        style = doc.styles[style_name]
        style.font.name = "Arial"
        style._element.rPr.rFonts.set(qn("w:eastAsia"), "Arial")
        style.font.size = Pt(size)
        style.font.color.rgb = RGBColor.from_string(color)
        style.font.bold = True


# Hàm add_meta dùng để tạo bản ghi hoặc tài nguyên mới sau khi kiểm tra đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def add_meta(doc, label, value):
    p = doc.add_paragraph()
    r = p.add_run(f"{label}: ")
    set_run_font(r, bold=True)
    r = p.add_run(str(value))
    set_run_font(r)


# Hàm add_bullets dùng để tạo bản ghi hoặc tài nguyên mới sau khi kiểm tra đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def add_bullets(doc, items):
    for item in items:
        p = doc.add_paragraph(style="List Bullet")
        r = p.add_run(str(item))
        set_run_font(r)


# Hàm set_cell_text dùng để cập nhật trạng thái hoặc dữ liệu theo quy tắc nghiệp vụ; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def set_cell_text(cell, text, bold=False):
    cell.text = ""
    r = cell.paragraphs[0].add_run(str(text))
    set_run_font(r, size=9, bold=bold)


# Hàm shade dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def shade(cell, fill):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:fill"), fill)
    tc_pr.append(shd)


# Hàm add_overview dùng để tạo bản ghi hoặc tài nguyên mới sau khi kiểm tra đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def add_overview(doc, data):
    table = doc.add_table(rows=1, cols=5)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.style = "Table Grid"
    headers = ["STT", "Chương", "Số bài", "Số thẻ", "Số ảnh"]
    for i, h in enumerate(headers):
        set_cell_text(table.rows[0].cells[i], h, True)
        shade(table.rows[0].cells[i], "D9EAF7")
    for i, chapter in enumerate(data["chapters"], 1):
        row = table.add_row().cells
        card_count = sum(len(lesson["cards"]) for lesson in chapter["lessons"])
        values = [i, chapter["title"], len(chapter["lessons"]), card_count, card_count]
        for j, value in enumerate(values):
            set_cell_text(row[j], value)
            row[j].vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.TOP


# Hàm build_docx dùng để xây dựng kết quả từ các nguồn dữ liệu và quy tắc liên quan; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def build_docx(data):
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    doc = Document()
    set_defaults(doc)

    title = doc.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = title.add_run("LÝ THUYẾT TOÁN LỚP 2")
    set_run_font(r, size=24, bold=True, color="1F4E79")
    subtitle = doc.add_paragraph()
    subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = subtitle.add_run("Bản chi tiết theo thẻ, có tranh tình huống, đáp án và gợi ý sai - Codex")
    set_run_font(r, size=13, italic=True)

    add_meta(doc, "Nguồn tham khảo", data["source_textbook"])
    add_meta(doc, "Ghi chú phiên bản", data["version_note"])
    doc.add_heading("Định hướng thiết kế lớp 2", level=1)
    add_bullets(
        doc,
        [
            data["cognitive_profile"]["reading_level"],
            data["cognitive_profile"]["learning_style"],
            data["cognitive_profile"]["ai_policy"],
            "Mỗi bài có 3 tranh: tranh tình huống để nhận biết, tranh làm mẫu để hiểu cách làm, tranh thử nhanh để kiểm tra đáp án.",
        ],
    )
    doc.add_heading("Tổng quan nội dung", level=1)
    add_overview(doc, data)

    for chapter_index, chapter in enumerate(data["chapters"], 1):
        doc.add_page_break()
        doc.add_heading(f"Chương {chapter_index}: {chapter['title']}", level=1)
        for lesson_index, lesson in enumerate(chapter["lessons"], 1):
            doc.add_heading(f"{chapter_index}.{lesson_index}. {lesson['lesson']}", level=2)
            add_meta(doc, "Mục tiêu bài học", lesson["objective"])
            for card_index, card in enumerate(lesson["cards"], 1):
                image_path = render_card_image(chapter_index, lesson_index, card_index, lesson["lesson"], card)
                doc.add_heading(f"Thẻ {card_index}: {card['title']}", level=3)
                p = doc.add_paragraph()
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                p.add_run().add_picture(str(image_path), width=Inches(6.45))
                add_bullets(
                    doc,
                    [
                        f"Nội dung hiển thị: {card['display_text']}",
                        f"Nhiệm vụ học sinh: {card['student_task']}",
                        f"Tương tác đề xuất: {card['interaction']}",
                        f"Đáp án/Kết quả mong đợi: {card['expected_answer']}",
                        f"Gợi ý khi học sinh sai: {card['wrong_hint']}",
                    ],
                )
            doc.add_paragraph()

    try:
        doc.save(OUTPUT_PATH)
        return OUTPUT_PATH
    except PermissionError:
        doc.save(FALLBACK_OUTPUT_PATH)
        return FALLBACK_OUTPUT_PATH


# Hàm build_contact_sheet dùng để xây dựng kết quả từ các nguồn dữ liệu và quy tắc liên quan; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def build_contact_sheet(image_paths):
    thumbs = []
    for path in image_paths[:60]:
        img = Image.open(path).resize((240, 135))
        thumbs.append((path, img))
    cols = 5
    rows = math.ceil(len(thumbs) / cols)
    sheet = Image.new("RGB", (cols * 240, rows * 170), "#ffffff")
    d = ImageDraw.Draw(sheet)
    for i, (path, img) in enumerate(thumbs):
        x = (i % cols) * 240
        y = (i // cols) * 170
        sheet.paste(img, (x, y))
        d.text((x + 6, y + 140), path.stem.replace("grade2-", ""), font=font(16, True), fill="#0f172a")
    out = IMAGE_DIR / "contact-sheet-first-60.png"
    sheet.save(out)
    return out


# Hàm main dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def main():
    data = build_blueprint()
    BLUEPRINT_PATH.parent.mkdir(parents=True, exist_ok=True)
    BLUEPRINT_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    output = build_docx(data)
    image_paths = sorted(IMAGE_DIR.glob("grade2-*.png"))
    sheet = build_contact_sheet(image_paths)
    print(BLUEPRINT_PATH)
    print(output)
    print(sheet)
    print(f"lessons={sum(len(c['lessons']) for c in data['chapters'])}")
    print(f"cards={sum(len(l['cards']) for c in data['chapters'] for l in c['lessons'])}")
    print(f"images={len(image_paths)}")


# Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
if __name__ == "__main__":
    main()
