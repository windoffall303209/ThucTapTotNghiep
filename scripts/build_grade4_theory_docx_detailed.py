# Script build grade4 theory docx detailed hỗ trợ nhập, xuất, kiểm tra hoặc bảo trì dữ liệu và cấu hình của dự án.
import json
import math
import sys
from pathlib import Path

from docx import Document
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import build_grade2_theory_docx_detailed as base  # noqa: E402
import build_grade3_theory_docx_detailed as g3  # noqa: E402


OUTPUT_DIR = ROOT / "output" / "doc"
IMAGE_DIR = OUTPUT_DIR / "grade4_theory_images_detailed"
BLUEPRINT_PATH = ROOT / "content-theory" / "grade-4-theory-blueprint-detailed.json"
OUTPUT_PATH = OUTPUT_DIR / "ly-thuyet-lop-4-codex-chi-tiet.docx"
FALLBACK_OUTPUT_PATH = OUTPUT_DIR / "ly-thuyet-lop-4-codex-chi-tiet-fixed.docx"


CHAPTERS = [
    {
        "title": "Số tự nhiên",
        "lessons": [
            "Các số trong phạm vi 1 000 000",
            "Các số trong phạm vi 1 000 000 (tiếp theo)",
            "Các số có nhiều chữ số",
            "Các số có nhiều chữ số (tiếp theo)",
            "So sánh các số có nhiều chữ số",
            "Làm tròn số đến hàng trăm nghìn",
            "Số tự nhiên. Dãy số tự nhiên",
            "Viết số tự nhiên trong hệ thập phân",
            "Yến, tạ, tấn",
            "Giây",
            "Thế kỉ",
            "Bài toán liên quan đến rút về đơn vị",
            "Góc nhọn, góc tù, góc bẹt",
            "Đơn vị đo góc. Độ",
            "Hai đường thẳng vuông góc. Vẽ hai đường thẳng vuông góc",
            "Hai đường thẳng song song. Vẽ hai đường thẳng song song",
        ],
    },
    {
        "title": "Các phép tính với số tự nhiên",
        "lessons": [
            "Phép cộng, phép trừ",
            "Các tính chất của phép cộng",
            "Tìm số trung bình cộng",
            "Tìm hai số khi biết tổng và hiệu của hai số đó",
            "Nhân với số có một chữ số",
            "Nhân với số có hai chữ số",
            "Các tính chất của phép nhân",
            "Nhân với 10, 100, 1 000",
            "Chia cho số có một chữ số",
            "Chia cho 10, 100, 1 000",
            "Chia cho số có hai chữ số",
            "Chia cho số có hai chữ số (tiếp theo)",
            "Thương có chữ số 0",
            "Ước lượng tính",
            "Biểu thức có chứa chữ",
        ],
    },
    {
        "title": "Phân số",
        "lessons": [
            "Khái niệm phân số",
            "Khái niệm phân số (tiếp theo)",
            "Phân số và phép chia số tự nhiên",
            "Phân số bằng nhau",
            "Tính chất cơ bản của phân số",
            "Rút gọn phân số",
            "Quy đồng mẫu số các phân số",
            "So sánh hai phân số cùng mẫu số",
            "So sánh hai phân số khác mẫu số",
            "Hình bình hành",
            "Hình thoi",
            "Mét vuông",
            "Đề-xi-mét vuông",
            "Mi-li-mét vuông",
        ],
    },
    {
        "title": "Các phép tính với phân số",
        "lessons": [
            "Cộng các phân số cùng mẫu số",
            "Trừ các phân số cùng mẫu số",
            "Cộng các phân số khác mẫu số",
            "Trừ hai phân số khác mẫu số",
            "Phép nhân phân số",
            "Tìm phân số của một số",
            "Phép chia phân số",
            "Dãy số liệu thống kê",
            "Biểu đồ cột",
            "Kiểm đếm số lần xuất hiện của một sự kiện",
        ],
    },
]


# Hàm ntext dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def ntext(text):
    return base.norm(text)


# Hàm clean_title dùng để chuẩn hóa và làm sạch dữ liệu đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def clean_title(name):
    return name.replace("1 000", "1000")


