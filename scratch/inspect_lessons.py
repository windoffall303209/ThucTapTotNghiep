# Script th? nghi?m inspect lessons d?ng ?? kh?o s?t nhanh m?t th? vi?n, d? li?u ho?c ? t??ng x? l?.
import json
import sys

# Reconfigure stdout to support utf-8 on Windows
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# Kh?i l?p ho?c ng? c?nh ki?m so?t ph?m vi x? l? v? ?i?u ki?n k?t th?c.
with open("output/doc/current_lessons_for_theory.json", "r", encoding="utf-8") as f:
    lessons = json.load(f)

grade_4_lessons = [l for l in lessons if l["grade"] == 4]
print(f"Total Grade 4 lessons: {len(grade_4_lessons)}")
print("First 5 lessons:")
# Kh?i l?p ho?c ng? c?nh ki?m so?t ph?m vi x? l? v? ?i?u ki?n k?t th?c.
for l in grade_4_lessons[:5]:
    print(f"ID: {l['id']}, Chapter: {l['chapter_name']}, Lesson: {l['lesson_name']}")


print("\nAll Grade 4 chapters and lesson counts:")
chapters = {}
# Kh?i l?p ho?c ng? c?nh ki?m so?t ph?m vi x? l? v? ?i?u ki?n k?t th?c.
for l in grade_4_lessons:
    ch = l["chapter_name"]
    chapters[ch] = chapters.get(ch, 0) + 1
# Kh?i l?p ho?c ng? c?nh ki?m so?t ph?m vi x? l? v? ?i?u ki?n k?t th?c.
for ch, count in chapters.items():
    print(f"- {ch}: {count} lessons")
