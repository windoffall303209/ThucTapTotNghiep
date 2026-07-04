import argparse
import copy
import json
import re
import sys
from pathlib import Path


sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "output" / "doc"
DEFAULT_INPUT = OUTPUT_DIR / "crawled_questions_structured_with_explanation_images.json"
DEFAULT_OUTPUT = OUTPUT_DIR / "crawled_questions_structured_with_explanation_images_normalized.json"
DEFAULT_REPORT = OUTPUT_DIR / "question_notation_normalization_report.json"

PRIME_CHARS = "'’′"

THREE_POINT_ANGLE_PATTERN = re.compile(
    rf"(?<![A-Za-z0-9$\\])"
    rf"([A-Za-z])\s*([{PRIME_CHARS}]?)\s+"
    rf"([A-Za-z])\s*([{PRIME_CHARS}]?)\s+"
    rf"([A-Za-z])\s*([{PRIME_CHARS}]?)\s*\^(?:\s*([{PRIME_CHARS}]))?"
)

SINGLE_ANGLE_PATTERN = re.compile(
    rf"(?<![A-Za-z0-9$\\])([A-Za-z])(?:\s+([0-9]+))?\s*\^"
)

DEGREE_SYMBOL_PATTERN = re.compile(r"(?<![A-Za-z0-9$])(\d+(?:[,.]\d+)?)\s*°")
DEGREE_LETTER_PATTERN = re.compile(r"(?<![A-Za-z0-9$])(\d+(?:[,.]\d+)?)\s*o\b")


def latex_angle(value):
    return f"$\\widehat{{{value}}}$"


def normalize_prime(value):
    return "'" if value else ""


def normalize_three_point_angle(match):
    a, a_prime, b, b_prime, c, c_prime, trailing_prime = match.groups()
    c_prime = c_prime or trailing_prime
    parts = [
        f"{a}{normalize_prime(a_prime)}",
        f"{b}{normalize_prime(b_prime)}",
        f"{c}{normalize_prime(c_prime)}",
    ]

    # OCR từ nguồn web đôi khi biến góc tạo bởi hai tia Oa, Ob thành "O a b ^".
    # Trong trường hợp này O là đỉnh, ký hiệu đúng phải là aOb.
    if parts[0] == "O" and parts[1].islower() and parts[2].islower():
        parts = [parts[1], parts[0], parts[2]]

    angle = "".join(parts)
    return latex_angle(angle)


def normalize_single_angle(match):
    point, subscript = match.groups()
    if subscript:
        return latex_angle(f"{point}_{subscript}")
    return latex_angle(point)


def normalize_degree(match):
    return f"${match.group(1)}^\\circ$"


def normalize_text(value):
    if not isinstance(value, str) or not value:
        return value, []

    changes = []
    current = value

    for label, pattern, replacement in [
        ("three_point_angle", THREE_POINT_ANGLE_PATTERN, normalize_three_point_angle),
        ("single_angle", SINGLE_ANGLE_PATTERN, normalize_single_angle),
        ("degree_symbol", DEGREE_SYMBOL_PATTERN, normalize_degree),
        ("degree_letter", DEGREE_LETTER_PATTERN, normalize_degree),
    ]:
        matches = list(pattern.finditer(current))
        if not matches:
            continue
        before = current
        current = pattern.sub(replacement, current)
        if current != before:
            changes.append({
                "type": label,
                "count": len(matches),
                "samples": [match.group(0) for match in matches[:8]]
            })

    current = re.sub(r"\s+([,.;:])", r"\1", current)
    current = re.sub(r"\s{2,}", " ", current).strip()
    return current, changes


def normalize_question(question, lesson, report):
    field_paths = [
        ("text", question.get("text", "")),
        ("explanation", question.get("explanation", "")),
    ]

    for field_name, value in field_paths:
        normalized, changes = normalize_text(value)
        if changes and normalized != value:
            question[field_name] = normalized
            add_report_entry(report, lesson, question, field_name, value, normalized, changes)

    for choice in question.get("choices") or []:
        value = choice.get("text", "")
        normalized, changes = normalize_text(value)
        if changes and normalized != value:
            choice["text"] = normalized
            add_report_entry(report, lesson, question, f"choice_{choice.get('key', '')}", value, normalized, changes)


def add_report_entry(report, lesson, question, field, before, after, changes):
    report["changedFields"] += 1
    report["changedQuestions"].add((lesson.get("url", ""), question.get("number", "")))
    for change in changes:
        report["changeTypes"][change["type"]] = report["changeTypes"].get(change["type"], 0) + change["count"]

    if len(report["samples"]) < 120:
        report["samples"].append({
            "grade": lesson.get("grade"),
            "chapter": lesson.get("chapter"),
            "lesson": lesson.get("title"),
            "question_number": question.get("number"),
            "field": field,
            "changes": changes,
            "before": before,
            "after": after
        })


def normalize_payload(payload):
    normalized = copy.deepcopy(payload)
    report = {
        "changedFields": 0,
        "changedQuestions": set(),
        "changeTypes": {},
        "samples": []
    }

    for lesson in normalized.get("lessons") or []:
        for question in lesson.get("questions") or []:
            normalize_question(question, lesson, report)

    report["changedQuestions"] = len(report["changedQuestions"])
    report["totalLessons"] = len(normalized.get("lessons") or [])
    report["totalQuestions"] = sum(len(lesson.get("questions") or []) for lesson in normalized.get("lessons") or [])
    return normalized, report


def main():
    parser = argparse.ArgumentParser(description="Chuẩn hóa ký hiệu hình học trong dữ liệu câu hỏi crawl.")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    args = parser.parse_args()

    payload = json.loads(args.input.read_text(encoding="utf-8"))
    normalized, report = normalize_payload(payload)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(normalized, ensure_ascii=False, indent=2), encoding="utf-8")
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    print(json.dumps({
        "output": str(args.output),
        "report": str(args.report),
        "changedFields": report["changedFields"],
        "changedQuestions": report["changedQuestions"],
        "changeTypes": report["changeTypes"],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