# Hàm lesson_kind dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def lesson_kind(name):
    n = ntext(name)
    if "so sanh" in n and "phan so" in n and "khac mau" in n:
        return "compare_frac_diff"
    if "so sanh" in n and "phan so" in n:
        return "compare_frac_same"
    if "cong cac phan so khac" in n:
        return "frac_add_diff"
    if "tru hai phan so khac" in n:
        return "frac_sub_diff"
    if "cong cac phan so cung" in n:
        return "frac_add_same"
    if "tru cac phan so cung" in n:
        return "frac_sub_same"
    if "phep nhan phan so" in n:
        return "frac_mul"
    if "phep chia phan so" in n:
        return "frac_div"
    if "phan so cua mot so" in n:
        return "fraction_of_number"
    if "rut gon" in n:
        return "simplify_fraction"
    if "quy dong" in n:
        return "common_denominator"
    if "tinh chat co ban" in n:
        return "fraction_property"
    if "phan so bang nhau" in n:
        return "equivalent_fraction"
    if "phan so va phep chia" in n:
        return "fraction_division"
    if "khai niem phan so" in n:
        return "fraction_concept"
    if "hinh binh hanh" in n:
        return "parallelogram"
    if "hinh thoi" in n:
        return "rhombus"
    if "de-xi-met vuong" in n:
        return "dm2"
    if "mi-li-met vuong" in n:
        return "mm2"
    if "met vuong" in n:
        return "m2"
    if "bieu do cot" in n:
        return "bar_chart"
    if "day so lieu" in n:
        return "data_sequence"
    if "kiem dem" in n:
        return "event_tally"
    if "so sanh cac so" in n:
        return "compare_large"
    if "lam tron" in n:
        return "rounding"
    if "day so tu nhien" in n:
        return "natural_sequence"
    if "he thap phan" in n:
        return "decimal_system"
    if "1 000 000" in n or "nhieu chu so" in n:
        return "large_number"
    if "yen" in n or "ta" in n or "tan" in n:
        return "mass"
    if n == "giay":
        return "second"
    if "the ki" in n:
        return "century"
    if "rut ve don vi" in n:
        return "unit_rate"
    if "goc nhon" in n:
        return "angle_types"
    if "don vi do goc" in n:
        return "degree"
    if "vuong goc" in n:
        return "perpendicular"
    if "song song" in n:
        return "parallel"
    if "tinh chat cua phep cong" in n:
        return "add_properties"
    if "trung binh cong" in n:
        return "average"
    if "tong va hieu" in n:
        return "sum_diff"
    if "tinh chat cua phep nhan" in n:
        return "mul_properties"
    if "nhan voi 10" in n:
        return "mul_10"
    if "chia cho 10" in n:
        return "div_10"
    if "nhan voi so co hai" in n:
        return "mul_two_digit"
    if "nhan voi so co mot" in n:
        return "mul_one_digit"
    if "thuong co chu so 0" in n:
        return "zero_quotient"
    if "chia cho so co hai" in n:
        return "div_two_digit"
    if "chia cho so co mot" in n:
        return "div_one_digit"
    if "uoc luong" in n:
        return "estimate"
    if "bieu thuc co chua chu" in n:
        return "variable_expression"
    if "phep cong" in n or "phep tru" in n:
        return "add_sub"
    return "large_number"


