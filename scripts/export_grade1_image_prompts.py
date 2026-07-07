import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INPUT_PATH = ROOT / "content-theory" / "grade-1-theory-blueprint.json"
OUTPUT_PATH = ROOT / "output" / "doc" / "grade1_ai_image_prompts.jsonl"


def build_prompt(chapter_index, lesson_index, card_index, chapter, lesson, card):
    return {
        "id": f"g1-c{chapter_index:02d}-l{lesson_index:02d}-card{card_index:02d}",
        "chapter": chapter["title"],
        "lesson": lesson["lesson"],
        "card_title": card.get("title", ""),
        "prompt": "\n".join(
            [
                "Use case: illustration-story.",
                "Asset type: Vietnamese grade 1 math lesson card illustration.",
                f"Primary request: {card.get('visual_prompt', '')}",
                "Style/medium: warm simple children's textbook illustration, clean flat shapes, soft outlines, friendly and uncluttered.",
                "Composition/framing: landscape 16:9, centered main objects, clear visual grouping, white or very light classroom background.",
                "Pedagogical constraints: make the math relationship visually obvious for a grade 1 student; use exact object counts when counts are implied.",
                "Text constraints: no Vietnamese text, no labels, no numbers, no equations inside the image; text will be overlaid separately in Word/UI.",
                "Avoid: watermark, logo, photorealistic style, cluttered background, extra objects that change the math count.",
            ]
        ),
    }


def main():
    data = json.loads(INPUT_PATH.read_text(encoding="utf-8"))
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_PATH.open("w", encoding="utf-8") as f:
        for chapter_index, chapter in enumerate(data["chapters"], 1):
            for lesson_index, lesson in enumerate(chapter["lessons"], 1):
                for card_index, card in enumerate(lesson.get("cards", []), 1):
                    item = build_prompt(chapter_index, lesson_index, card_index, chapter, lesson, card)
                    f.write(json.dumps(item, ensure_ascii=False) + "\n")
    print(OUTPUT_PATH)


if __name__ == "__main__":
    main()
