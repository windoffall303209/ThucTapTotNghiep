# Script thử nghiệm inspect lessons dùng để khảo sát nhanh một thư viện, dữ liệu hoặc ý tưởng xử lý.
import json
import sys

# Reconfigure stdout to support utf-8 on Windows
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
with open("output/doc/current_lessons_for_theory.json", "r", encoding="utf-8") as f:
    lessons = json.load(f)

grade_4_lessons = [l for l in lessons if l["grade"] == 4]
print(f"Total Grade 4 lessons: {len(grade_4_lessons)}")
print("First 5 lessons:")
# Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
for l in grade_4_lessons[:5]:
    print(f"ID: {l['id']}, Chapter: {l['chapter_name']}, Lesson: {l['lesson_name']}")


print("\nAll Grade 4 chapters and lesson counts:")
chapters = {}
# Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
for l in grade_4_lessons:
    ch = l["chapter_name"]
    chapters[ch] = chapters.get(ch, 0) + 1
# Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
for ch, count in chapters.items():
    print(f"- {ch}: {count} lessons")