# Hàm lesson_spec dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def lesson_spec(name):
    k = lesson_kind(name)
    specs = {
        "large_number": ("Đọc, viết và phân tích số tự nhiên có nhiều chữ số.", "523 416 gồm 5 trăm nghìn, 2 chục nghìn, 3 nghìn, 4 trăm, 1 chục, 6 đơn vị.", "708 305 gồm 7 trăm nghìn, 0 chục nghìn, 8 nghìn, 3 trăm, 0 chục, 5 đơn vị.", "708 305"),
        "compare_large": ("So sánh các số có nhiều chữ số theo từng hàng từ trái sang phải.", "523 416 > 498 905 vì 5 trăm nghìn lớn hơn 4 trăm nghìn.", "708 305 > 699 999.", ">"),
        "rounding": ("Làm tròn số đến hàng trăm nghìn.", "523 416 làm tròn đến hàng trăm nghìn là 500 000.", "756 120 làm tròn đến hàng trăm nghìn là 800 000.", "800 000"),
        "natural_sequence": ("Nhận biết dãy số tự nhiên bắt đầu từ 0 và mỗi số hơn số trước 1 đơn vị.", "0, 1, 2, 3, 4, ... là dãy số tự nhiên.", "Số liền sau của 999 999 là 1 000 000.", "1 000 000"),
        "decimal_system": ("Hiểu mỗi chữ số trong hệ thập phân có giá trị theo hàng.", "Trong 523 416, chữ số 2 có giá trị 20 000.", "Trong 708 305, chữ số 8 có giá trị 8 000.", "8 000"),
        "mass": ("Nhận biết yến, tạ, tấn và đổi đơn vị khối lượng.", "1 yến = 10 kg, 1 tạ = 100 kg, 1 tấn = 1000 kg.", "3 tạ = 300 kg.", "300 kg"),
        "second": ("Nhận biết giây là đơn vị đo thời gian nhỏ hơn phút.", "1 phút = 60 giây.", "3 phút = 180 giây.", "180 giây"),
        "century": ("Nhận biết thế kỉ là khoảng thời gian 100 năm.", "Thế kỉ XXI là từ năm 2001 đến năm 2100.", "Năm 2026 thuộc thế kỉ XXI.", "Thế kỉ XXI"),
        "unit_rate": ("Giải bài toán rút về đơn vị bằng cách tìm giá trị của 1 phần trước.", "Mua 4 quyển vở hết 24 000 đồng, 1 quyển hết 6 000 đồng.", "6 quyển hết 48 000 đồng thì 1 quyển hết 8 000 đồng.", "8 000 đồng"),
        "angle_types": ("Phân biệt góc nhọn, góc tù và góc bẹt.", "Góc nhọn bé hơn góc vuông, góc tù lớn hơn góc vuông, góc bẹt bằng hai góc vuông.", "Góc 120 độ là góc tù.", "Góc tù"),
        "degree": ("Nhận biết độ là đơn vị đo góc và đọc số đo góc.", "Góc vuông có số đo 90 độ.", "Góc bẹt có số đo 180 độ.", "180 độ"),
        "perpendicular": ("Nhận biết hai đường thẳng vuông góc khi chúng cắt nhau tạo góc vuông.", "Hai đường thẳng cắt nhau tạo góc 90 độ là vuông góc.", "Hai cạnh kề của hình chữ nhật vuông góc.", "Vuông góc"),
        "parallel": ("Nhận biết hai đường thẳng song song không cắt nhau.", "Hai đường thẳng song song luôn cách đều nhau và không cắt nhau.", "Hai cạnh đối của hình chữ nhật song song.", "Song song"),
        "add_sub": ("Cộng, trừ số tự nhiên theo từng hàng.", "523 416 + 142 305 = 665 721; 665 721 - 142 305 = 523 416.", "708 305 - 120 104 = 588 201.", "588 201"),
        "add_properties": ("Vận dụng tính chất giao hoán và kết hợp của phép cộng.", "35 + 28 + 65 = (35 + 65) + 28 = 128.", "125 + 37 + 75 = 237.", "237"),
        "average": ("Tìm số trung bình cộng bằng cách lấy tổng chia cho số các số hạng.", "Trung bình cộng của 8, 10, 12 là (8 + 10 + 12) : 3 = 10.", "Trung bình cộng của 15, 20, 25 là 20.", "20"),
        "sum_diff": ("Tìm hai số khi biết tổng và hiệu.", "Tổng 30, hiệu 6: số lớn = (30 + 6) : 2 = 18, số bé = 12.", "Tổng 50, hiệu 10 thì số lớn là 30, số bé là 20.", "30 và 20"),
        "mul_one_digit": ("Nhân số tự nhiên với số có một chữ số theo từng hàng.", "12 324 x 3 = 36 972.", "21 203 x 4 = 84 812.", "84 812"),
        "mul_two_digit": ("Nhân với số có hai chữ số bằng cách nhân từng lượt rồi cộng các tích riêng.", "234 x 12 = 234 x 10 + 234 x 2 = 2 808.", "125 x 24 = 3 000.", "3 000"),
        "mul_properties": ("Vận dụng tính chất giao hoán, kết hợp và phân phối của phép nhân.", "25 x 12 x 4 = (25 x 4) x 12 = 1 200.", "5 x 37 x 2 = 370.", "370"),
        "mul_10": ("Nhân với 10, 100, 1000 bằng cách thêm chữ số 0 thích hợp vào bên phải.", "234 x 100 = 23 400.", "58 x 1000 = 58 000.", "58 000"),
        "div_one_digit": ("Chia số tự nhiên cho số có một chữ số theo từng bước.", "36 972 : 3 = 12 324.", "84 812 : 4 = 21 203.", "21 203"),
        "div_10": ("Chia số tròn chục, tròn trăm, tròn nghìn cho 10, 100, 1000.", "23 400 : 100 = 234.", "58 000 : 1000 = 58.", "58"),
        "div_two_digit": ("Chia cho số có hai chữ số bằng cách ước lượng thương từng lượt.", "2 808 : 12 = 234.", "3 000 : 24 = 125.", "125"),
        "zero_quotient": ("Nhận biết và xử lí chữ số 0 ở thương khi chia.", "6 042 : 3 = 2 014, thương có chữ số 0 ở hàng chục.", "8 040 : 4 = 2 010.", "2 010"),
        "estimate": ("Ước lượng kết quả trước khi tính để kiểm tra độ hợp lí.", "498 + 203 xấp xỉ 500 + 200 = 700.", "3 980 : 4 xấp xỉ 4 000 : 4 = 1 000.", "1 000"),
        "variable_expression": ("Nhận biết biểu thức có chứa chữ và tính giá trị khi biết chữ.", "Với a = 5, biểu thức a + 12 có giá trị 17.", "Với b = 8, 3 x b = 24.", "24"),
        "fraction_concept": ("Nhận biết phân số gồm tử số và mẫu số.", "Tô 3 trong 4 phần bằng nhau là phân số 3/4.", "Tô 2 trong 5 phần bằng nhau là 2/5.", "2/5"),
        "fraction_division": ("Hiểu phân số có thể biểu thị phép chia số tự nhiên.", "3 : 4 = 3/4.", "5 : 8 = 5/8.", "5/8"),
        "equivalent_fraction": ("Nhận biết các phân số bằng nhau qua hình hoặc phép nhân/chia cả tử và mẫu.", "1/2 = 2/4.", "2/3 = 4/6.", "4/6"),
        "fraction_property": ("Vận dụng tính chất cơ bản của phân số.", "Nhân cả tử và mẫu của 2/3 với 2 được 4/6.", "3/5 = 6/10.", "6/10"),
        "simplify_fraction": ("Rút gọn phân số bằng cách chia cả tử và mẫu cho cùng một số khác 0.", "6/8 = 3/4.", "10/15 = 2/3.", "2/3"),
        "common_denominator": ("Quy đồng mẫu số để đưa các phân số về cùng mẫu.", "1/2 = 3/6 và 1/3 = 2/6.", "1/4 = 2/8 và 3/8 giữ nguyên.", "2/8 và 3/8"),
        "compare_frac_same": ("So sánh hai phân số cùng mẫu bằng cách so sánh tử số.", "3/7 < 5/7 vì 3 < 5.", "6/9 > 4/9.", ">"),
        "compare_frac_diff": ("So sánh hai phân số khác mẫu bằng cách quy đồng mẫu số.", "1/2 = 3/6, 2/3 = 4/6 nên 1/2 < 2/3.", "3/4 > 2/3.", ">"),
        "parallelogram": ("Nhận biết hình bình hành có hai cặp cạnh đối song song.", "Hình bình hành có các cạnh đối song song và bằng nhau.", "Cặp cạnh đối của hình bình hành song song.", "Song song"),
        "rhombus": ("Nhận biết hình thoi có bốn cạnh bằng nhau.", "Hình thoi có 4 cạnh bằng nhau.", "Hình thoi là tứ giác có 4 cạnh bằng nhau.", "4 cạnh bằng nhau"),
        "m2": ("Nhận biết mét vuông là đơn vị đo diện tích.", "1 m2 là diện tích hình vuông cạnh 1 m.", "Hình chữ nhật 3 m x 2 m có diện tích 6 m2.", "6 m2"),
        "dm2": ("Nhận biết đề-xi-mét vuông là đơn vị đo diện tích nhỏ hơn mét vuông.", "1 dm2 là diện tích hình vuông cạnh 1 dm.", "5 dm2 + 3 dm2 = 8 dm2.", "8 dm2"),
        "mm2": ("Nhận biết mi-li-mét vuông là đơn vị đo diện tích rất nhỏ.", "1 mm2 là diện tích hình vuông cạnh 1 mm.", "10 mm2 + 15 mm2 = 25 mm2.", "25 mm2"),
        "frac_add_same": ("Cộng phân số cùng mẫu bằng cách cộng tử số và giữ nguyên mẫu số.", "2/7 + 3/7 = 5/7.", "1/9 + 5/9 = 6/9.", "6/9"),
        "frac_sub_same": ("Trừ phân số cùng mẫu bằng cách trừ tử số và giữ nguyên mẫu số.", "5/7 - 2/7 = 3/7.", "8/9 - 3/9 = 5/9.", "5/9"),
        "frac_add_diff": ("Cộng phân số khác mẫu bằng cách quy đồng mẫu số rồi cộng.", "1/2 + 1/3 = 3/6 + 2/6 = 5/6.", "1/4 + 1/2 = 3/4.", "3/4"),
        "frac_sub_diff": ("Trừ phân số khác mẫu bằng cách quy đồng mẫu số rồi trừ.", "3/4 - 1/2 = 3/4 - 2/4 = 1/4.", "5/6 - 1/3 = 3/6.", "3/6"),
        "frac_mul": ("Nhân hai phân số bằng cách nhân tử với tử, mẫu với mẫu.", "2/3 x 3/5 = 6/15.", "1/4 x 2/3 = 2/12.", "2/12"),
        "fraction_of_number": ("Tìm phân số của một số bằng cách chia số đó cho mẫu rồi nhân với tử.", "2/3 của 12 là 12 : 3 x 2 = 8.", "3/5 của 20 là 12.", "12"),
        "frac_div": ("Chia phân số bằng cách nhân với phân số đảo ngược.", "2/3 : 4/5 = 2/3 x 5/4 = 10/12.", "1/2 : 3/4 = 2/3.", "2/3"),
        "data_sequence": ("Đọc và mô tả dãy số liệu thống kê.", "Dãy 5, 7, 7, 9 cho biết các giá trị đã thu thập.", "Dãy 3, 4, 4, 6 có 4 số liệu.", "4 số liệu"),
        "bar_chart": ("Đọc biểu đồ cột để so sánh số liệu.", "Cột Táo cao 6 nghĩa là có 6 quả táo.", "Cột Cam cao 4 nghĩa là có 4 quả cam.", "4 quả cam"),
        "event_tally": ("Kiểm đếm số lần xuất hiện của một sự kiện.", "Mặt ngửa xuất hiện 6 lần thì ghi 6 vạch kiểm đếm.", "Sự kiện A xuất hiện 5 lần.", "5 lần"),
    }
    objective, model, quick, answer = specs[k]
    return {"kind": k, "objective": objective, "model": model, "quick": quick, "answer": answer}


