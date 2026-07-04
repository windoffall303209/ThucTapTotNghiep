import argparse
import copy
import json
import re
import sys
from pathlib import Path


sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "output" / "doc"
DEFAULT_INPUT = OUTPUT_DIR / "crawled_questions_structured_with_explanation_images_normalized.json"
DEFAULT_OUTPUT = OUTPUT_DIR / "crawled_questions_structured_with_explanation_images_rewritten.json"
DEFAULT_REPORT = OUTPUT_DIR / "question_content_rewrite_report.json"

TARGET_GRADES = {2, 3, 4}
CHOICE_KEYS = ["A", "B", "C", "D"]

ANGLE_INLINE_PATTERN = re.compile(
    r"\b([Gg]óc)\s+([A-Za-z](?:['’′])?[A-Za-z](?:['’′])?[A-Za-z](?:['’′])?)\b"
)
ANGLE_WORD_PATTERN = re.compile(
    r"(?<![A-Za-z0-9\\{])\b([A-Z][A-Z][A-Z]|[a-z][A-Z][a-z]|[A-Za-z]['’′][A-Za-z][A-Za-z]['’′]?)\b"
)


def latex_angle(value):
    normalized = value.replace("’", "'").replace("′", "'")
    return f"$\\widehat{{{normalized}}}$"


def normalize_plain_angle_text(value):
    if not isinstance(value, str) or not value:
        return value

    def repl_angle(match):
        label, angle = match.groups()
        if angle.startswith("\\widehat"):
            return match.group(0)
        return f"{label} {latex_angle(angle)}"

    current = ANGLE_INLINE_PATTERN.sub(repl_angle, value)
    return current


def split_sentences(value):
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    text = re.sub(r"\s*([.;:])\s*", r"\1 ", text)
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return []

    parts = re.split(r"(?<=[.!?])\s+|(?<=;)\s+|(?=\+\s)|(?=•\s)", text)
    return [part.strip(" •") for part in parts if part.strip(" •")]


def strip_prompt_prefix(text):
    current = re.sub(r"^\s*Con hãy (?:chọn|lựa chọn)[^.?!]*?\s+", "", str(text or ""), flags=re.I)
    current = re.sub(r"^\s*Em hãy (?:chọn|lựa chọn)[^.?!]*?\s+", "", current, flags=re.I)
    return current.strip()


def choice_text(question, key):
    for choice in question.get("choices") or []:
        if choice.get("key") == key:
            return str(choice.get("text") or "").strip()
    return ""


def set_choices(question, values, correct_value):
    choices = []
    correct_key = "A"
    for key, value in zip(CHOICE_KEYS, values):
        text = str(value)
        choices.append({"key": key, "text": text})
        if text == str(correct_value):
            correct_key = key
    question["choices"] = choices
    question["correct_answer"] = correct_key


def number_to_vietnamese(n):
    n = int(n)
    units = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"]
    tens = ["", "mười", "hai mươi", "ba mươi", "bốn mươi", "năm mươi", "sáu mươi", "bảy mươi", "tám mươi", "chín mươi"]
    if n < 10:
        return units[n]
    if n < 20:
        if n == 10:
            return "mười"
        if n == 15:
            return "mười lăm"
        return "mười " + units[n % 10]
    if n < 100:
        ten, unit = divmod(n, 10)
        if unit == 0:
            return tens[ten]
        if unit == 1:
            return tens[ten] + " mốt"
        if unit == 4:
            return tens[ten] + " tư"
        if unit == 5:
            return tens[ten] + " lăm"
        return tens[ten] + " " + units[unit]
    if n < 1000:
        hundred, rest = divmod(n, 100)
        prefix = units[hundred] + " trăm"
        if rest == 0:
            return prefix
        if rest < 10:
            return prefix + " linh " + units[rest]
        return prefix + " " + number_to_vietnamese(rest)
    return str(n)


def title_case_vietnamese(value):
    return value[:1].upper() + value[1:] if value else value


