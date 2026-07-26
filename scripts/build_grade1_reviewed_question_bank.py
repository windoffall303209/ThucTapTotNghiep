from __future__ import annotations

import importlib.util
import json
import random
import re
from collections import Counter
from pathlib import Path


PROJECT = Path(__file__).resolve().parents[1]
PACK_DIR = PROJECT / "output" / "grade1-question-pack"
SOURCE_JSON = PACK_DIR / "questions.json"
BASE_SCRIPT = PROJECT / "scripts" / "build_grade5_question_bank.py"
REPORT_PATH = PROJECT / "output" / "doc" / "grade1_content_review_report.json"

spec = importlib.util.spec_from_file_location("question_bank_builder", BASE_SCRIPT)
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)

builder.GRADE = 1
builder.EXPECTED_LESSON_NUMBERS = list(range(1, 22))
builder.OUTPUT_DOCX = (
    PROJECT / "output" / "doc" / "ngan_hang_cau_hoi_toan_1_canh_dieu_da_soat.docx"
)
builder.OUTPUT_TEX = PROJECT / "data" / "grade1_question_bank_reviewed.tex"
builder.TEMP_IMAGES = PACK_DIR / "tmp" / "compressed"

KNOWN_CORRECTIONS = [
    {
        "question_id": "lesson-08-q-07",
        "issue": "Hai phương án sai bị trùng Nhóm A.",
        "correction": "Đổi phương án sai thứ hai thành Nhóm B.",
    },
    {
        "question_id": "lesson-08-q-10",
        "issue": "Hai phương án sai bị trùng Nhóm A.",
        "correction": "Đổi phương án sai thứ hai thành Nhóm B.",
    },
    {
        "question_id": "lesson-10-q-09",
        "issue": "Đáp án đúng 4 xuất hiện trong danh sách sai thường gặp.",
        "correction": "Sinh lại phương án sai số học, loại đáp án đúng.",
    },
    {
        "question_id": "lesson-11-q-09",
        "issue": "Đáp án đúng 4 xuất hiện trong danh sách sai thường gặp.",
        "correction": "Sinh lại phương án sai số học, loại đáp án đúng.",
    },
    {
        "question_id": "lesson-13-q-09",
        "issue": "Đáp án đúng 4 xuất hiện trong danh sách sai thường gặp.",
        "correction": "Sinh lại phương án sai số học, loại đáp án đúng.",
    },
    {
        "question_id": "lesson-14-q-09",
        "issue": "Đáp án đúng 7 xuất hiện trong danh sách sai thường gặp.",
        "correction": "Sinh lại phương án sai số học, loại đáp án đúng.",
    },
    {
        "question_id": "lesson-19-q-14",
        "issue": "Đáp án đúng 2 xuất hiện trong danh sách sai thường gặp.",
        "correction": "Sinh lại phương án sai số học, loại đáp án đúng.",
    },
]


def normalize(value: str) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def explanation_for(question: dict) -> str:
    prompt = normalize(question["question"]).replace("−", "-")
    answer = normalize(question["answer"])
    calculation = re.search(r"(\d+)\s*([+-])\s*(\d+)", prompt)
    if calculation and answer.lstrip("-").isdigit():
        left, operator, right = calculation.groups()
        result = int(left) + int(right) if operator == "+" else int(left) - int(right)
        if result == int(answer):
            return f"Ta tính {left} {operator} {right} = {answer}. Vậy đáp án là {answer}."
    if answer == "Đúng":
        return "Đối chiếu dữ kiện hoặc thực hiện phép tính cho thấy khẳng định đã nêu là đúng."
    if answer == "Sai":
        return "Đối chiếu dữ kiện hoặc thực hiện phép tính cho thấy khẳng định đã nêu là sai."
    return f"Dựa vào dữ kiện của đề bài, đáp án đúng là: {answer}."


def audit(data: dict) -> list[dict]:
    issues = []
    prompts = []
    expected_ids = set()
    for lesson in data.get("lessons", []):
        for question in lesson.get("questions", []):
            question_id = question.get("id", "")
            expected_ids.add(question_id)
            prompt = normalize(question.get("question", ""))
            answer = normalize(question.get("answer", ""))
            prompts.append((prompt.lower(), question_id))
            mistakes = question.get("common_mistakes", [])
            wrong_answers = [normalize(item.get("wrong_answer", "")) for item in mistakes]
            if not prompt:
                issues.append({"question_id": question_id, "issue": "Thiếu nội dung câu hỏi."})
            if not answer:
                issues.append({"question_id": question_id, "issue": "Thiếu đáp án."})
            if len(mistakes) != 2:
                issues.append({"question_id": question_id, "issue": "Không có đúng 2 sai thường gặp."})
            if answer in wrong_answers:
                issues.append({"question_id": question_id, "issue": "Đáp án đúng xuất hiện trong phương án sai."})
            if len(set(wrong_answers)) != len(wrong_answers):
                issues.append({"question_id": question_id, "issue": "Phương án sai bị trùng."})
            image_path = PACK_DIR / question.get("image_file", "")
            if not image_path.exists():
                issues.append({"question_id": question_id, "issue": f"Thiếu ảnh: {image_path}"})

            text = prompt.replace("−", "-")
            true_false = re.search(
                r"[^:]{0,40}:\s*(\d+)\s*([+\-])\s*(\d+)\s*=\s*(\d+)",
                text,
            )
            if true_false and answer in {"Đúng", "Sai"}:
                left, operator, right, stated = true_false.groups()
                actual = int(left) + int(right) if operator == "+" else int(left) - int(right)
                expected = "Đúng" if actual == int(stated) else "Sai"
                if answer != expected:
                    issues.append(
                        {"question_id": question_id, "issue": f"Đáp án đúng-sai phải là {expected}."}
                    )

            direct = re.search(r"(?<!\d)(\d+)\s*([+\-])\s*(\d+)\s*=\s*\?", text)
            if direct and answer.isdigit():
                left, operator, right = direct.groups()
                expected = int(left) + int(right) if operator == "+" else int(left) - int(right)
                if int(answer) != expected:
                    issues.append(
                        {"question_id": question_id, "issue": f"Kết quả phép tính phải là {expected}."}
                    )

            blank_patterns = [
                (r"(\d+)\s*\+\s*__\s*=\s*(\d+)", lambda left, total: total - left),
                (r"__\s*\+\s*(\d+)\s*=\s*(\d+)", lambda right, total: total - right),
                (r"(\d+)\s*-\s*__\s*=\s*(\d+)", lambda left, result: left - result),
            ]
            for pattern, solve in blank_patterns:
                match = re.search(pattern, text)
                if match and answer.lstrip("-").isdigit():
                    expected = solve(int(match.group(1)), int(match.group(2)))
                    if int(answer) != expected:
                        issues.append(
                            {"question_id": question_id, "issue": f"Số điền khuyết phải là {expected}."}
                        )

    counts = Counter(prompt for prompt, _ in prompts)
    for prompt, count in counts.items():
        if count > 1:
            ids = [question_id for item, question_id in prompts if item == prompt]
            issues.append({"question_id": ",".join(ids), "issue": "Câu hỏi trùng nội dung."})
    return issues