# Hàm header dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def header(draw, lesson, card_title):
    base.rounded(draw, (34, 34, 1166, 641), "#ffffff", "#cbd5e1", 3, 30)
    draw.text((78, 65), "Toán lớp 4", font=base.font(27, True), fill="#1f4e79")
    draw.text((78, 103), lesson, font=base.font(28, True), fill="#0f172a")
    base.label_box(draw, (860, 62, 1122, 116), card_title, fill="#e0f2fe", outline="#0369a1", color="#075985", size=24)
    draw.line((78, 145, 1122, 145), fill="#e2e8f0", width=3)


# Hàm draw_large_digits dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def draw_large_digits(draw, number="523416", x=125, y=275):
    labels = ["trăm nghìn", "chục nghìn", "nghìn", "trăm", "chục", "đơn vị"]
    colors = ["#ddd6fe", "#bfdbfe", "#fde68a", "#bbf7d0", "#fecaca", "#fed7aa"]
    for i, digit in enumerate(number):
        bx = x + i * 88
        base.rounded(draw, (bx, y, bx + 64, y + 64), colors[i], "#334155", 2, 12)
        base.draw_center(draw, (bx + 32, y + 32), digit, base.font(30, True), "#0f172a")
        draw.text((bx - 7, y + 76), labels[i], font=base.font(14, True), fill="#334155")


# Hàm draw_fraction_circle dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def draw_fraction_circle(draw, x, y, denom, num, label):
    r = 115
    start = -90
    for i in range(denom):
        end = start + 360 / denom
        fill = "#facc15" if i < num else "#e0f2fe"
        draw.pieslice((x - r, y - r, x + r, y + r), start, end, fill=fill, outline="#1d4ed8", width=3)
        start = end
    draw.text((x - 32, y + 140), label, font=base.font(32, True), fill="#dc2626")


