# Script build grade2 theory docx hỗ trợ nhập, xuất, kiểm tra hoặc bảo trì dữ liệu và cấu hình của dự án.
import json
import math
import textwrap
from pathlib import Path

from docx import Document
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
BLUEPRINT_PATH = ROOT / "content-theory" / "grade-2-theory-blueprint.json"
OUTPUT_DIR = ROOT / "output" / "doc"
IMAGE_DIR = OUTPUT_DIR / "grade2_theory_images"
OUTPUT_PATH = OUTPUT_DIR / "ly-thuyet-lop-2-codex.docx"
FALLBACK_OUTPUT_PATH = OUTPUT_DIR / "ly-thuyet-lop-2-codex-fixed.docx"
FONT_REGULAR = Path("C:/Windows/Fonts/arial.ttf")
FONT_BOLD = Path("C:/Windows/Fonts/arialbd.ttf")


CHAPTERS = [
    {
        "title": "Ôn tập lớp 1. Phép cộng, phép trừ (có nhớ) trong phạm vi 20",
        "lessons": [
            "Tia số. Số liền trước, số liền sau",
            "Đề-xi-mét",
            "Số hạng - Tổng",
            "Số bị trừ - Số trừ - Hiệu",
            "Phép cộng (có nhớ) trong phạm vi 20",
            "Phép cộng (có nhớ) trong phạm vi 20 (tiếp theo)",
            "Bảng cộng (có nhớ) trong phạm vi 20",
            "Phép trừ (có nhớ) trong phạm vi 20",
            "Phép trừ (có nhớ) trong phạm vi 20 (tiếp theo)",
            "Bảng trừ (có nhớ) trong phạm vi 20",
            "Bài toán liên quan đến phép cộng, phép trừ",
            "Bài toán liên quan đến phép cộng, phép trừ (tiếp theo)",
        ],
    },
    {
        "title": "Phép cộng, phép trừ (có nhớ) trong phạm vi 100",
        "lessons": [
            "Phép cộng (có nhớ) trong phạm vi 100",
            "Phép cộng (có nhớ) trong phạm vi 100 (tiếp theo)",
            "Phép trừ (có nhớ) trong phạm vi 100",
            "Phép trừ (có nhớ) trong phạm vi 100 (tiếp theo)",
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
            "Phép cộng (không nhớ) trong phạm vi 1000",
            "Phép trừ (không nhớ) trong phạm vi 1000",
            "Mét",
            "Ki-lô-mét",
            "Phép cộng (có nhớ) trong phạm vi 1000",
            "Phép trừ (có nhớ) trong phạm vi 1000",
            "Thu thập - Kiểm đếm",
            "Biểu đồ tranh",
            "Chắc chắn - Có thể - Không thể",
        ],
    },
]


# Hàm font dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def font(size, bold=False):
    path = FONT_BOLD if bold and FONT_BOLD.exists() else FONT_REGULAR
    return ImageFont.truetype(str(path), size=size) if path.exists() else ImageFont.load_default()


# Hàm wrap_text dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def wrap_text(text, width=48):
    lines = []
    for part in str(text).splitlines():
        lines.extend(textwrap.wrap(part, width=width) or [""])
    return lines


# Hàm normalize dùng để chuẩn hóa và làm sạch dữ liệu đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def normalize(text):
    return text.lower()


# Hàm lesson_kind dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def lesson_kind(name):
    n = normalize(name)
    if "tia số" in n:
        return "number_line"
    if any(k in n for k in ["đề-xi-mét", "ki-lô-gam", "lít", "mét", "ki-lô-mét", "ngày - giờ", "giờ - phút", "ngày - tháng"]):
        return "measurement"
    if any(k in n for k in ["số hạng", "số bị trừ", "thừa số", "số bị chia"]):
        return "operation_parts"
    if "bảng cộng" in n or "bảng trừ" in n or "bảng nhân" in n or "bảng chia" in n:
        return "fact_table"
    if "phép cộng" in n:
        return "addition"
    if "phép trừ" in n:
        return "subtraction"
    if "phép nhân" in n or "dấu nhân" in n:
        return "multiplication"
    if "phép chia" in n or "dấu chia" in n:
        return "division"
    if "bài toán" in n:
        return "word_problem"
    if any(k in n for k in ["hình", "điểm", "đường", "khối"]):
        return "geometry"
    if "số" in n and "1000" in n:
        return "place_value_1000"
    if "ba chữ số" in n or "so sánh các số" in n:
        return "place_value_1000"
    if "thu thập" in n or "biểu đồ" in n:
        return "data"
    if "chắc chắn" in n:
        return "probability"
    return "general"


