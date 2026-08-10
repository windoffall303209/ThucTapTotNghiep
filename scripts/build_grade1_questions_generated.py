# Script build grade1 questions generated h? tr? nh?p, xu?t, ki?m tra ho?c b?o tr? d? li?u v? c?u h?nh c?a d? ?n.
import json
import math
import sys
from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Inches, Pt, RGBColor
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import build_grade2_theory_docx_detailed as base  # noqa: E402


BLUEPRINT_PATH = ROOT / "content-theory" / "grade-1-theory-blueprint.json"
OUTPUT_DIR = ROOT / "output" / "doc"
IMAGE_DIR = OUTPUT_DIR / "grade1_question_images_generated"
JSON_PATH = OUTPUT_DIR / "grade-1-generated-questions.json"
DOCX_PATH = OUTPUT_DIR / "cau-hoi-lop-1-codex.docx"
FALLBACK_DOCX_PATH = OUTPUT_DIR / "cau-hoi-lop-1-codex-fixed.docx"


# H?m norm d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def norm(text):
    return base.norm(text)


# H?m question_id d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def question_id(chapter_index, lesson_index, q_index):
    return 100000 + chapter_index * 1000 + lesson_index * 10 + q_index


# H?m classify_lesson d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def classify_lesson(name):
    n = norm(name)
    if "tren - duoi" in n:
        return "position"
    if "hinh vuong" in n and "hinh tron" in n:
        return "shapes"
    if "1, 2, 3" in n:
        return "count_1_3"
    if "4, 5, 6" in n:
        return "count_4_6"
    if "7, 8, 9" in n:
        return "count_7_9"
    if "so 0" in n:
        return "zero"
    if "so 10" in n:
        return "ten"
    if "nhieu hon" in n:
        return "more_less_equal"
    if "be hon" in n or "dau <" in n:
        return "compare_sign"
    if "khoi hop" in n:
        return "solids"
    if "phep cong" in n or "dau cong" in n or "14 + 3" in n or "25 + 14" in n or "25 + 4" in n:
        return "addition_100" if any(x in n for x in ["14 + 3", "25 + 14", "25 + 4"]) else "addition_10"
    if "phep tru" in n or "dau tru" in n or "17 - 2" in n or "39 - 15" in n or "27 - 4" in n:
        return "subtraction_100" if any(x in n for x in ["17 - 2", "39 - 15", "27 - 4"]) else "subtraction_10"
    if "cac so den 100" in n or "hai chu so" in n:
        return "numbers_100"
    if "chuc va don vi" in n:
        return "tens_ones"
    if "so sanh cac so" in n:
        return "compare_100"
    if "dai hon" in n:
        return "length_compare"
    if "do do dai" in n or "xang-ti-met" in n:
        return "measure_cm"
    if "ngay trong tuan" in n:
        return "weekdays"
    if "dong ho" in n:
        return "clock"
    if "tron chuc" in n:
        return "tens_operation"
    return "count_1_3"


# H?m choices d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def choices(correct, distractors, offset=0):
    values = [correct] + [d for d in distractors if str(d) != str(correct)]
    values = values[:4]
    if values:
        offset = offset % len(values)
        values = values[offset:] + values[:offset]
    keys = ["A", "B", "C", "D"]
    correct_key = keys[values.index(correct)]
    return [{"key": k, "text": str(v)} for k, v in zip(keys, values)], correct_key


# H?m make_mc d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def make_mc(chapter, lesson, q_index, qtype, text, correct, distractors, explanation, data, difficulty="EASY"):
    offset = chapter["chapter_index"] + lesson["lesson_index"] + q_index
    opts, answer = choices(correct, distractors, offset=offset)
    return {
        "id": question_id(chapter["chapter_index"], lesson["lesson_index"], q_index),
        "grade": 1,
        "chapter_index": chapter["chapter_index"],
        "chapter_title": chapter["title"],
        "lesson_index": lesson["lesson_index"],
        "lesson": lesson["lesson"],
        "skill": classify_lesson(lesson["lesson"]),
        "question_type": "MULTIPLE_CHOICE",
        "difficulty": difficulty,
        "layout_template": "IMAGE_TOP_CHOICES_BOTTOM",
        "content": {"text": text, "images": []},
        "choices": opts,
        "correct_answer": answer,
        "answer_text": str(correct),
        "explanation": {"text": explanation, "images": []},
        "visual_type": qtype,
        "visual_data": data,
    }