# Hàm draw_fraction_operation dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def draw_fraction_operation(draw, text, result, note=""):
    draw.text((210, 245), text, font=base.font(58, True), fill="#0f172a")
    draw.line((230, 355, 840, 355), fill="#1d4ed8", width=5)
    draw.polygon([(840, 355), (815, 340), (815, 370)], fill="#1d4ed8")
    draw.text((880, 320), result, font=base.font(58, True), fill="#dc2626")
    if note:
        base.label_box(draw, (245, 435, 890, 500), note, "#fef3c7", "#ca8a04", "#92400e", 25)


# Hàm draw_scene_by_kind dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def draw_scene_by_kind(draw, name, k, card_index):
    if k in {"large_number", "decimal_system"}:
        draw_large_digits(draw)
        draw.text((740, 315), "Phân tích theo hàng", font=base.font(40, True), fill="#1d4ed8")
    elif k == "compare_large":
        draw_large_digits(draw, "523416", 100, 280)
        draw.text((615, 330), ">", font=base.font(70, True), fill="#dc2626")
        draw_large_digits(draw, "498905", 690, 280)
    elif k == "rounding":
        draw.text((230, 275), "523 416", font=base.font(74, True), fill="#0f172a")
        draw.line((250, 390, 770, 390), fill="#1d4ed8", width=5)
        draw.polygon([(770, 390), (745, 375), (745, 405)], fill="#1d4ed8")
        draw.text((815, 355), "500 000", font=base.font(54, True), fill="#dc2626")
    elif k == "natural_sequence":
        draw.line((190, 355, 980, 355), fill="#1d4ed8", width=6)
        draw.polygon([(980, 355), (955, 340), (955, 370)], fill="#1d4ed8")
        for i, value in enumerate(range(0, 8)):
            x = 210 + i * 95
            draw.line((x, 330, x, 380), fill="#1d4ed8", width=4)
            base.draw_center(draw, (x, 415), str(value), base.font(27, True), "#0f172a")
        draw.text((270, 245), "0, 1, 2, 3, 4, ...", font=base.font(56, True), fill="#0f172a")
        draw.text((285, 485), "Mỗi số hơn số trước 1 đơn vị", font=base.font(34, True), fill="#1d4ed8")
    elif k in {"mass", "second", "century", "unit_rate"}:
        draw_measurement_problem(draw, k)
    elif k in {"angle_types", "degree", "perpendicular", "parallel"}:
        draw_angle_line(draw, k)
    elif k in {"add_sub", "mul_one_digit", "mul_two_digit", "div_one_digit", "div_two_digit", "zero_quotient"}:
        draw_operation(draw, k)
    elif k in {"add_properties", "average", "sum_diff", "mul_properties", "mul_10", "div_10", "estimate", "variable_expression"}:
        draw_strategy(draw, k)
    elif k in {"fraction_concept", "fraction_division", "equivalent_fraction", "fraction_property", "simplify_fraction", "common_denominator", "compare_frac_same", "compare_frac_diff"}:
        draw_fraction_concept(draw, k)
    elif k in {"parallelogram", "rhombus", "m2", "dm2", "mm2"}:
        draw_geometry_area(draw, k)
    elif k in {"frac_add_same", "frac_sub_same", "frac_add_diff", "frac_sub_diff", "frac_mul", "fraction_of_number", "frac_div"}:
        draw_fraction_calc(draw, k)
    elif k in {"data_sequence", "bar_chart", "event_tally"}:
        draw_data(draw, k)


# Hàm draw_measurement_problem dùng để tính toán kết quả từ các tham số đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def draw_measurement_problem(draw, k):
    if k == "mass":
        for i, (label, value) in enumerate([("1 yến", "10 kg"), ("1 tạ", "100 kg"), ("1 tấn", "1000 kg")]):
            base.label_box(draw, (170 + i * 300, 270, 410 + i * 300, 360), label, "#fef3c7", "#a16207", "#92400e", 31)
            draw.text((205 + i * 300, 405), value, font=base.font(32, True), fill="#1d4ed8")
    elif k == "second":
        draw.ellipse((260, 210, 560, 510), fill="#ffffff", outline="#1e3a8a", width=7)
        draw.line((410, 360, 410, 240), fill="#2563eb", width=6)
        draw.line((410, 360, 500, 360), fill="#ef4444", width=8)
        draw.text((650, 335), "1 phút = 60 giây", font=base.font(48, True), fill="#1d4ed8")
    elif k == "century":
        base.label_box(draw, (210, 300, 500, 390), "2001", "#dcfce7", "#15803d", "#166534", 38)
        draw.line((510, 345, 750, 345), fill="#1d4ed8", width=5)
        base.label_box(draw, (760, 300, 1050, 390), "2100", "#fee2e2", "#dc2626", "#991b1b", 38)
        draw.text((410, 455), "Thế kỉ XXI", font=base.font(44, True), fill="#1d4ed8")
    else:
        base.draw_group_panel(draw, (135, 260, 430, 455), 4, "4 quyển: 24 000đ", item="book")
        draw.text((520, 285), "1 quyển: 24 000 : 4", font=base.font(34, True), fill="#0f172a")
        draw.text((620, 365), "= 6 000đ", font=base.font(48, True), fill="#1d4ed8")