# Hàm examples_for_kind dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def examples_for_kind(kind, name):
    n = normalize(name)
    if kind == "number_line":
        return {
            "model": "Trên tia số, số đứng ngay trước 28 là 27; số đứng ngay sau 28 là 29.",
            "quick": "Số liền sau của 35 là 36.",
        }
    if "đề-xi-mét" in n:
        return {"model": "1 dm = 10 cm.", "quick": "3 dm = 30 cm."}
    if "ki-lô-gam" in n:
        return {"model": "Ki-lô-gam dùng để đo khối lượng; viết tắt là kg.", "quick": "Túi gạo 5 kg nặng hơn túi gạo 2 kg."}
    if "lít" in n:
        return {"model": "Lít dùng để đo lượng nước/dung tích; viết tắt là l.", "quick": "Bình 3 l có nhiều nước hơn bình 1 l."}
    if n == "mét":
        return {"model": "1 m = 100 cm.", "quick": "2 m = 200 cm."}
    if "ki-lô-mét" in n:
        return {"model": "Ki-lô-mét dùng để đo quãng đường dài; viết tắt là km.", "quick": "5 km dài hơn 2 km."}
    if "ngày - giờ" in n:
        return {"model": "Một ngày có 24 giờ.", "quick": "Buổi sáng 7 giờ là thời điểm đi học thường gặp."}
    if "giờ - phút" in n:
        return {"model": "1 giờ = 60 phút.", "quick": "2 giờ = 120 phút."}
    if "ngày - tháng" in n:
        return {"model": "Một tháng có thể có 28, 29, 30 hoặc 31 ngày.", "quick": "Tháng 1 có 31 ngày."}
    if kind == "operation_parts":
        if "số hạng" in n:
            return {"model": "Trong 8 + 5 = 13, 8 và 5 là số hạng, 13 là tổng.", "quick": "Trong 6 + 7 = 13, tổng là 13."}
        if "số bị trừ" in n:
            return {"model": "Trong 15 - 7 = 8, 15 là số bị trừ, 7 là số trừ, 8 là hiệu.", "quick": "Trong 18 - 9 = 9, hiệu là 9."}
        if "thừa số" in n:
            return {"model": "Trong 2 x 5 = 10, 2 và 5 là thừa số, 10 là tích.", "quick": "Trong 5 x 3 = 15, tích là 15."}
        return {"model": "Trong 10 : 2 = 5, 10 là số bị chia, 2 là số chia, 5 là thương.", "quick": "Trong 20 : 5 = 4, thương là 4."}
    if kind == "fact_table":
        if "nhân 2" in n:
            return {"model": "2 x 4 = 8 vì có 4 nhóm, mỗi nhóm 2.", "quick": "2 x 6 = 12."}
        if "nhân 5" in n:
            return {"model": "5 x 3 = 15 vì có 3 nhóm, mỗi nhóm 5.", "quick": "5 x 6 = 30."}
        if "chia 2" in n:
            return {"model": "8 : 2 = 4 vì 8 đồ vật chia đều thành 2 phần, mỗi phần 4.", "quick": "12 : 2 = 6."}
        if "chia 5" in n:
            return {"model": "20 : 5 = 4 vì 20 đồ vật chia đều thành 5 phần, mỗi phần 4.", "quick": "25 : 5 = 5."}
        if "cộng" in n:
            return {"model": "8 + 5 = 13 bằng cách tách 5 thành 2 và 3: 8 + 2 = 10, 10 + 3 = 13.", "quick": "9 + 4 = 13."}
        return {"model": "13 - 5 = 8 bằng cách tách 5 thành 3 và 2: 13 - 3 = 10, 10 - 2 = 8.", "quick": "14 - 6 = 8."}
    if kind == "addition":
        if "1000" in n:
            return {"model": "326 + 152 = 478: cộng đơn vị, chục, trăm theo từng hàng.", "quick": "245 + 132 = 377."}
        if "100" in n:
            return {"model": "38 + 27 = 65: 8 + 7 = 15, viết 5 nhớ 1 chục; 3 chục + 2 chục + 1 chục = 6 chục.", "quick": "46 + 28 = 74."}
        return {"model": "8 + 5 = 13: lấy 8 + 2 = 10, còn 3, được 13.", "quick": "9 + 4 = 13."}
    if kind == "subtraction":
        if "1000" in n:
            return {"model": "478 - 152 = 326: trừ đơn vị, chục, trăm theo từng hàng.", "quick": "377 - 132 = 245."}
        if "100" in n:
            return {"model": "52 - 28 = 24: mượn 1 chục để trừ ở hàng đơn vị, rồi trừ hàng chục.", "quick": "63 - 27 = 36."}
        return {"model": "13 - 5 = 8: lấy 13 - 3 = 10, rồi 10 - 2 = 8.", "quick": "14 - 6 = 8."}
    if kind == "multiplication":
        return {"model": "2 + 2 + 2 = 6 có thể viết thành 2 x 3 = 6.", "quick": "Có 4 nhóm, mỗi nhóm 2 quả: 2 x 4 = 8."}
    if kind == "division":
        return {"model": "6 đồ vật chia đều thành 2 phần, mỗi phần có 3 đồ vật: 6 : 2 = 3.", "quick": "10 : 2 = 5."}
    if kind == "word_problem":
        return {"model": "Mai có 12 nhãn vở, Lan cho thêm 5 nhãn vở. Mai có tất cả 17 nhãn vở.", "quick": "Có 18 quả cam, bán 7 quả, còn 11 quả cam."}
    if kind == "geometry":
        if "tứ giác" in n:
            return {"model": "Hình tứ giác là hình có 4 cạnh.", "quick": "Hình có 4 cạnh là hình tứ giác."}
        if "điểm" in n:
            return {"model": "Đoạn thẳng AB nối hai điểm A và B.", "quick": "Hai đầu của đoạn thẳng là hai điểm."}
        if "đường thẳng" in n:
            return {"model": "Đường thẳng kéo dài mãi về hai phía; đường cong không thẳng; đường gấp khúc gồm nhiều đoạn thẳng nối nhau.", "quick": "Đường gấp khúc có thể gồm 3 đoạn thẳng."}
        if "độ dài" in n or "đo độ dài" in n:
            return {"model": "Độ dài đường gấp khúc bằng tổng độ dài các đoạn thẳng của nó.", "quick": "Đường gấp khúc gồm đoạn 3 cm và 4 cm dài 7 cm."}
        return {"model": "Khối trụ có hai mặt đáy tròn; khối cầu có dạng tròn đều như quả bóng.", "quick": "Lon sữa giống khối trụ, quả bóng giống khối cầu."}
    if kind == "place_value_1000":
        if "so sánh" in n:
            return {"model": "345 < 412 vì 3 trăm bé hơn 4 trăm.", "quick": "608 > 580."}
        return {"model": "326 gồm 3 trăm, 2 chục và 6 đơn vị.", "quick": "405 gồm 4 trăm, 0 chục và 5 đơn vị."}
    if kind == "data":
        if "biểu đồ" in n:
            return {"model": "Mỗi hình trong biểu đồ tranh biểu thị một số lượng đối tượng.", "quick": "Nếu có 5 hình quả táo thì có 5 quả táo."}
        return {"model": "Kiểm đếm bằng cách gạch một vạch cho mỗi đối tượng, rồi cộng các vạch.", "quick": "Có 4 bạn chọn bóng đá nếu kiểm đếm được 4 vạch."}
    if kind == "probability":
        return {"model": "Mặt trời mọc vào buổi sáng là chắc chắn; tung đồng xu ra mặt sấp là có thể; con cá sống trên cây là không thể.", "quick": "Ngày mai có mưa là có thể."}
    return {"model": "Quan sát ví dụ, gọi tên kiến thức rồi làm một bài thử nhanh.", "quick": "Học sinh hoàn thành đúng nhiệm vụ theo mẫu."}


