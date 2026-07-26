import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
PACK_DIR = ROOT / "output" / "grade1-question-pack"
QUESTIONS_PATH = PACK_DIR / "questions.json"
JOBS_PATH = PACK_DIR / "image-jobs.json"
SHEET_DIR = PACK_DIR / "ai-sheets"
IMAGE_DIR = PACK_DIR / "images"

FONT_REGULAR = Path(r"C:\Windows\Fonts\arial.ttf")
FONT_BOLD = Path(r"C:\Windows\Fonts\arialbd.ttf")

CARD_W = 1200
CARD_H = 900
PAD = 64
TEXT_TOP = 48
TEXT_H = 238
ART_TOP = 318
ART_W = CARD_W - PAD * 2
ART_H = CARD_H - ART_TOP - 58


def load_pack():
    questions_doc = json.loads(QUESTIONS_PATH.read_text(encoding="utf-8"))
    jobs_doc = json.loads(JOBS_PATH.read_text(encoding="utf-8"))
    questions = {}
    for lesson in questions_doc["lessons"]:
        for question in lesson["questions"]:
            questions[question["id"]] = question
    return questions_doc, jobs_doc["jobs"], questions


def font(path, size):
    return ImageFont.truetype(str(path), size=size)


def text_bbox(draw, xy, text, font_obj):
    return draw.textbbox(xy, text, font=font_obj)


def wrap_text(draw, text, font_obj, max_width):
    words = text.split()
    lines = []
    current = ""
    for word in words:
        candidate = word if not current else f"{current} {word}"
        width = text_bbox(draw, (0, 0), candidate, font_obj)[2]
        if width <= max_width:
            current = candidate
            continue
        if current:
            lines.append(current)
        current = word
    if current:
        lines.append(current)
    return lines


def fit_question_text(draw, text):
    max_width = CARD_W - PAD * 2
    max_height = TEXT_H
    for size in range(54, 31, -2):
        font_obj = font(FONT_BOLD, size)
        lines = wrap_text(draw, text, font_obj, max_width)
        line_h = int(size * 1.25)
        total_h = line_h * len(lines)
        widest = max((text_bbox(draw, (0, 0), line, font_obj)[2] for line in lines), default=0)
        if total_h <= max_height and widest <= max_width:
            return font_obj, lines, line_h
    font_obj = font(FONT_BOLD, 30)
    return font_obj, wrap_text(draw, text, font_obj, max_width), 38


def cover_crop(image, size):
    target_w, target_h = size
    src_w, src_h = image.size
    scale = max(target_w / src_w, target_h / src_h)
    resized = image.resize((round(src_w * scale), round(src_h * scale)), Image.Resampling.LANCZOS)
    x = (resized.width - target_w) // 2
    y = (resized.height - target_h) // 2
    return resized.crop((x, y, x + target_w, y + target_h))


def panel_crop(sheet, panel_index):
    cols = 3
    rows = 2
    col = panel_index % cols
    row = panel_index // cols
    x0 = round(col * sheet.width / cols)
    x1 = round((col + 1) * sheet.width / cols)
    y0 = round(row * sheet.height / rows)
    y1 = round((row + 1) * sheet.height / rows)
    return sheet.crop((x0, y0, x1, y1))


def make_card(question_text, panel):
    card = Image.new("RGB", (CARD_W, CARD_H), "#fbfaf5")
    draw = ImageDraw.Draw(card)

    draw.rectangle((0, 0, CARD_W, CARD_H), fill="#fbfaf5")
    draw.rounded_rectangle((34, 32, CARD_W - 34, CARD_H - 32), radius=24, fill="#ffffff", outline="#d7e0df", width=3)

    question_font, lines, line_h = fit_question_text(draw, question_text)
    total_h = line_h * len(lines)
    y = TEXT_TOP + max(0, (TEXT_H - total_h) // 2)
    for line in lines:
        line_w = text_bbox(draw, (0, 0), line, question_font)[2]
        draw.text(((CARD_W - line_w) / 2, y), line, fill="#20303c", font=question_font)
        y += line_h

    draw.line((PAD, ART_TOP - 20, CARD_W - PAD, ART_TOP - 20), fill="#cfe1dc", width=3)

    art = cover_crop(panel.convert("RGB"), (ART_W, ART_H))
    card.paste(art, (PAD, ART_TOP))
    draw.rounded_rectangle((PAD, ART_TOP, PAD + ART_W, ART_TOP + ART_H), radius=14, outline="#c8d6d3", width=3)
    return card


def compose(allow_missing=False):
    questions_doc, jobs, questions = load_pack()
    IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    missing_sheets = []
    written = 0

    for job in jobs:
        sheet_path = PACK_DIR / job["sheet_file"]
        if not sheet_path.exists():
            missing_sheets.append(sheet_path.name)
            if allow_missing:
                continue
            raise FileNotFoundError(f"Missing AI sheet: {sheet_path}")

        sheet = Image.open(sheet_path).convert("RGB")
        for panel_index, question_id in enumerate(job["question_ids"]):
            question = questions[question_id]
            panel = panel_crop(sheet, panel_index)
            card = make_card(question["question"], panel)
            out_path = PACK_DIR / question["image_file"]
            out_path.parent.mkdir(parents=True, exist_ok=True)
            card.save(out_path, format="JPEG", quality=86, optimize=True, progressive=True)
            written += 1

    expected = questions_doc["question_count"]
    existing = len(list(IMAGE_DIR.glob("*.jpg")))
    print(f"written={written}")
    print(f"existing_images={existing}/{expected}")
    if missing_sheets:
        print(f"missing_sheets={len(missing_sheets)}")
        print("\n".join(missing_sheets[:20]))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--allow-missing", action="store_true")
    args = parser.parse_args()
    compose(allow_missing=args.allow_missing)


if __name__ == "__main__":
    main()