# Hàm draw_angle_line dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def draw_angle_line(draw, k):
    if k == "angle_types":
        draw.line((175, 450, 310, 350), fill="#15803d", width=7)
        draw.line((175, 450, 350, 450), fill="#15803d", width=7)
        draw.text((170, 485), "Góc nhọn", font=base.font(30, True), fill="#15803d")
        draw.line((500, 450, 390, 320), fill="#ca8a04", width=7)
        draw.line((500, 450, 690, 450), fill="#ca8a04", width=7)
        draw.text((455, 485), "Góc tù", font=base.font(30, True), fill="#ca8a04")
        draw.line((820, 395, 1080, 395), fill="#dc2626", width=7)
        draw.text((895, 430), "Góc bẹt", font=base.font(30, True), fill="#dc2626")
    elif k == "degree":
        draw.line((290, 455, 290, 260), fill="#1d4ed8", width=8)
        draw.line((290, 455, 520, 455), fill="#1d4ed8", width=8)
        draw.arc((230, 395, 350, 515), 270, 360, fill="#dc2626", width=5)
        draw.text((650, 350), "Góc vuông = 90 độ", font=base.font(44, True), fill="#1d4ed8")
    elif k == "perpendicular":
        draw.line((290, 220, 290, 520), fill="#1d4ed8", width=8)
        draw.line((150, 370, 520, 370), fill="#1d4ed8", width=8)
        draw.rectangle((290, 370, 335, 415), outline="#dc2626", width=5)
        draw.text((650, 345), "Cắt nhau tạo góc 90 độ", font=base.font(40, True), fill="#dc2626")
    else:
        draw.line((170, 300, 950, 300), fill="#1d4ed8", width=8)
        draw.line((170, 430, 950, 430), fill="#1d4ed8", width=8)
        draw.text((430, 485), "Hai đường thẳng song song", font=base.font(38, True), fill="#1d4ed8")


# Hàm draw_operation dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def draw_operation(draw, k):
    if k == "add_sub":
        g3.draw_vertical(draw, 480, 245, ["523416", "142305"], "665721", "+")
        g3.draw_vertical(draw, 780, 245, ["665721", "142305"], "523416", "-")
    elif k == "mul_one_digit":
        g3.draw_vertical(draw, 515, 250, ["12324", "3"], "36972", "x")
    elif k == "mul_two_digit":
        draw.text((225, 255), "234 x 12", font=base.font(62, True), fill="#0f172a")
        draw.text((260, 355), "234 x 10 + 234 x 2", font=base.font(38, True), fill="#1d4ed8")
        draw.text((410, 430), "= 2 808", font=base.font(50, True), fill="#dc2626")
    elif k == "div_one_digit":
        draw.text((370, 300), "36 972 : 3 = 12 324", font=base.font(52, True), fill="#1d4ed8")
    elif k == "div_two_digit":
        draw.text((380, 300), "2 808 : 12 = 234", font=base.font(54, True), fill="#1d4ed8")
        base.label_box(draw, (420, 410, 780, 475), "Ước lượng thương từng lượt", "#fef3c7", "#ca8a04", "#92400e", 25)
    else:
        draw.text((405, 300), "6 042 : 3 = 2 014", font=base.font(52, True), fill="#1d4ed8")
        base.label_box(draw, (430, 410, 820, 475), "Thương có chữ số 0", "#fee2e2", "#dc2626", "#991b1b", 26)


# Hàm draw_strategy dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def draw_strategy(draw, k):
    texts = {
        "add_properties": ("35 + 28 + 65", "(35 + 65) + 28 = 128"),
        "average": ("8, 10, 12", "(8 + 10 + 12) : 3 = 10"),
        "sum_diff": ("Tổng 30, hiệu 6", "Số lớn = (30 + 6) : 2 = 18"),
        "mul_properties": ("25 x 12 x 4", "(25 x 4) x 12 = 1 200"),
        "mul_10": ("234 x 100", "= 23 400"),
        "div_10": ("23 400 : 100", "= 234"),
        "estimate": ("498 + 203", "xấp xỉ 500 + 200 = 700"),
        "variable_expression": ("a + 12, với a = 5", "= 17"),
    }
    top, bottom = texts[k]
    draw.text((220, 260), top, font=base.font(58, True), fill="#0f172a")
    draw.text((260, 375), bottom, font=base.font(44, True), fill="#1d4ed8")


# Hàm draw_fraction_concept dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def draw_fraction_concept(draw, k):
    if k in {"fraction_concept", "fraction_division"}:
        draw_fraction_circle(draw, 370, 360, 4, 3, "3/4")
        draw.text((660, 320), "Tử số: 3", font=base.font(36, True), fill="#dc2626")
        draw.text((660, 380), "Mẫu số: 4", font=base.font(36, True), fill="#1d4ed8")
    elif k in {"equivalent_fraction", "fraction_property"}:
        draw_fraction_circle(draw, 330, 350, 2, 1, "1/2")
        draw_fraction_circle(draw, 710, 350, 4, 2, "2/4")
        draw.text((530, 345), "=", font=base.font(68, True), fill="#1d4ed8")
    elif k == "simplify_fraction":
        draw_fraction_operation(draw, "6/8", "3/4", "Chia cả tử và mẫu cho 2")
    elif k == "common_denominator":
        draw_fraction_operation(draw, "1/2 và 1/3", "3/6 và 2/6", "Quy đồng về mẫu số 6")
    elif k == "compare_frac_same":
        draw_fraction_operation(draw, "3/7  <  5/7", "3 < 5", "Cùng mẫu thì so sánh tử")
    else:
        draw_fraction_operation(draw, "1/2  <  2/3", "3/6 < 4/6", "Quy đồng rồi so sánh")


