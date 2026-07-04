import requests
import sys
import re
import os
from bs4 import BeautifulSoup

sys.stdout.reconfigure(encoding='utf-8')

urls = {
    1: "https://loigiaihay.com/sgk-toan-1-canh-dieu-c1140.html",
    2: "https://loigiaihay.com/toan-lop-2-canh-dieu-c626.html",
    3: "https://loigiaihay.com/sgk-toan-3-canh-dieu-c861.html",
    4: "https://loigiaihay.com/sgk-toan-4-canh-dieu-c1400.html",
    5: "https://loigiaihay.com/sgk-toan-5-canh-dieu-c1730.html",
    6: "https://loigiaihay.com/toan-lop-6-canh-dieu-c642.html",
    7: "https://loigiaihay.com/sgk-toan-7-canh-dieu-c809.html"
}

headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

def clean_text(text):
    return " ".join(text.split())

def should_exclude(lesson_name):
    name_lower = lesson_name.lower()
    exclude_keywords = [
        "luyện tập", 
        "ôn tập", 
        "bài tập", 
        "thực hành", 
        "trải nghiệm", 
        "ôn lại", 
        "vui học toán"
    ]
    for kw in exclude_keywords:
        if kw in name_lower:
            return True
    return False

output_lines = []

for grade in sorted(urls.keys()):
    url = urls[grade]
    print(f"Processing Grade {grade}...")
    output_lines.append("=" * 60)
    output_lines.append(f"LỚP {grade} - SÁCH TOÁN CÁNH DIỀU")
    output_lines.append("=" * 60)
    output_lines.append("")
    
    try:
        response = requests.get(url, headers=headers, timeout=15)
        if response.status_code != 200:
            print(f"Failed to load Grade {grade}: {response.status_code}")
            output_lines.append(f"Lỗi: Không thể tải dữ liệu lớp {grade} (Mã lỗi {response.status_code})")
            output_lines.append("")
            continue
            
        soup = BeautifulSoup(response.content, 'html.parser')
        
        if grade in [6, 7]:
            # Layout B logic: chapters inside UL sibling of book H2 headers
            for h2 in soup.find_all('h2'):
                h2_text = clean_text(h2.get_text())
                
                # Stop if we hit other subjects
                if "các môn khác" in h2_text.lower() or h2_text.lower().startswith("môn "):
                    break
                    
                if not any(k in h2_text.lower() for k in ["tập 1", "tập 2"]):
                    continue
                    
                output_lines.append(f"--- {h2_text} ---")
                
                sibling = h2.next_sibling
                while sibling:
                    if sibling.name == 'ul':
                        for chapter_li in sibling.find_all('li', recursive=False):
                            chapter_a = chapter_li.find('a', recursive=False)
                            if chapter_a:
                                chapter_name = clean_text(chapter_a.get_text())
                                output_lines.append(f"\n{chapter_name}")
                                
                                sub_ul = chapter_li.find('ul', class_='list-posts')
                                if sub_ul:
                                    for lesson_li in sub_ul.find_all('li'):
                                        lesson_text = clean_text(lesson_li.get_text())
                                        if not should_exclude(lesson_text):
                                            output_lines.append(f"  + {lesson_text}")
                        break
                    sibling = sibling.next_sibling
                output_lines.append("")
        else:
            # Layout A logic: chapters are H2, lessons are in sibling DIVs
            for h2 in soup.find_all('h2'):
                h2_text = clean_text(h2.get_text())
                
                # Stop if we hit other subjects or external links
                if "các môn khác" in h2_text.lower() or h2_text.lower().startswith("môn "):
                    break
                
                # If we see a volume header (Tập 1, Tập 2) in H2
                if any(k in h2_text.lower() for k in ["tập 1", "tập 2"]) and 'title-event-parent' in h2.get('class', []):
                    output_lines.append(f"--- {h2_text} ---")
                    continue
                
                # Filter chapter headings
                if not any(k in h2_text.lower() for k in ["chủ đề", "chương", "ôn tập"]):
                    continue
                    
                # Skip title-event-parents if they are not volume headers (already handled above)
                if h2.get('class') and 'title-event-parent' in h2.get('class', []):
                    continue
                    
                output_lines.append(f"\n{h2_text}")
                
                sibling = h2.next_sibling
                lessons = []
                while sibling:
                    if sibling.name == 'h2':
                        break
                    if sibling.name:
                        classes = sibling.get('class', []) or []
                        if sibling.name == 'div' and ('wrap-width50or100' in classes or 'event-articles-wrap-2-cols' in classes):
                            for li in sibling.find_all('li'):
                                a_tag = li.find('a')
                                if a_tag:
                                    lessons.append(clean_text(a_tag.get_text()))
                    sibling = sibling.next_sibling
                    
                for lesson in lessons:
                    if not should_exclude(lesson):
                        output_lines.append(f"  + {lesson}")
            output_lines.append("")
            
    except Exception as e:
        print(f"Exception for Grade {grade}: {e}")
        output_lines.append(f"Lỗi hệ thống khi tải lớp {grade}: {e}")
        output_lines.append("")

# Write to text file
output_path = r"c:\Users\WIND-OF-FALL\Documents\ThucTapTotNghiep\Danh_sach_chuong_va_bai_hoc.txt"
try:
    with open(output_path, "w", encoding="utf-8") as f:
        f.write("\n".join(output_lines))
    print(f"Successfully wrote output to {output_path}")
except Exception as e:
    print(f"Error writing file: {e}")