def deterministic_delta(question, lesson, modulo=9, minimum=1):
    seed = int(question.get("number") or 0) + int(lesson.get("grade") or 0) * 7 + len(str(lesson.get("title") or ""))
    return minimum + (seed % modulo)


def make_unique_numeric_choices(correct, spread=3, minimum=0):
    correct = int(correct)
    candidates = [correct, correct - 1, correct + 1, correct + spread, correct - spread]
    values = []
    for value in candidates:
        if value < minimum:
            continue
        if value not in values:
            values.append(value)
        if len(values) == 4:
            break
    while len(values) < 4:
        next_value = max(minimum, correct + len(values) + 2)
        if next_value not in values:
            values.append(next_value)
    return [str(value) for value in values[:4]]


def format_number_with_unit(value, unit=""):
    return f"{value} {unit}".strip()


def make_numeric_choices_with_unit(correct, unit="", spread=3, minimum=0):
    return [format_number_with_unit(value, unit) for value in make_unique_numeric_choices(correct, spread, minimum)]


def rewrite_read_number(question, lesson):
    text = question.get("text") or ""
    match = re.search(r"Số\s+(\d{2,3})\s+được đọc là", text, flags=re.I)
    if not match:
        return None
    old_number = int(match.group(1))
    delta = deterministic_delta(question, lesson, modulo=37, minimum=6)
    new_number = old_number + delta
    if old_number < 100:
        new_number = 10 + (new_number % 89)
    elif old_number < 1000:
        new_number = 100 + (new_number % 899)
    else:
        return None

    correct = title_case_vietnamese(number_to_vietnamese(new_number))
    wrong_numbers = [max(0, new_number - 10), new_number + 10, int(str(new_number)[::-1]) if new_number < 100 else new_number + 1]
    wrongs = []
    for item in wrong_numbers:
        if item == new_number:
            continue
        value = title_case_vietnamese(number_to_vietnamese(item))
        if value not in wrongs and value != correct:
            wrongs.append(value)
    while len(wrongs) < 3:
        candidate = title_case_vietnamese(number_to_vietnamese(new_number + len(wrongs) + 2))
        if candidate != correct and candidate not in wrongs:
            wrongs.append(candidate)

    values = [wrongs[0], wrongs[1], correct, wrongs[2]]
    question["text"] = text[:match.start(1)] + str(new_number) + text[match.end(1):]
    set_choices(question, values, correct)
    question["explanation"] = (
        f"Số {new_number} có chữ số hàng chục là {new_number // 10 if new_number < 100 else (new_number // 10) % 10} "
        f"và chữ số hàng đơn vị là {new_number % 10}.\n"
        f"Khi đọc số này, ta đọc là “{number_to_vietnamese(new_number)}”.\n"
        f"Vì vậy đáp án đúng là {question['correct_answer']}."
    )
    return "read_number"


def rewrite_neighbor_number(question, lesson):
    text = question.get("text") or ""
    match = re.search(r"Số liền (trước|sau) của\s+(\d+)\s+là", text, flags=re.I)
    if not match:
        return None
    kind = match.group(1).lower()
    old_number = int(match.group(2))
    delta = deterministic_delta(question, lesson, modulo=28, minimum=4)
    new_number = max(2, old_number + delta)
    correct = new_number - 1 if kind == "trước" else new_number + 1
    question["text"] = text[:match.start(2)] + str(new_number) + text[match.end(2):]
    set_choices(question, make_unique_numeric_choices(correct, spread=5, minimum=0), correct)
    operation = f"{new_number} - 1 = {correct}" if kind == "trước" else f"{new_number} + 1 = {correct}"
    question["explanation"] = (
        f"Số liền {kind} của {new_number} là số đứng {'ngay trước' if kind == 'trước' else 'ngay sau'} {new_number} trên tia số.\n"
        f"Ta tính: {operation}.\n"
        f"Vậy số cần tìm là {correct}. Chọn {question['correct_answer']}."
    )
    return f"neighbor_{kind}"