# Hàm draw_geometry_area dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def draw_geometry_area(draw, k):
    if k == "parallelogram":
        draw.polygon([(260, 280), (650, 280), (560, 480), (170, 480)], fill="#bfdbfe", outline="#1d4ed8")
        draw.text((680, 350), "2 cặp cạnh đối song song", font=base.font(36, True), fill="#1d4ed8")
    elif k == "rhombus":
        draw.polygon([(430, 220), (650, 360), (430, 500), (210, 360)], fill="#dcfce7", outline="#15803d")
        draw.text((700, 350), "4 cạnh bằng nhau", font=base.font(40, True), fill="#15803d")
    else:
        unit = {"m2": "1 m2", "dm2": "1 dm2", "mm2": "1 mm2"}[k]
        for r in range(4):
            for c in range(5):
                x = 250 + c * 48
                y = 265 + r * 48
                draw.rectangle((x, y, x + 44, y + 44), fill="#bbf7d0", outline="#15803d", width=2)
        draw.text((560, 340), unit, font=base.font(58, True), fill="#15803d")


# Hàm draw_fraction_calc dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def draw_fraction_calc(draw, k):
    mapping = {
        "frac_add_same": ("2/7 + 3/7", "5/7", "Giữ nguyên mẫu số 7"),
        "frac_sub_same": ("5/7 - 2/7", "3/7", "Giữ nguyên mẫu số 7"),
        "frac_add_diff": ("1/2 + 1/3", "5/6", "Quy đồng: 3/6 + 2/6"),
        "frac_sub_diff": ("3/4 - 1/2", "1/4", "Quy đồng: 3/4 - 2/4"),
        "frac_mul": ("2/3 x 3/5", "6/15", "Tử nhân tử, mẫu nhân mẫu"),
        "fraction_of_number": ("2/3 của 12", "8", "12 : 3 x 2"),
        "frac_div": ("2/3 : 4/5", "10/12", "Nhân với phân số đảo ngược"),
    }
    draw_fraction_operation(draw, *mapping[k])


# Hàm draw_data dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def draw_data(draw, k):
    if k == "data_sequence":
        draw.text((260, 285), "5, 7, 7, 9, 10", font=base.font(62, True), fill="#0f172a")
        draw.text((350, 405), "Dãy số liệu thống kê", font=base.font(40, True), fill="#1d4ed8")
    elif k == "bar_chart":
        labels = [("Táo", 6, "#ef4444"), ("Cam", 4, "#f97316"), ("Chuối", 5, "#eab308")]
        for i, (label, count, color) in enumerate(labels):
            x = 260 + i * 210
            draw.rectangle((x, 500 - count * 35, x + 90, 500), fill=color, outline="#334155", width=2)
            draw.text((x + 10, 520), label, font=base.font(26, True), fill="#0f172a")
            draw.text((x + 28, 455 - count * 35), str(count), font=base.font(28, True), fill="#1d4ed8")
    else:
        rows = [("Mặt ngửa", 6), ("Mặt sấp", 4)]
        for i, (label, count) in enumerate(rows):
            y = 305 + i * 90
            draw.text((240, y), label, font=base.font(30, True), fill="#0f172a")
            for j in range(count):
                draw.line((510 + j * 30, y, 510 + j * 30, y + 45), fill="#1d4ed8", width=5)
            draw.text((760, y), f"{count} lần", font=base.font(28, True), fill="#1d4ed8")


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
            "wrong_hint": "Cho học sinh chỉ vào số, mô hình, hình vẽ hoặc nhãn trong tranh rồi đọc lại yêu cầu.",
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
            "wrong_hint": "Tách bài thành từng bước nhỏ, đối chiếu với tranh minh họa rồi làm lại.",
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
            "wrong_hint": "Quay lại thẻ làm mẫu, thay dữ kiện mới vào đúng vị trí rồi tính lại.",
        },
    ]