def choices_for(question: dict) -> tuple[list[dict], str, list[dict]]:
    answer = normalize(question["answer"])
    options = [answer] + [
        normalize(item["wrong_answer"]) for item in question.get("common_mistakes", [])
    ]
    options = list(dict.fromkeys(options))
    rng = random.Random(question["id"])
    rng.shuffle(options)
    choices = [
        {"key": chr(65 + index), "text": option}
        for index, option in enumerate(options)
    ]
    correct_key = next(item["key"] for item in choices if item["text"] == answer)
    mistake_by_answer = {
        normalize(item["wrong_answer"]): normalize(item["hint"])
        for item in question.get("common_mistakes", [])
    }
    misconceptions = [
        {
            "distractor_key": item["key"],
            "misconception_name": "Sai thường gặp",
            "explanation": mistake_by_answer[item["text"]],
        }
        for item in choices
        if item["text"] in mistake_by_answer
    ]
    return choices, correct_key, misconceptions


def convert(data: dict) -> list[dict]:
    lessons = []
    for lesson in data["lessons"]:
        lesson_number = int(lesson["lesson_id"])
        questions = []
        for index, source in enumerate(lesson["questions"], start=1):
            choices, correct_key, misconceptions = choices_for(source)
            image_path = (PACK_DIR / source["image_file"]).resolve()
            questions.append(
                {
                    "lesson_number": lesson_number,
                    "lesson_title": normalize(lesson["lesson"]),
                    "source_kind": "main",
                    "source_file": SOURCE_JSON.name,
                    "source_question_number": index,
                    "bank_index": index,
                    "id": f"G1-L{lesson_number:03d}-Q{index:03d}",
                    "difficulty": "MEDIUM" if normalize(source["difficulty"]) == "Vận dụng" else "EASY",
                    "prompt": normalize(source["question"]),
                    "choices": choices,
                    "correct_answer": correct_key,
                    "answer_text": normalize(source["answer"]),
                    "explanation": explanation_for(source),
                    "image_source_path": str(image_path),
                    "image_relative_path": source["image_file"].replace("\\", "/"),
                    "misconceptions": misconceptions,
                }
            )
        lessons.append(
            {
                "number": lesson_number,
                "title": normalize(lesson["lesson"]),
                "questions": questions,
            }
        )
    builder.validate_bank(lessons)
    return lessons


def main() -> None:
    data = json.loads(SOURCE_JSON.read_text(encoding="utf-8"))
    remaining_issues = audit(data)
    report = {
        "grade": 1,
        "scope": "Chủ đề 1 và Chủ đề 2",
        "lesson_count": len(data["lessons"]),
        "question_count": sum(len(item["questions"]) for item in data["lessons"]),
        "image_count": sum(len(item["questions"]) for item in data["lessons"]),
        "checks": [
            "Đủ nội dung, đáp án, ảnh và hai sai thường gặp cho mỗi câu.",
            "Không trùng câu hỏi trong toàn bộ ngân hàng.",
            "Đáp án đúng không xuất hiện trong phương án sai.",
            "Phương án sai không trùng nhau.",
            "Kiểm tra phép cộng, phép trừ, câu đúng-sai và số điền khuyết có mẫu rõ ràng.",
            "Kiểm tra ảnh tồn tại và đọc được khi đóng gói Word.",
        ],
        "corrected_issues": KNOWN_CORRECTIONS,
        "remaining_issues": remaining_issues,
        "status": "PASS" if not remaining_issues else "NEEDS_REVIEW",
    }
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    if remaining_issues:
        raise ValueError(f"Còn {len(remaining_issues)} lỗi nội dung; xem {REPORT_PATH}")

    lessons = convert(data)
    builder.write_tex(lessons)
    builder.write_docx(lessons)
    print(
        json.dumps(
            {
                "lessons": len(lessons),
                "questions": sum(len(item["questions"]) for item in lessons),
                "images": sum(len(item["questions"]) for item in lessons),
                "corrected_issues": len(KNOWN_CORRECTIONS),
                "remaining_issues": 0,
                "docx": str(builder.OUTPUT_DOCX),
                "tex": str(builder.OUTPUT_TEX),
                "report": str(REPORT_PATH),
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