def rewrite_arithmetic(question, lesson):
    text = question.get("text") or ""
    match = re.search(r"(Tính:\s*)(\d+)\s*(cm|dm|m|kg|g|l|ml)?\s*([+\-–])\s*(\d+)\s*(cm|dm|m|kg|g|l|ml)?(?!\s*[+\-–])(?:\s*=\s*\?)?", text, flags=re.I)
    if not match:
        return None
    left = int(match.group(2))
    left_unit = match.group(3) or ""
    op = match.group(4)
    right = int(match.group(5))
    right_unit = match.group(6) or left_unit
    unit = left_unit or right_unit
    delta = deterministic_delta(question, lesson, modulo=9, minimum=2)
    new_left = left + delta
    new_right = max(1, right + (delta % 5))
    if op in {"-", "–"} and new_left <= new_right:
        new_left = new_right + delta + 3
    correct = new_left + new_right if op == "+" else new_left - new_right
    op_text = "+" if op == "+" else "-"
    expression = f"{format_number_with_unit(new_left, unit)} {op_text} {format_number_with_unit(new_right, unit)}"
    question["text"] = text[:match.start(2)] + expression + text[match.end(6):]
    question["text"] = re.sub(r"\s*=\s*\?\s*$", " = ?", question["text"])
    if "?" not in question["text"]:
        question["text"] += " = ?"
    correct_text = format_number_with_unit(correct, unit)
    set_choices(question, make_numeric_choices_with_unit(correct, unit, spread=10, minimum=0), correct_text)
    question["explanation"] = (
        f"Ta cần thực hiện phép tính {expression}.\n"
        f"Tính được: {expression} = {correct_text}.\n"
        f"Đối chiếu các phương án, {correct_text} nằm ở đáp án {question['correct_answer']}."
    )
    return "arithmetic"


def rewrite_three_term_arithmetic(question, lesson):
    text = question.get("text") or ""
    match = re.search(
        r"(Tính:\s*)(\d+)\s*(cm|dm|m|kg|g|l|ml)?\s*([+\-–])\s*(\d+)\s*(cm|dm|m|kg|g|l|ml)?\s*([+\-–])\s*(\d+)\s*(cm|dm|m|kg|g|l|ml)?",
        text,
        flags=re.I
    )
    if not match:
        return None
    a = int(match.group(2))
    unit = match.group(3) or match.group(6) or match.group(9) or ""
    op1 = "+" if match.group(4) == "+" else "-"
    b = int(match.group(5))
    op2 = "+" if match.group(7) == "+" else "-"
    c = int(match.group(8))
    delta = deterministic_delta(question, lesson, modulo=8, minimum=2)
    new_a = a + delta
    new_b = max(1, b + (delta % 5))
    new_c = max(1, c + (delta % 4))
    if op1 == "-" and new_a <= new_b:
        new_a = new_b + delta + 4
    first = new_a + new_b if op1 == "+" else new_a - new_b
    if op2 == "-" and first <= new_c:
        new_a += new_c + 3
        first = new_a + new_b if op1 == "+" else new_a - new_b
    correct = first + new_c if op2 == "+" else first - new_c
    expression = (
        f"{format_number_with_unit(new_a, unit)} {op1} "
        f"{format_number_with_unit(new_b, unit)} {op2} "
        f"{format_number_with_unit(new_c, unit)}"
    )
    question["text"] = text[:match.start(2)] + expression + text[match.end(9):]
    correct_text = format_number_with_unit(correct, unit)
    set_choices(question, make_numeric_choices_with_unit(correct, unit, spread=10, minimum=0), correct_text)
    first_text = format_number_with_unit(first, unit)
    question["explanation"] = (
        f"Ta tính theo thứ tự từ trái sang phải.\n"
        f"Bước 1: {format_number_with_unit(new_a, unit)} {op1} {format_number_with_unit(new_b, unit)} = {first_text}.\n"
        f"Bước 2: {first_text} {op2} {format_number_with_unit(new_c, unit)} = {correct_text}.\n"
        f"Vậy kết quả là {correct_text}, chọn {question['correct_answer']}."
    )
    return "three_term_arithmetic"