# Hàm objective_for dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def objective_for(name):
    kind = lesson_kind(name)
    mapping = {
        "number_line": "Nhận biết tia số, số liền trước và số liền sau.",
        "measurement": "Nhận biết đơn vị đo và dùng đơn vị đó trong tình huống quen thuộc.",
        "operation_parts": "Gọi tên đúng các thành phần trong phép tính.",
        "fact_table": "Ghi nhớ và vận dụng bảng tính cơ bản.",
        "addition": "Thực hiện phép cộng theo hàng hoặc bằng cách tách số phù hợp.",
        "subtraction": "Thực hiện phép trừ theo hàng hoặc bằng cách tách số phù hợp.",
        "multiplication": "Hiểu phép nhân là phép cộng các số hạng bằng nhau.",
        "division": "Hiểu phép chia là chia đều hoặc chia theo nhóm.",
        "word_problem": "Đọc tình huống, chọn phép tính phù hợp và trả lời bài toán.",
        "geometry": "Nhận biết yếu tố hình học qua hình vẽ và đồ vật quen thuộc.",
        "place_value_1000": "Đọc, viết, phân tích và so sánh các số trong phạm vi 1000.",
        "data": "Thu thập, kiểm đếm và đọc dữ liệu đơn giản.",
        "probability": "Phân biệt chắc chắn, có thể và không thể trong tình huống đơn giản.",
    }
    return mapping.get(kind, "Nhận biết kiến thức mới và vận dụng vào bài tập đơn giản.")