# Hàm build_blueprint dùng để xây dựng kết quả từ các nguồn dữ liệu và quy tắc liên quan; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def build_blueprint():
    chapters = []
    for chapter in CHAPTERS:
        lessons = []
        for name in chapter["lessons"]:
            spec = lesson_spec(name)
            lessons.append({"lesson": name, "kind": spec["kind"], "objective": spec["objective"], "cards": build_cards(name)})
        chapters.append({"title": chapter["title"], "lessons": lessons})
    return {
        "grade": 4,
        "source_textbook": "SGK Toán 4 Cánh Diều",
        "version_note": "Bản chi tiết: mỗi bài có 3 tranh minh họa riêng cho quan sát, làm mẫu và thử nhanh.",
        "cognitive_profile": {
            "reading_level": "Học sinh lớp 4 đọc hiểu tốt hơn, có thể tiếp nhận quy tắc và ví dụ nhiều bước nhưng vẫn cần mô hình trực quan.",
            "learning_style": "Quan sát mô hình, đọc quy tắc ngắn, theo ví dụ mẫu, sau đó làm thử một câu cùng dạng.",
            "ai_policy": "Có thể dùng AI ở mức gợi ý từng bước và hỏi dẫn dắt; không đưa đáp án ngay.",
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
    for i, h in enumerate(["STT", "Chủ đề", "Số bài", "Số thẻ", "Số ảnh"]):
        set_cell_text(table.rows[0].cells[i], h, True)
        shade(table.rows[0].cells[i], "D9EAF7")
    for i, chapter in enumerate(data["chapters"], 1):
        row = table.add_row().cells
        card_count = sum(len(lesson["cards"]) for lesson in chapter["lessons"])
        for j, value in enumerate([i, chapter["title"], len(chapter["lessons"]), card_count, card_count]):
            set_cell_text(row[j], value)
            row[j].vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.TOP


# Hàm render_card_image dùng để chuẩn bị và hiển thị kết quả cho người dùng; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def render_card_image(chapter_index, lesson_index, card_index, lesson_name, card):
    IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    img = Image.new("RGB", (1200, 675), "#f1f5f9")
    draw = ImageDraw.Draw(img)
    header(draw, lesson_name, card["title"])
    if card_index == 3:
        draw_quick_scene(draw, card)
    else:
        draw_scene_by_kind(draw, lesson_name, card["kind"], card_index)
    base.rounded(draw, (78, 560, 1122, 618), "#f8fafc", "#e2e8f0", 2, 18)
    base.draw_wrapped(draw, card["caption"], (105, 575), base.font(22, True), fill="#0f172a", width=84, spacing=4)
    out = IMAGE_DIR / f"grade4-c{chapter_index:02d}-l{lesson_index:02d}-card{card_index:02d}.png"
    img.save(out)
    return out


# Hàm draw_quick_scene dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def draw_quick_scene(draw, card):
    base.rounded(draw, (130, 225, 1070, 485), "#f8fafc", "#cbd5e1", 3, 24)
    draw.text((185, 260), "Bài thử nhanh", font=base.font(34, True), fill="#0f172a")
    base.draw_wrapped(draw, card["display_text"], (185, 320), base.font(36, True), fill="#1d4ed8", width=34, spacing=10)
    base.label_box(
        draw,
        (650, 370, 1010, 445),
        f"Đáp án: {card['expected_answer']}",
        "#dcfce7",
        "#15803d",
        "#166534",
        25,
    )


# Hàm build_docx dùng để xây dựng kết quả từ các nguồn dữ liệu và quy tắc liên quan; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def build_docx(data):
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    doc = Document()
    base.set_defaults(doc)
    title = doc.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = title.add_run("LÝ THUYẾT TOÁN LỚP 4")
    set_run_font(r, size=24, bold=True, color="1F4E79")
    subtitle = doc.add_paragraph()
    subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = subtitle.add_run("Bản chi tiết theo thẻ, có tranh tình huống, đáp án và gợi ý sai - Codex")
    set_run_font(r, size=13, italic=True)
    add_meta(doc, "Nguồn tham khảo", data["source_textbook"])
    add_meta(doc, "Ghi chú phiên bản", data["version_note"])
    doc.add_heading("Định hướng thiết kế lớp 4", level=1)
    add_bullets(
        doc,
        [
            data["cognitive_profile"]["reading_level"],
            data["cognitive_profile"]["learning_style"],
            data["cognitive_profile"]["ai_policy"],
            "Mỗi bài có 3 tranh: quan sát tình huống, làm mẫu theo bước và thử nhanh có đáp án.",
        ],
    )
    doc.add_heading("Tổng quan nội dung", level=1)
    add_overview(doc, data)
    for chapter_index, chapter in enumerate(data["chapters"], 1):
        doc.add_page_break()
        doc.add_heading(f"Chủ đề {chapter_index}: {chapter['title']}", level=1)
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


# Hàm build_contact_sheets dùng để xây dựng kết quả từ các nguồn dữ liệu và quy tắc liên quan; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def build_contact_sheets():
    paths = sorted(IMAGE_DIR.glob("grade4-*.png"))
    outs = []
    for start in range(0, len(paths), 60):
        chunk = paths[start : start + 60]
        cols = 5
        rows = math.ceil(len(chunk) / cols)
        sheet = Image.new("RGB", (cols * 240, rows * 170), "#ffffff")
        draw = ImageDraw.Draw(sheet)
        for i, path in enumerate(chunk):
            img = Image.open(path).resize((240, 135))
            x = (i % cols) * 240
            y = (i // cols) * 170
            sheet.paste(img, (x, y))
            draw.text((x + 6, y + 140), path.stem.replace("grade4-", ""), font=base.font(16, True), fill="#0f172a")
        out = IMAGE_DIR / f"contact-sheet-{start + 1}-{start + len(chunk)}.png"
        sheet.save(out)
        outs.append(out)
    return outs


# Hàm main dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def main():
    data = build_blueprint()
    BLUEPRINT_PATH.parent.mkdir(parents=True, exist_ok=True)
    BLUEPRINT_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    output = build_docx(data)
    sheets = build_contact_sheets()
    print(BLUEPRINT_PATH)
    print(output)
    for sheet in sheets:
        print(sheet)
    print(f"lessons={sum(len(c['lessons']) for c in data['chapters'])}")
    print(f"cards={sum(len(l['cards']) for c in data['chapters'] for l in c['lessons'])}")
    print(f"images={len(list(IMAGE_DIR.glob('grade4-*.png')))}")


# Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
if __name__ == "__main__":
    main()