def rewrite_multiply_divide(question, lesson):
    text = question.get("text") or ""
    match = re.search(r"(Tính:\s*)(\d+)\s*([×xX*:])\s*(\d+)(?:\s*=\s*\?)?", text, flags=re.I)
    if not match:
        return None
    a = int(match.group(2))
    op = match.group(3)
    b = int(match.group(4))
    delta = deterministic_delta(question, lesson, modulo=4, minimum=2)
    if op in {":", "/"}:
        new_b = max(2, b + (delta % 3))
        quotient = max(2, a // max(b, 1) + delta)
        new_a = new_b * quotient
        correct = quotient
        op_text = ":"
    else:
        new_a = max(2, a + delta)
        new_b = max(2, b + (delta % 3))
        correct = new_a * new_b
        op_text = "×"
    expression = f"{new_a} {op_text} {new_b}"
    question["text"] = text[:match.start(2)] + expression + text[match.end(4):]
    if "?" not in question["text"]:
        question["text"] += " = ?"
    set_choices(question, make_unique_numeric_choices(correct, spread=5, minimum=0), correct)
    question["explanation"] = (
        f"Ta thực hiện phép tính {expression}.\n"
        f"Kết quả: {expression} = {correct}.\n"
        f"Vậy chọn đáp án {question['correct_answer']}."
    )
    return "multiply_divide"


def rewrite_sum_difference(question, lesson):
    text = question.get("text") or ""
    match = re.search(r"(Tổng|Hiệu) của (?:hai số\s*)?(\d+) và (\d+) là", text, flags=re.I)
    if not match:
        return None
    kind = match.group(1).lower()
    a = int(match.group(2))
    b = int(match.group(3))
    delta = deterministic_delta(question, lesson, modulo=12, minimum=3)
    new_a = a + delta
    new_b = max(1, b + (delta % 7))
    if kind == "hiệu" and new_a < new_b:
        new_a, new_b = new_b + delta, new_a
    correct = new_a + new_b if kind == "tổng" else new_a - new_b
    question["text"] = text[:match.start(2)] + f"{new_a} và {new_b}" + text[match.end(3):]
    set_choices(question, make_unique_numeric_choices(correct, spread=8, minimum=0), correct)
    op_text = "+" if kind == "tổng" else "-"
    question["explanation"] = (
        f"Muốn tìm {kind} của hai số {new_a} và {new_b}, ta thực hiện phép tính {new_a} {op_text} {new_b}.\n"
        f"Ta có: {new_a} {op_text} {new_b} = {correct}.\n"
        f"Vậy đáp án đúng là {question['correct_answer']}."
    )
    return f"{kind}_variant"


def rewrite_compare(question, lesson):
    text = question.get("text") or ""
    match = re.search(r"(\d+)\s*(?:…|\.{3})\s*(\d+)", text)
    if not match:
        return None
    a = int(match.group(1))
    b = int(match.group(2))
    delta = deterministic_delta(question, lesson, modulo=21, minimum=5)
    new_a = a + delta
    new_b = b + max(1, delta // 2)
    if new_a == new_b:
        new_b += 3
    sign = ">" if new_a > new_b else "<"
    if new_a == new_b:
        sign = "="
    question["text"] = text[:match.start()] + f"{new_a} … {new_b}" + text[match.end():]
    values = ["<", ">", "="]
    question["choices"] = [{"key": key, "text": value} for key, value in zip(["A", "B", "C"], values)]
    question["correct_answer"] = next(item["key"] for item in question["choices"] if item["text"] == sign)
    question["explanation"] = (
        f"So sánh hai số {new_a} và {new_b}.\n"
        f"Ta thấy {new_a} {sign} {new_b}.\n"
        f"Vì vậy dấu cần điền là “{sign}”, chọn {question['correct_answer']}."
    )
    return "compare"


def try_make_variant(question, lesson):
    if int(lesson.get("grade") or 0) not in TARGET_GRADES:
        return None
    if question.get("images"):
        return None
    for fn in [
        rewrite_read_number,
        rewrite_neighbor_number,
        rewrite_three_term_arithmetic,
        rewrite_multiply_divide,
        rewrite_arithmetic,
        rewrite_sum_difference,
        rewrite_compare,
    ]:
        result = fn(question, lesson)
        if result:
            return result
    return None


def build_detailed_explanation(question, lesson, original_explanation, variant_type=None):
    correct_key = str(question.get("correct_answer") or "").strip()
    correct_text = choice_text(question, correct_key) if correct_key else ""
    prompt = strip_prompt_prefix(question.get("text") or "")
    original = normalize_plain_angle_text(original_explanation or "")
    lines = []

    if variant_type:
        lines.extend(split_sentences(original))
    else:
        lines.append(f"Bước 1: Đọc kỹ yêu cầu của đề bài: {prompt}")
        lines.append("Bước 2: Phân tích dữ kiện và đối chiếu với từng phương án.")
        parts = split_sentences(original)
        if parts:
            lines.extend(parts)
        else:
            lines.append("Dựa vào kiến thức của bài học, ta chọn phương án phù hợp nhất với yêu cầu.")

    if correct_key:
        conclusion = f"Kết luận: Đáp án đúng là {correct_key}"
        if correct_text:
            conclusion += f" ({correct_text})"
        conclusion += "."
        if not any(line.lower().startswith("kết luận") for line in lines):
            lines.append(conclusion)
    return "\n".join(line for line in lines if line.strip())


def enhance_payload(payload):
    data = copy.deepcopy(payload)
    report = {
        "totalQuestions": 0,
        "targetGradeQuestions": 0,
        "rewrittenExplanations": 0,
        "targetGradeRewritten": 0,
        "dataVariants": 0,
        "variantTypes": {},
        "samples": []
    }

    for lesson in data.get("lessons") or []:
        grade = int(lesson.get("grade") or 0)
        for question in lesson.get("questions") or []:
            report["totalQuestions"] += 1
            if grade in TARGET_GRADES:
                report["targetGradeQuestions"] += 1

            before = copy.deepcopy(question)
            for field in ["text", "explanation"]:
                question[field] = normalize_plain_angle_text(question.get(field) or "")
            for choice in question.get("choices") or []:
                choice["text"] = normalize_plain_angle_text(choice.get("text") or "")

            variant_type = try_make_variant(question, lesson)
            if variant_type:
                report["dataVariants"] += 1
                report["variantTypes"][variant_type] = report["variantTypes"].get(variant_type, 0) + 1

            original_explanation = question.get("explanation") or before.get("explanation") or ""
            new_explanation = build_detailed_explanation(question, lesson, original_explanation, variant_type)
            if new_explanation and new_explanation != before.get("explanation"):
                question["explanation"] = new_explanation
                report["rewrittenExplanations"] += 1
                if grade in TARGET_GRADES:
                    report["targetGradeRewritten"] += 1

            if len(report["samples"]) < 160 and question != before:
                report["samples"].append({
                    "grade": grade,
                    "lesson": lesson.get("title"),
                    "question_number": question.get("number"),
                    "variant_type": variant_type or "",
                    "before": before,
                    "after": question
                })

    return data, report


def main():
    parser = argparse.ArgumentParser(description="Viết lại lời giải và tạo biến thể dữ liệu cho câu hỏi crawl.")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    args = parser.parse_args()

    payload = json.loads(args.input.read_text(encoding="utf-8"))
    enhanced, report = enhance_payload(payload)
    args.output.write_text(json.dumps(enhanced, ensure_ascii=False, indent=2), encoding="utf-8")
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({
        "output": str(args.output),
        "report": str(args.report),
        "totalQuestions": report["totalQuestions"],
        "targetGradeQuestions": report["targetGradeQuestions"],
        "targetGradeRewritten": report["targetGradeRewritten"],
        "targetGradeRewritePercent": round(report["targetGradeRewritten"] / max(report["targetGradeQuestions"], 1) * 100, 2),
        "dataVariants": report["dataVariants"],
        "variantTypes": report["variantTypes"]
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