# H?m build_questions_for_lesson d?ng ?? x?y d?ng k?t qu? t? c?c ngu?n d? li?u v? quy t?c li?n quan; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def build_questions_for_lesson(chapter, lesson):
    k = classify_lesson(lesson["lesson"])
    qs = []
    if k == "position":
        qs = [
            make_mc(chapter, lesson, 1, "position", "Vật nào ở trên bàn?", "Quyển sách", ["Cặp sách", "Quả bóng", "Cây"], "Quyển sách nằm ở trên mặt bàn.", {"ask": "book"}),
            make_mc(chapter, lesson, 2, "position", "Cặp sách ở đâu?", "Dưới bàn", ["Trên bàn", "Bên trái bạn", "Trước bàn"], "Cặp sách nằm dưới bàn học.", {"ask": "bag"}),
            make_mc(chapter, lesson, 3, "position", "Quả bóng ở bên nào của bạn nhỏ?", "Bên phải", ["Bên trái", "Phía sau", "Ở trên"], "Trong tranh, quả bóng ở bên phải bạn nhỏ.", {"ask": "ball"}),
        ]
    elif k == "shapes":
        qs = [
            make_mc(chapter, lesson, 1, "shapes", "Đồng hồ có dạng hình gì?", "Hình tròn", ["Hình vuông", "Hình tam giác", "Hình chữ nhật"], "Đồng hồ trong tranh là hình tròn.", {"target": "circle"}),
            make_mc(chapter, lesson, 2, "shapes", "Có mấy hình tam giác?", "2", ["1", "3", "4"], "Trong tranh có 2 hình tam giác.", {"target": "triangle", "count": 2}),
            make_mc(chapter, lesson, 3, "shapes", "Hình nào có 4 cạnh bằng nhau?", "Hình vuông", ["Hình tròn", "Hình tam giác", "Hình chữ nhật"], "Hình vuông có 4 cạnh bằng nhau.", {"target": "square"}),
        ]
    elif k in {"count_1_3", "count_4_6", "count_7_9", "zero", "ten"}:
        ranges = {
            "count_1_3": [1, 2, 3],
            "count_4_6": [4, 5, 6],
            "count_7_9": [7, 8, 9],
            "zero": [0, 0, 0],
            "ten": [10, 10, 10],
        }[k]
        labels = ["quả táo", "ngôi sao", "viên bi"]
        for i, count in enumerate(ranges, 1):
            distract = [max(0, count - 1), count + 1, count + 2]
            qs.append(make_mc(chapter, lesson, i, "count", f"Có mấy {labels[i-1]}?", str(count), [str(x) for x in distract], f"Đếm từng hình, có {count} {labels[i-1]}.", {"count": count, "item": labels[i-1]}))
    elif k == "more_less_equal":
        qs = [
            make_mc(chapter, lesson, 1, "compare_groups", "Nhóm nào nhiều hơn?", "Nhóm bên trái", ["Nhóm bên phải", "Hai nhóm bằng nhau", "Không có nhóm nào"], "Bên trái có 5 quả, bên phải có 3 quả nên bên trái nhiều hơn.", {"left": 5, "right": 3}),
            make_mc(chapter, lesson, 2, "compare_groups", "Nhóm nào ít hơn?", "Nhóm bên phải", ["Nhóm bên trái", "Hai nhóm bằng nhau", "Không biết"], "Bên phải có 3 quả, ít hơn 5 quả bên trái.", {"left": 5, "right": 3}),
            make_mc(chapter, lesson, 3, "compare_groups", "Hai nhóm như thế nào?", "Bằng nhau", ["Bên trái nhiều hơn", "Bên phải nhiều hơn", "Bên trái ít hơn"], "Mỗi bên có 4 quả nên hai nhóm bằng nhau.", {"left": 4, "right": 4}),
        ]
    elif k == "compare_sign":
        pairs = [(3, 5, "<"), (6, 6, "="), (2, 4, "<")]
        for i, (a, b, sign) in enumerate(pairs, 1):
            qs.append(make_mc(chapter, lesson, i, "compare_numbers", f"Điền dấu đúng: {a} ... {b}", sign, ["=", ">", "<"], f"So sánh {a} và {b}, ta có {a} {sign} {b}.", {"a": a, "b": b}))
    elif k == "addition_10":
        facts = [(2, 3), (4, 2), (5, 4)]
        for i, (a, b) in enumerate(facts, 1):
            s = a + b
            qs.append(make_mc(chapter, lesson, i, "operation", f"{a} + {b} = ?", str(s), [str(max(0, s-1)), str(s+1), str(s+2)], f"Gộp {a} và {b}, được {s}.", {"op": "+", "a": a, "b": b}))
    elif k == "subtraction_10":
        facts = [(5, 2), (6, 4), (9, 3)]
        for i, (a, b) in enumerate(facts, 1):
            r = a - b
            qs.append(make_mc(chapter, lesson, i, "operation", f"{a} - {b} = ?", str(r), [str(max(0, r-1)), str(r+1), str(r+2)], f"Bớt {b} từ {a}, còn {r}.", {"op": "-", "a": a, "b": b}))
    elif k == "solids":
        qs = [
            make_mc(chapter, lesson, 1, "solids", "Hộp sữa giống khối nào?", "Khối hộp chữ nhật", ["Khối lập phương", "Hình tròn", "Hình tam giác"], "Hộp sữa có dạng khối hộp chữ nhật.", {"target": "box"}),
            make_mc(chapter, lesson, 2, "solids", "Xúc xắc giống khối nào?", "Khối lập phương", ["Khối hộp chữ nhật", "Hình chữ nhật", "Hình tròn"], "Xúc xắc có dạng khối lập phương.", {"target": "cube"}),
            make_mc(chapter, lesson, 3, "solids", "Khối nào có các mặt đều là hình vuông?", "Khối lập phương", ["Khối hộp chữ nhật", "Hình tam giác", "Hình tròn"], "Khối lập phương có các mặt là hình vuông.", {"target": "cube"}),
        ]
    elif k in {"numbers_100", "tens_ones"}:
        nums = [24, 37, 58] if k == "numbers_100" else [32, 45, 60]
        for i, n in enumerate(nums, 1):
            tens, ones = divmod(n, 10)
            qs.append(make_mc(chapter, lesson, i, "place_value", f"Số {n} gồm mấy chục và mấy đơn vị?", f"{tens} chục, {ones} đơn vị", [f"{ones} chục, {tens} đơn vị", f"{tens+1} chục, {ones} đơn vị", f"{tens} chục, {ones+1} đơn vị"], f"Số {n} có {tens} chục và {ones} đơn vị.", {"number": n}))
    elif k == "compare_100":
        pairs = [(42, 37, ">"), (58, 63, "<"), (70, 70, "=")]
        for i, (a, b, sign) in enumerate(pairs, 1):
            qs.append(make_mc(chapter, lesson, i, "compare_numbers", f"Điền dấu đúng: {a} ... {b}", sign, ["<", ">", "="], f"So sánh theo chục rồi đơn vị: {a} {sign} {b}.", {"a": a, "b": b}))
    elif k in {"length_compare", "measure_cm"}:
        qs = [
            make_mc(chapter, lesson, 1, "length", "Bút nào dài hơn?", "Bút màu xanh", ["Bút màu đỏ", "Hai bút bằng nhau", "Không biết"], "Bút màu xanh dài hơn bút màu đỏ.", {"mode": "compare"}),
            make_mc(chapter, lesson, 2, "measure", "Đoạn thẳng dài mấy xăng-ti-mét?", "5 cm", ["4 cm", "6 cm", "7 cm"], "Đếm từ vạch 0 đến vạch 5, đoạn thẳng dài 5 cm.", {"length": 5}),
            make_mc(chapter, lesson, 3, "measure", "Đoạn thẳng dài 7 cm kết thúc ở vạch nào?", "Vạch 7", ["Vạch 5", "Vạch 6", "Vạch 8"], "Bắt đầu ở 0, dài 7 cm thì kết thúc ở vạch 7.", {"length": 7}),
        ]
    elif k == "addition_100":
        facts = [(14, 3), (25, 14), (25, 40)]
        for i, (a, b) in enumerate(facts, 1):
            s = a + b
            qs.append(make_mc(chapter, lesson, i, "operation_100", f"{a} + {b} = ?", str(s), [str(s-1), str(s+1), str(s+10)], f"Cộng chục với chục, đơn vị với đơn vị, được {s}.", {"op": "+", "a": a, "b": b}))
    elif k == "subtraction_100":
        facts = [(17, 2), (39, 15), (63, 40)]
        for i, (a, b) in enumerate(facts, 1):
            r = a - b
            qs.append(make_mc(chapter, lesson, i, "operation_100", f"{a} - {b} = ?", str(r), [str(r-1), str(r+1), str(r+10)], f"Trừ chục với chục, đơn vị với đơn vị, được {r}.", {"op": "-", "a": a, "b": b}))
    elif k == "tens_operation":
        facts = [(20, 30, "+"), (70, 20, "-"), (40, 40, "+")]
        for i, (a, b, op) in enumerate(facts, 1):
            r = a + b if op == "+" else a - b
            qs.append(make_mc(chapter, lesson, i, "operation_100", f"{a} {op} {b} = ?", str(r), [str(r-10), str(r+10), str(max(0, r-20))], f"Tính với các chục tròn, được {r}.", {"op": op, "a": a, "b": b}))
    elif k == "weekdays":
        qs = [
            make_mc(chapter, lesson, 1, "week", "Sau thứ Hai là thứ mấy?", "Thứ Ba", ["Thứ Tư", "Chủ nhật", "Thứ Sáu"], "Trong tuần, sau thứ Hai là thứ Ba.", {"highlight": "Thứ Ba"}),
            make_mc(chapter, lesson, 2, "week", "Trước thứ Sáu là thứ mấy?", "Thứ Năm", ["Thứ Tư", "Thứ Bảy", "Chủ nhật"], "Trước thứ Sáu là thứ Năm.", {"highlight": "Thứ Năm"}),
            make_mc(chapter, lesson, 3, "week", "Một tuần có mấy ngày?", "7 ngày", ["5 ngày", "6 ngày", "8 ngày"], "Một tuần có 7 ngày.", {"highlight": "7 ngày"}),
        ]
    elif k == "clock":
        qs = [
            make_mc(chapter, lesson, 1, "clock", "Đồng hồ chỉ mấy giờ?", "3 giờ", ["2 giờ", "4 giờ", "6 giờ"], "Kim dài chỉ 12, kim ngắn chỉ 3 nên là 3 giờ.", {"hour": 3}),
            make_mc(chapter, lesson, 2, "clock", "Đồng hồ chỉ mấy giờ?", "7 giờ", ["6 giờ", "8 giờ", "9 giờ"], "Kim dài chỉ 12, kim ngắn chỉ 7 nên là 7 giờ.", {"hour": 7}),
            make_mc(chapter, lesson, 3, "clock", "Kim dài chỉ số nào khi đúng giờ?", "Số 12", ["Số 3", "Số 6", "Số 9"], "Khi đúng giờ, kim dài chỉ số 12.", {"hour": 9}),
        ]
    else:
        qs = [make_mc(chapter, lesson, i, "count", "Có mấy quả táo?", str(i), [str(i+1), str(i+2), str(max(0, i-1))], f"Đếm được {i} quả táo.", {"count": i, "item": "quả táo"}) for i in range(1, 4)]
    return qs