# Hàm visual_prompt_for dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def visual_prompt_for(kind, name):
    prompts = {
        "number_line": "Một tia số từ 24 đến 30, số 28 được tô màu để học sinh tìm số liền trước và số liền sau.",
        "measurement": "Một tình huống đo lường quen thuộc: thước, cân, bình nước, lịch hoặc đồng hồ tùy nội dung bài.",
        "operation_parts": "Một phép tính lớn ở giữa tranh, các thành phần được đặt trong các ô màu khác nhau để nhận biết tên gọi.",
        "fact_table": "Các nhóm đồ vật bằng nhau hoặc bảng tính nhỏ để minh họa một bảng cộng/trừ/nhân/chia.",
        "addition": "Các bó que tính hoặc khối base-ten được gộp lại để minh họa phép cộng.",
        "subtraction": "Các bó que tính hoặc khối base-ten bị bớt đi để minh họa phép trừ.",
        "multiplication": "Nhiều nhóm đồ vật bằng nhau, ví dụ 3 nhóm, mỗi nhóm 2 quả.",
        "division": "Một nhóm đồ vật được chia đều vào các đĩa/hộp.",
        "word_problem": "Một tình huống đời sống có đồ vật được thêm vào hoặc bớt đi.",
        "geometry": "Hình học hoặc đồ vật thật tương ứng với bài học.",
        "place_value_1000": "Các khối trăm, thanh chục và ô đơn vị biểu diễn một số có ba chữ số.",
        "data": "Một bảng kiểm đếm hoặc biểu đồ tranh đơn giản với các biểu tượng dễ nhìn.",
        "probability": "Ba tranh nhỏ: việc chắc chắn xảy ra, việc có thể xảy ra, việc không thể xảy ra.",
        "general": "Một tranh học tập đơn giản phù hợp nội dung bài.",
    }
    return prompts.get(kind, prompts["general"])


