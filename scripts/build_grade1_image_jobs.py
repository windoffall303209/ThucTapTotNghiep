# Script build grade1 image jobs h? tr? nh?p, xu?t, ki?m tra ho?c b?o tr? d? li?u v? c?u h?nh c?a d? ?n.
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PACK_DIR = ROOT / "output" / "grade1-question-pack"
QUESTIONS_PATH = PACK_DIR / "questions.json"
JOBS_PATH = PACK_DIR / "image-jobs.json"


# H?m sheet_prompt d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def sheet_prompt(lesson, questions, job_index):
    panel_lines = []
    for index, question in enumerate(questions, start=1):
        panel_lines.append(f"Panel {index}: {question['visual_prompt']}.")

    if len(questions) < 6:
        for index in range(len(questions) + 1, 7):
            panel_lines.append(f"Panel {index}: a calm empty light background with no objects.")

    return "\n".join([
        "Use case: scientific-educational",
        "Asset type: AI illustration contact sheet for Vietnamese grade-1 math question cards",
        f"Primary request: create six clean independent illustration panels for lesson {lesson}, sheet {job_index}.",
        "Layout: exact 3 columns by 2 rows grid, six equal rectangular panels, straight boundaries, no gaps, no frames, no rounded corners.",
        *panel_lines,
        "Style/medium: polished 2D children's textbook illustration, clean shapes, crisp edges, friendly age-appropriate objects.",
        "Composition: each panel is a separate coherent scene; key objects centered; simple background; no object crosses into another panel.",
        "Color palette: varied balanced teal, yellow, coral, green and neutral white; panels should not all share the same dominant color.",
        "Constraints: clear for six-year-old students; all panels visibly different; no answer cues; no equations; no numerals; no letters; no words.",
        "Avoid: text, watermark, logo, panel labels, clutter, tiny objects, confusing perspective, photorealistic faces, decorative borders.",
    ])


# H?m main d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def main():
    pack = json.loads(QUESTIONS_PATH.read_text(encoding="utf-8"))
    jobs = []
    for lesson in pack["lessons"]:
        questions = lesson["questions"]
        for start in range(0, len(questions), 5):
            group = questions[start:start + 5]
            group_number = start // 5 + 1
            job_id = f"lesson-{lesson['lesson_id']:02d}-sheet-{group_number:02d}"
            jobs.append({
                "job_id": job_id,
                "lesson_id": lesson["lesson_id"],
                "lesson": lesson["lesson"],
                "question_ids": [question["id"] for question in group],
                "prompt": sheet_prompt(lesson["lesson"], group, group_number),
                "sheet_file": f"ai-sheets/{job_id}.png",
            })

    payload = {
        "job_count": len(jobs),
        "questions_per_job": 5,
        "jobs": jobs,
    }
    JOBS_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(jobs)} image jobs to {JOBS_PATH}")


# Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u hi?n t?i.
if __name__ == "__main__":
    main()
