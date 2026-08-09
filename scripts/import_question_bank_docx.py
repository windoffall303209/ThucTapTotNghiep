import base64
import json
import subprocess
import sys
import tempfile
from pathlib import Path

from docx import Document


ROOT = Path(__file__).resolve().parents[1]
IMPORTERS = {
    1: "import_grade1_question_bank_tex.js",
    2: "import_grade2_question_bank_tex.js",
    3: "import_grade3_question_bank_tex.js",
    4: "import_grade4_question_bank_tex.js",
    5: "import_grade5_question_bank_tex.js",
}


def decode(line, prefix):
    return json.loads(base64.b64decode(line[len(prefix):].strip()).decode("utf-8"))


def document_lines(source):
    return [paragraph.text.strip() for paragraph in Document(source).paragraphs if paragraph.text.strip()]


def run_primary(lines, arguments, temporary):
    payloads = [decode(line, "% DBJSON ") for line in lines if line.startswith("% DBJSON ")]
    grades = {int(payload["grade"]) for payload in payloads}
    if len(grades) != 1:
        raise RuntimeError("File câu hỏi chính phải chỉ chứa đúng một khối lớp.")
    grade = grades.pop()
    tex = Path(temporary) / f"grade{grade}_question_bank.tex"
    tex.write_text("\n".join(f"% DBJSON {line[9:].strip()}" for line in lines if line.startswith("% DBJSON ")) + "\n", encoding="utf-8")
    command = ["node", str(ROOT / "scripts" / IMPORTERS[grade]), f"--input={tex}", *arguments]
    return subprocess.run(command, cwd=ROOT, check=False).returncode


def run_supplements(lines, arguments, temporary):
    batches = []
    current = None
    for line in lines:
        if line.startswith("% SUPBATCH "):
            metadata = decode(line, "% SUPBATCH ")
            current = {**metadata, "questions": []}
            batches.append(current)
        elif line.startswith("% SUPJSON "):
            if current is None:
                raise RuntimeError("SUPJSON xuất hiện trước SUPBATCH.")
            current["questions"].append(decode(line, "% SUPJSON "))
    apply = "--apply" in arguments
    confirmations = [argument for argument in arguments if argument.startswith("--confirm-database=")]
    for index, batch in enumerate(batches, start=1):
        source = Path(temporary) / f"supplement-{index:03d}.json"
        source.write_text(json.dumps(batch, ensure_ascii=False, indent=2), encoding="utf-8")
        forwarded = []
        if apply:
            forwarded.extend(["--apply", f"--confirm-approval={batch['batch_id']}", *confirmations])
        command = ["node", str(ROOT / "scripts" / "import_question_supplement.js"), str(source), *forwarded]
        result = subprocess.run(command, cwd=ROOT, check=False)
        if result.returncode:
            return result.returncode
    return 0


def main():
    if len(sys.argv) < 2:
        raise SystemExit("Cần truyền đường dẫn file DOCX.")
    source = Path(sys.argv[1]).resolve()
    if not source.exists():
        raise FileNotFoundError(source)
    lines = document_lines(source)
    arguments = sys.argv[2:]
    with tempfile.TemporaryDirectory(prefix="question-bank-docx-") as temporary:
        if any(line.startswith("% DBJSON ") for line in lines):
            code = run_primary(lines, arguments, temporary)
        elif any(line.startswith("% SUPBATCH ") for line in lines):
            code = run_supplements(lines, arguments, temporary)
        else:
            raise RuntimeError("File Word không có payload nhập database.")
    raise SystemExit(code)


if __name__ == "__main__":
    main()