# Hàm build_cards dùng để xây dựng kết quả từ các nguồn dữ liệu và quy tắc liên quan; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def build_cards(name):
    kind = lesson_kind(name)
    examples = examples_for_kind(kind, name)
    return [
        {
            "type": "concept",
            "title": "Nhận biết kiến thức",
            "display_text": f"Quan sát ví dụ của bài: {name}.",
            "visual_prompt": visual_prompt_for(kind, name),
            "student_task": "Gọi tên kiến thức hoặc thao tác chính trong tranh.",
            "interaction": "choose",
            "expected_answer": f"Học sinh nhận biết đúng nội dung trọng tâm: {objective_for(name)}",
            "wrong_hint": "Cho học sinh quan sát lại hình minh họa, đọc chậm câu hỏi và xác định dữ kiện quan trọng.",
        },
        {
            "type": "model",
            "title": "Làm mẫu",
            "display_text": examples["model"],
            "visual_prompt": visual_prompt_for(kind, name),
            "student_task": "Theo dõi cách làm mẫu và nhắc lại bước chính.",
            "interaction": "none",
            "expected_answer": examples["model"],
            "wrong_hint": "Nhắc lại từng bước từ trái sang phải hoặc từ hàng đơn vị đến hàng lớn hơn.",
        },
        {
            "type": "quick_try",
            "title": "Thử nhanh",
            "display_text": examples["quick"],
            "visual_prompt": visual_prompt_for(kind, name),
            "student_task": "Tự làm một câu ngắn cùng dạng với ví dụ mẫu.",
            "interaction": "fill_blank",
            "expected_answer": examples["quick"],
            "wrong_hint": "Gợi ý học sinh quay lại ví dụ mẫu rồi làm lại với số mới.",
        },
    ]


# Hàm build_blueprint dùng để xây dựng kết quả từ các nguồn dữ liệu và quy tắc liên quan; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def build_blueprint():
    chapters = []
    for chapter in CHAPTERS:
        lessons = []
        for name in chapter["lessons"]:
            lessons.append(
                {
                    "lesson": name,
                    "kind": lesson_kind(name),
                    "objective": objective_for(name),
                    "cards": build_cards(name),
                }
            )
        chapters.append({"title": chapter["title"], "lessons": lessons})
    return {
        "grade": 2,
        "source_textbook": "SGK Toán 2 Cánh Diều",
        "scope_note": "Bản học liệu lý thuyết lớp 2 được tạo mới theo cấu trúc thẻ học, có đáp án và gợi ý sai.",
        "cognitive_profile": {
            "reading_level": "Có thể đọc câu ngắn và ví dụ mẫu, nhưng vẫn cần hình ảnh/que tính/bảng minh họa.",
            "learning_style": "Quan sát mô hình, đọc ví dụ mẫu, thao tác theo bước và làm thử một câu ngắn.",
            "ai_policy": "Không dùng Chat AI tự do; nếu dùng AI thì chỉ nên gợi ý từng bước khi học sinh làm sai.",
        },
        "chapters": chapters,
    }


# Hàm draw_wrapped dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def draw_wrapped(draw, text, xy, fnt, fill="#172033", width=42, spacing=8):
    x, y = xy
    for line in wrap_text(text, width):
        draw.text((x, y), line, font=fnt, fill=fill)
        y += fnt.size + spacing
    return y


# Hàm rounded dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def rounded(draw, box, fill, outline="#cbd5e1", width=3, radius=24):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