# H?m draw_item d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def draw_item(draw, cx, cy, item, scale=1.0):
    if "táo" in item or "quả" in item:
        base.draw_apple(draw, cx, cy, scale)
    elif "sao" in item:
        pts = []
        for i in range(10):
            angle = math.radians(-90 + i * 36)
            r = 22 * scale if i % 2 == 0 else 10 * scale
            pts.append((cx + math.cos(angle) * r, cy + math.sin(angle) * r))
        draw.polygon(pts, fill="#facc15", outline="#a16207")
    else:
        draw.ellipse((cx-18*scale, cy-18*scale, cx+18*scale, cy+18*scale), fill="#60a5fa", outline="#1d4ed8", width=2)


# H?m draw_question_image d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def draw_question_image(q):
    IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    img = Image.new("RGB", (1000, 560), "#f8fafc")
    draw = ImageDraw.Draw(img)
    base.rounded(draw, (28, 28, 972, 532), "#ffffff", "#cbd5e1", 3, 26)
    draw.text((60, 54), "Toán lớp 1", font=base.font(24, True), fill="#1f4e79")
    base.draw_wrapped(draw, q["content"]["text"], (60, 95), base.font(30, True), fill="#0f172a", width=48, spacing=7)
    vt, data = q["visual_type"], q["visual_data"]
    if vt == "position":
        draw.rectangle((360, 210, 690, 300), fill="#fef3c7", outline="#a16207", width=4)
        draw.rectangle((410, 300, 440, 430), fill="#94a3b8")
        draw.rectangle((620, 300, 650, 430), fill="#94a3b8")
        base.label_box(draw, (460, 220, 590, 275), "Sách", "#dcfce7", "#15803d", "#166534", 22)
        base.label_box(draw, (465, 355, 585, 420), "Cặp", "#dbeafe", "#1d4ed8", "#1e3a8a", 22)
        base.draw_person(draw, 185, 245, "Bạn")
        draw.ellipse((740, 355, 810, 425), fill="#facc15", outline="#a16207", width=3)
        draw.text((742, 430), "Bóng", font=base.font(18, True), fill="#0f172a")
    elif vt == "shapes":
        draw.ellipse((150, 245, 270, 365), fill="#fde68a", outline="#a16207", width=4)
        draw.rectangle((340, 245, 460, 365), fill="#bfdbfe", outline="#1d4ed8", width=4)
        draw.polygon([(570, 365), (640, 245), (710, 365)], fill="#fecaca", outline="#dc2626")
        draw.rectangle((780, 260, 930, 345), fill="#dcfce7", outline="#15803d", width=4)
        draw.text((155, 385), "tròn", font=base.font(21, True), fill="#0f172a")
    elif vt == "count":
        count, item = data["count"], data["item"]
        for i in range(count):
            draw_item(draw, 180 + (i % 10) * 70, 275 + (i // 10) * 70, item, 0.9)
        if count == 0:
            draw.text((330, 300), "Không có đồ vật nào", font=base.font(36, True), fill="#dc2626")
    elif vt == "compare_groups":
        for i in range(data["left"]):
            draw_item(draw, 160 + (i % 5) * 55, 280 + (i // 5) * 55, "quả táo", 0.7)
        for i in range(data["right"]):
            draw_item(draw, 620 + (i % 5) * 55, 280 + (i // 5) * 55, "quả táo", 0.7)
        draw.text((180, 425), "Bên trái", font=base.font(25, True), fill="#1d4ed8")
        draw.text((640, 425), "Bên phải", font=base.font(25, True), fill="#dc2626")
    elif vt == "compare_numbers":
        draw.text((360, 265), f"{data['a']}   ...   {data['b']}", font=base.font(70, True), fill="#0f172a")
    elif vt in {"operation", "operation_100"}:
        a, b, op = data["a"], data["b"], data["op"]
        draw.text((330, 250), f"{a} {op} {b} = ?", font=base.font(70, True), fill="#1d4ed8")
        if vt == "operation":
            for i in range(a):
                draw_item(draw, 110 + i * 45, 405, "quả táo", 0.55)
            draw.text((110 + a * 45, 392), op, font=base.font(34, True), fill="#0f172a")
            for i in range(b):
                draw_item(draw, 180 + a * 45 + i * 45, 405, "quả táo", 0.55)
        # H?m number_blocks d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
        else:
            def number_blocks(n, x, y, label):
                tens, ones = divmod(n, 10)
                draw.text((x, y - 32), label, font=base.font(20, True), fill="#0f172a")
                for i in range(tens):
                    base.rounded(draw, (x + i * 24, y, x + 18 + i * 24, y + 115), "#fde68a", "#a16207", 2, 6)
                ox = x + max(tens, 1) * 28 + 20
                for i in range(ones):
                    base.rounded(draw, (ox + (i % 5) * 28, y + (i // 5) * 30, ox + 20 + (i % 5) * 28, y + 20 + (i // 5) * 30), "#bbf7d0", "#15803d", 2, 5)
            number_blocks(a, 135, 390, f"Số {a}")
            draw.text((460, 430), op, font=base.font(38, True), fill="#0f172a")
            number_blocks(b, 540, 390, f"Số {b}")
    elif vt == "solids":
        draw.rectangle((170, 280, 360, 430), fill="#bfdbfe", outline="#1d4ed8", width=4)
        draw.polygon([(170, 280), (230, 230), (420, 230), (360, 280)], fill="#dbeafe", outline="#1d4ed8")
        draw.rectangle((570, 260, 730, 420), fill="#dcfce7", outline="#15803d", width=4)
        draw.text((170, 455), "Khối hộp chữ nhật", font=base.font(24, True), fill="#1d4ed8")
        draw.text((565, 455), "Khối lập phương", font=base.font(24, True), fill="#15803d")
    elif vt == "place_value":
        n = data["number"]
        tens, ones = divmod(n, 10)
        for i in range(tens):
            base.rounded(draw, (130 + i * 34, 250, 154 + i * 34, 430), "#fde68a", "#a16207", 2, 8)
        for i in range(ones):
            base.rounded(draw, (560 + (i % 5) * 45, 285 + (i // 5) * 45, 590 + (i % 5) * 45, 315 + (i // 5) * 45), "#bbf7d0", "#15803d", 2, 7)
        draw.text((155, 455), f"{tens} chục", font=base.font(25, True), fill="#92400e")
        draw.text((570, 455), f"{ones} đơn vị", font=base.font(25, True), fill="#166534")
    elif vt == "length":
        draw.line((170, 300, 720, 300), fill="#1d4ed8", width=12)
        draw.line((170, 390, 530, 390), fill="#dc2626", width=12)
        draw.text((740, 285), "Bút xanh", font=base.font(25, True), fill="#1d4ed8")
        draw.text((550, 375), "Bút đỏ", font=base.font(25, True), fill="#dc2626")
    elif vt == "measure":
        length = data["length"]
        draw.line((160, 360, 850, 360), fill="#a16207", width=5)
        for i in range(0, 9):
            x = 170 + i * 75
            draw.line((x, 330, x, 390), fill="#78350f", width=3)
            draw.text((x-8, 405), str(i), font=base.font(20, True), fill="#0f172a")
        draw.line((170, 280, 170 + length * 75, 280), fill="#1d4ed8", width=8)
    elif vt == "week":
        days = ["Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ nhật"]
        for i, day in enumerate(days):
            x = 75 + i * 125
            fill = "#dcfce7" if day == data.get("highlight") else "#f8fafc"
            base.label_box(draw, (x, 260, x + 105, 335), day, fill, "#94a3b8", "#0f172a", 16)
    elif vt == "clock":
        h = data["hour"]
        cx, cy, r = 500, 330, 145
        draw.ellipse((cx-r, cy-r, cx+r, cy+r), fill="#ffffff", outline="#1e3a8a", width=6)
        for num in range(1, 13):
            ang = math.radians(num * 30 - 90)
            base.draw_center(draw, (cx + math.cos(ang) * 112, cy + math.sin(ang) * 112), str(num), base.font(18, True), "#0f172a")
        draw.line((cx, cy, cx, cy-r+30), fill="#2563eb", width=6)
        ang = math.radians(h * 30 - 90)
        draw.line((cx, cy, cx + math.cos(ang)*75, cy + math.sin(ang)*75), fill="#dc2626", width=8)
    out = IMAGE_DIR / f"q{q['id']}.png"
    img.save(out)
    rel = str(out.relative_to(ROOT)).replace("\\", "/")
    q["image_path"] = str(out)
    q["content"]["images"] = [{"id": "question_image_1", "url": rel, "alt": "Hình minh họa câu hỏi", "width_percent": 90}]
    return out


# H?m load_lessons d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def load_lessons():
    data = json.loads(BLUEPRINT_PATH.read_text(encoding="utf-8"))
    chapters = []
    for ci, chapter in enumerate(data["chapters"], 1):
        lessons = []
        for li, lesson in enumerate(chapter["lessons"], 1):
            lessons.append({"lesson_index": li, "lesson": lesson["lesson"]})
        chapters.append({"chapter_index": ci, "title": chapter["title"], "lessons": lessons})
    return chapters


# H?m set_doc_defaults d?ng ?? c?p nh?t tr?ng th?i ho?c d? li?u theo quy t?c nghi?p v?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def set_doc_defaults(doc):
    base.set_defaults(doc)
    for style_name in ["Normal", "Heading 1", "Heading 2", "Heading 3"]:
        style = doc.styles[style_name]
        style.font.name = "Arial"


# H?m add_run d?ng ?? t?o b?n ghi ho?c t?i nguy?n m?i sau khi ki?m tra ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def add_run(p, text, bold=False, size=10.5, color=None):
    r = p.add_run(text)
    r.font.name = "Arial"
    r.font.size = Pt(size)
    r.bold = bold
    if color:
        r.font.color.rgb = RGBColor.from_string(color)
    return r


# H?m build_docx d?ng ?? x?y d?ng k?t qu? t? c?c ngu?n d? li?u v? quy t?c li?n quan; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def build_docx(chapters, questions):
    doc = Document()
    set_doc_defaults(doc)
    title = doc.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    add_run(title, "NGÂN HÀNG CÂU HỎI TOÁN LỚP 1", True, 22, "1F4E79")
    sub = doc.add_paragraph()
    sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
    add_run(sub, "Bản tự tạo có ảnh minh họa, đáp án và lời giải - Codex", False, 12)
    p = doc.add_paragraph()
    add_run(p, f"Tổng số câu: {len(questions)}. Mỗi bài học có 3 câu hỏi minh họa.", True)
    by_chapter = {}
    for q in questions:
        by_chapter.setdefault(q["chapter_index"], []).append(q)
    for chapter in chapters:
        doc.add_page_break()
        doc.add_heading(f"Chương {chapter['chapter_index']}: {chapter['title']}", level=1)
        by_lesson = {}
        for q in by_chapter.get(chapter["chapter_index"], []):
            by_lesson.setdefault(q["lesson_index"], []).append(q)
        for lesson in chapter["lessons"]:
            doc.add_heading(f"{chapter['chapter_index']}.{lesson['lesson_index']}. {lesson['lesson']}", level=2)
            for q in by_lesson.get(lesson["lesson_index"], []):
                doc.add_heading(f"Câu {q['id']}", level=3)
                p = doc.add_paragraph()
                add_run(p, q["content"]["text"], True, 11)
                p = doc.add_paragraph()
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                p.add_run().add_picture(q["image_path"], width=Inches(5.8))
                for choice in q["choices"]:
                    p = doc.add_paragraph(style="List Bullet")
                    add_run(p, f"{choice['key']}. {choice['text']}")
                p = doc.add_paragraph()
                add_run(p, f"Đáp án: {q['correct_answer']} - {q['answer_text']}", True, 10.5, "1F7A1F")
                p = doc.add_paragraph()
                add_run(p, f"Lời giải: {q['explanation']['text']}")
    try:
        doc.save(DOCX_PATH)
        return DOCX_PATH
    except PermissionError:
        doc.save(FALLBACK_DOCX_PATH)
        return FALLBACK_DOCX_PATH


# H?m build_contact_sheets d?ng ?? x?y d?ng k?t qu? t? c?c ngu?n d? li?u v? quy t?c li?n quan; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def build_contact_sheets():
    paths = sorted(IMAGE_DIR.glob("q*.png"))
    cols = 5
    outs = []
    for start in range(0, len(paths), 60):
        chunk = paths[start:start + 60]
        rows = math.ceil(len(chunk) / cols)
        sheet = Image.new("RGB", (cols * 220, rows * 160), "#ffffff")
        draw = ImageDraw.Draw(sheet)
        for i, path in enumerate(chunk):
            img = Image.open(path).resize((220, 123))
            x, y = (i % cols) * 220, (i // cols) * 160
            sheet.paste(img, (x, y))
            draw.text((x + 6, y + 128), path.stem, font=base.font(15, True), fill="#0f172a")
        out = IMAGE_DIR / f"contact-sheet-{start + 1}-{start + len(chunk)}.png"
        sheet.save(out)
        outs.append(out)
    return outs


# H?m main d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    chapters = load_lessons()
    questions = []
    for chapter in chapters:
        for lesson in chapter["lessons"]:
            questions.extend(build_questions_for_lesson(chapter, lesson))
    for q in questions:
        draw_question_image(q)
    JSON_PATH.write_text(json.dumps({"grade": 1, "source": "generated_by_codex", "question_count": len(questions), "questions": questions}, ensure_ascii=False, indent=2), encoding="utf-8")
    docx = build_docx(chapters, questions)
    sheets = build_contact_sheets()
    print(JSON_PATH)
    print(docx)
    for sheet in sheets:
        print(sheet)
    print(f"questions={len(questions)}")
    print(f"images={len(list(IMAGE_DIR.glob('q*.png')))}")


# Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u hi?n t?i.
if __name__ == "__main__":
    main()