# Hàm draw_base_ten dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def draw_base_ten(draw, x, y, hundreds=0, tens=0, ones=0):
    for i in range(hundreds):
        bx = x + (i % 3) * 92
        by = y + (i // 3) * 86
        rounded(draw, (bx, by, bx + 74, by + 74), "#bfdbfe", "#1d4ed8", 2, 12)
        for k in range(1, 5):
            draw.line((bx + k * 14, by, bx + k * 14, by + 74), fill="#60a5fa", width=1)
            draw.line((bx, by + k * 14, bx + 74, by + k * 14), fill="#60a5fa", width=1)
    start_x = x + 300
    for i in range(tens):
        bx = start_x + i * 30
        rounded(draw, (bx, y, bx + 22, y + 150), "#fde68a", "#a16207", 2, 8)
    start_x2 = start_x + max(tens, 1) * 34 + 24
    for i in range(ones):
        ox = start_x2 + (i % 5) * 34
        oy = y + (i // 5) * 36
        rounded(draw, (ox, oy, ox + 22, oy + 22), "#bbf7d0", "#15803d", 2, 6)


# Hàm draw_groups dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def draw_groups(draw, x, y, groups=3, each=2, color="#60a5fa"):
    for g in range(groups):
        rounded(draw, (x + g * 160, y - 30, x + g * 160 + 120, y + 90), "#f8fafc", "#cbd5e1", 2, 18)
        for i in range(each):
            cx = x + g * 160 + 38 + i * 45
            draw.ellipse((cx - 16, y + 10, cx + 16, y + 42), fill=color, outline="#1d4ed8", width=2)


# Hàm render_lesson_image dùng để chuẩn bị và hiển thị kết quả cho người dùng; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def render_lesson_image(chapter_index, lesson_index, lesson):
    IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    img = Image.new("RGB", (1200, 675), "#f8fafc")
    draw = ImageDraw.Draw(img)
    rounded(draw, (35, 35, 1165, 640), "#ffffff", "#d0d7de", 3, 32)
    draw.text((80, 72), f"Lớp 2 - {lesson['lesson']}", font=font(34, True), fill="#0f172a")
    draw.line((80, 125, 1120, 125), fill="#e2e8f0", width=3)
    kind = lesson["kind"]
    ex = examples_for_kind(kind, lesson["lesson"])

    if kind == "number_line":
        y = 320
        draw.line((170, y, 1000, y), fill="#1d4ed8", width=6)
        for idx, n in enumerate(range(24, 31)):
            x = 190 + idx * 120
            draw.line((x, y - 25, x, y + 25), fill="#1d4ed8", width=4)
            draw.text((x - 15, y + 38), str(n), font=font(28, True), fill="#111827")
        draw.ellipse((190 + 4 * 120 - 32, y - 78, 190 + 4 * 120 + 32, y - 14), fill="#fde68a", outline="#a16207", width=4)
        draw.text((190 + 4 * 120 - 16, y - 70), "28", font=font(24, True), fill="#92400e")
    elif kind in ["addition", "subtraction", "place_value_1000"]:
        if "1000" in normalize(lesson["lesson"]) or kind == "place_value_1000":
            draw_base_ten(draw, 120, 230, 3, 2, 6)
            draw.text((710, 290), "326", font=font(74, True), fill="#1d4ed8")
        elif kind == "addition":
            draw_base_ten(draw, 120, 250, 0, 3, 8)
            draw.text((610, 300), "+", font=font(70, True), fill="#2563eb")
            draw_base_ten(draw, 710, 250, 0, 2, 7)
        else:
            draw_base_ten(draw, 120, 250, 0, 5, 2)
            draw.text((610, 300), "-", font=font(70, True), fill="#dc2626")
            draw_base_ten(draw, 710, 250, 0, 2, 8)
    elif kind in ["multiplication", "fact_table"]:
        draw_groups(draw, 155, 270, groups=3, each=2)
        draw.text((720, 285), "2 + 2 + 2", font=font(46, True), fill="#1d4ed8")
        draw.text((760, 360), "2 x 3", font=font(56, True), fill="#15803d")
    elif kind == "division":
        for i in range(6):
            cx = 250 + i * 60
            draw.ellipse((cx - 20, 250, cx + 20, 290), fill="#f97316", outline="#9a3412", width=2)
        for j in range(2):
            rounded(draw, (255 + j * 250, 390, 405 + j * 250, 500), "#e0f2fe", "#0369a1", 3, 24)
            for i in range(3):
                cx = 295 + j * 250 + i * 42
                draw.ellipse((cx - 15, 430, cx + 15, 460), fill="#f97316", outline="#9a3412", width=2)
        draw.text((780, 335), "6 : 2 = 3", font=font(54, True), fill="#1d4ed8")
    elif kind == "measurement":
        n = normalize(lesson["lesson"])
        if "kg" in n or "ki-lô-gam" in n:
            rounded(draw, (250, 260, 560, 455), "#fef3c7", "#a16207", 4, 24)
            draw.text((325, 320), "5 kg", font=font(58, True), fill="#92400e")
            draw.ellipse((680, 250, 910, 480), fill="#fca5a5", outline="#b91c1c", width=5)
        elif "lít" in n:
            rounded(draw, (280, 220, 460, 500), "#dbeafe", "#1d4ed8", 4, 22)
            draw.rectangle((300, 345, 440, 480), fill="#60a5fa")
            draw.text((650, 330), "3 l", font=font(64, True), fill="#1d4ed8")
        elif "giờ" in n or "tháng" in n:
            draw.ellipse((290, 190, 570, 470), fill="#ffffff", outline="#1e3a8a", width=6)
            draw.line((430, 330, 430, 220), fill="#2563eb", width=6)
            draw.line((430, 330, 500, 330), fill="#ef4444", width=8)
            draw.text((700, 300), "Lịch / đồng hồ", font=font(44, True), fill="#111827")
        else:
            rounded(draw, (170, 360, 950, 435), "#fef3c7", "#a16207", 4, 10)
            for i in range(11):
                x = 190 + i * 70
                draw.line((x, 360, x, 420), fill="#78350f", width=3)
    elif kind == "geometry":
        n = normalize(lesson["lesson"])
        if "tứ giác" in n:
            draw.polygon([(230, 260), (500, 220), (590, 430), (280, 500)], fill="#bfdbfe", outline="#1d4ed8")
            draw.text((690, 325), "4 cạnh", font=font(58, True), fill="#1d4ed8")
        elif "khối" in n:
            draw.rectangle((230, 260, 460, 480), fill="#93c5fd", outline="#1d4ed8", width=5)
            draw.ellipse((650, 240, 920, 510), fill="#fca5a5", outline="#b91c1c", width=5)
        else:
            draw.line((200, 300, 700, 300), fill="#1d4ed8", width=6)
            draw.arc((220, 360, 650, 500), 180, 360, fill="#dc2626", width=6)
            draw.line((760, 250, 860, 340), fill="#15803d", width=6)
            draw.line((860, 340, 960, 280), fill="#15803d", width=6)
    elif kind == "data":
        labels = ["A", "B", "C"]
        for i, count in enumerate([4, 6, 3]):
            x = 240 + i * 220
            for j in range(count):
                draw.rectangle((x, 500 - j * 42, x + 70, 532 - j * 42), fill="#93c5fd", outline="#1d4ed8", width=2)
            draw.text((x + 20, 545), labels[i], font=font(36, True), fill="#111827")
    elif kind == "probability":
        draw.text((150, 270), "Chắc chắn", font=font(40, True), fill="#15803d")
        draw.text((500, 270), "Có thể", font=font(40, True), fill="#ca8a04")
        draw.text((800, 270), "Không thể", font=font(40, True), fill="#dc2626")
        draw.ellipse((165, 350, 265, 450), fill="#facc15", outline="#a16207", width=4)
        draw.cloud = None
        draw.rectangle((520, 370, 640, 450), fill="#bfdbfe", outline="#1d4ed8", width=4)
        draw.line((850, 430, 1030, 330), fill="#64748b", width=6)
        draw.ellipse((950, 230, 1060, 340), fill="#60a5fa", outline="#1d4ed8", width=4)
    elif kind == "operation_parts":
        draw.text((260, 260), ex["model"].split(",")[0], font=font(48, True), fill="#1d4ed8")
        rounded(draw, (200, 390, 1000, 500), "#f8fafc", "#cbd5e1", 3, 22)
    else:
        draw_wrapped(draw, lesson["objective"], (135, 255), font(38, True), width=40)

    rounded(draw, (80, 540, 1120, 610), "#f1f5f9", None, 1, 18)
    draw_wrapped(draw, ex["model"], (110, 558), font(24, True), width=72, spacing=5)

    out = IMAGE_DIR / f"grade2-c{chapter_index:02d}-l{lesson_index:02d}.png"
    img.save(out)
    return out


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
    normal = doc.styles["Normal"]
    normal.font.name = "Arial"
    normal._element.rPr.rFonts.set(qn("w:eastAsia"), "Arial")
    normal.font.size = Pt(10.5)
    for style_name, size, color in [("Title", 22, "1F4E79"), ("Heading 1", 16, "1F4E79"), ("Heading 2", 13, "2F5597"), ("Heading 3", 11, "1F1F1F")]:
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
    r = p.add_run(str(value or ""))
    set_run_font(r)


# Hàm add_bullets dùng để tạo bản ghi hoặc tài nguyên mới sau khi kiểm tra đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def add_bullets(doc, items):
    for item in items:
        p = doc.add_paragraph(style="List Bullet")
        r = p.add_run(item)
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
    table = doc.add_table(rows=1, cols=4)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.style = "Table Grid"
    for i, h in enumerate(["STT", "Chương", "Số bài", "Số thẻ"]):
        set_cell_text(table.rows[0].cells[i], h, True)
        shade(table.rows[0].cells[i], "D9EAF7")
    for i, chapter in enumerate(data["chapters"], 1):
        row = table.add_row().cells
        values = [i, chapter["title"], len(chapter["lessons"]), sum(len(x["cards"]) for x in chapter["lessons"])]
        for j, value in enumerate(values):
            set_cell_text(row[j], value)
            row[j].vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.TOP


# Hàm build_docx dùng để xây dựng kết quả từ các nguồn dữ liệu và quy tắc liên quan; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def build_docx(data):
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    doc = Document()
    set_document_defaults(doc)
    title = doc.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = title.add_run("LÝ THUYẾT TOÁN LỚP 2")
    set_run_font(r, size=24, bold=True, color="1F4E79")
    subtitle = doc.add_paragraph()
    subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = subtitle.add_run("Bản học liệu theo thẻ có minh họa, đáp án và gợi ý sai - Codex")
    set_run_font(r, size=13, italic=True)

    add_meta(doc, "Nguồn tham khảo", data["source_textbook"])
    add_meta(doc, "Ghi chú", data["scope_note"])
    doc.add_heading("Định hướng thiết kế lớp 2", level=1)
    add_bullets(
        doc,
        [
            data["cognitive_profile"]["reading_level"],
            data["cognitive_profile"]["learning_style"],
            data["cognitive_profile"]["ai_policy"],
            "So với lớp 1, lớp 2 có thể đọc ví dụ mẫu dài hơn nhưng vẫn cần hình, que tính, sơ đồ và bước làm rõ ràng.",
        ],
    )
    doc.add_heading("Tổng quan nội dung", level=1)
    add_overview(doc, data)

    for chapter_index, chapter in enumerate(data["chapters"], 1):
        doc.add_page_break()
        doc.add_heading(f"Chương {chapter_index}: {chapter['title']}", level=1)
        for lesson_index, lesson in enumerate(chapter["lessons"], 1):
            image_path = render_lesson_image(chapter_index, lesson_index, lesson)
            doc.add_heading(f"{chapter_index}.{lesson_index}. {lesson['lesson']}", level=2)
            p = doc.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p.add_run().add_picture(str(image_path), width=Inches(6.6))
            add_meta(doc, "Mục tiêu bài học", lesson["objective"])
            add_meta(doc, "Dạng minh họa", lesson["cards"][0]["visual_prompt"])
            for card_index, card in enumerate(lesson["cards"], 1):
                doc.add_heading(f"Thẻ {card_index}: {card['title']}", level=3)
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


# Hàm main dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def main():
    data = build_blueprint()
    BLUEPRINT_PATH.parent.mkdir(parents=True, exist_ok=True)
    BLUEPRINT_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    output = build_docx(data)
    print(BLUEPRINT_PATH)
    print(output)


# Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
if __name__ == "__main__":
    main()
