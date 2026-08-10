# Script crawl theory docx hỗ trợ nhập, xuất, kiểm tra hoặc bảo trì dữ liệu và cấu hình của dự án.
import argparse
import hashlib
import json
import re
import subprocess
import sys
import time
import unicodedata
from datetime import datetime
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup, NavigableString, Tag
from docx import Document
from docx.enum.text import WD_BREAK
from docx.shared import Inches, Pt


sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "output" / "doc"
IMAGE_DIR = OUTPUT_DIR / "theory_images"
LESSONS_JSON = OUTPUT_DIR / "current_lessons_for_theory.json"
DEFAULT_JSON_OUTPUT = OUTPUT_DIR / "crawled_theory_cards.json"
DEFAULT_READABLE_DOCX = OUTPUT_DIR / "tong_hop_ly_thuyet_tom_tat_theo_chuong_bai.docx"
DEFAULT_IMPORT_DOCX = OUTPUT_DIR / "ly_thuyet_import_database_doc.docx"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    )
}

INDEX_URLS = {
    1: "https://loigiaihay.com/sgk-toan-1-canh-dieu-c1140.html",
    2: "https://loigiaihay.com/toan-lop-2-canh-dieu-c626.html",
    3: "https://loigiaihay.com/sgk-toan-3-canh-dieu-c861.html",
    4: "https://loigiaihay.com/sgk-toan-4-canh-dieu-c1400.html",
    5: "https://loigiaihay.com/sgk-toan-5-canh-dieu-c1730.html",
    6: "https://loigiaihay.com/toan-lop-6-canh-dieu-c642.html",
    7: "https://loigiaihay.com/sgk-toan-7-canh-dieu-c809.html",
}

SKIP_LINK_KEYWORDS = [
    "luyện tập",
    "ôn tập",
    "bài tập cuối",
    "thực hành",
    "trải nghiệm",
    "em ôn lại",
    "vui học toán",
]


# Hàm clean_text dùng để chuẩn hóa và làm sạch dữ liệu đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def clean_text(value):
    if not value:
        return ""
    value = value.replace("\xa0", " ")
    value = re.sub(r"[ \t\r\f\v]+", " ", value)
    value = re.sub(r"\n\s*\n+", "\n", value)
    return value.strip()


# Hàm compact_text dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def compact_text(value):
    return re.sub(r"\s+", " ", value or "").strip()


# Hàm strip_accents dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def strip_accents(value):
    normalized = unicodedata.normalize("NFD", value or "")
    return "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")


# Hàm normalize_title dùng để chuẩn hóa và làm sạch dữ liệu đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def normalize_title(value):
    text = strip_accents(value).lower()
    text = re.sub(r"\b(bai|chu de|chuong)\b", " ", text)
    text = re.sub(r"^\s*\d+\s*[\.\:-]\s*", " ", text)
    text = re.sub(r"\btrang\s+\d+(\s*,\s*\d+)?\b", " ", text)
    text = re.sub(r"\bsgk\b|\bcanh dieu\b|\btap\s+\d\b|\btoan\s+lop\s+\d\b|\btoan\s+\d\b", " ", text)
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


# Hàm should_skip_link dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def should_skip_link(title):
    lowered = (title or "").lower()
    return any(keyword in lowered for keyword in SKIP_LINK_KEYWORDS)


# Hàm fetch_soup dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def fetch_soup(session, url, timeout=25, retries=3):
    last_error = None
    for attempt in range(1, retries + 1):
        try:
            response = session.get(url, headers=HEADERS, timeout=timeout)
            response.raise_for_status()
            return BeautifulSoup(response.content, "html.parser")
        except requests.RequestException as error:
            last_error = error
            if attempt < retries:
                time.sleep(0.8 * attempt)
    raise last_error


# Hàm normalize_url dùng để chuẩn hóa và làm sạch dữ liệu đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def normalize_url(url):
    parsed = urlparse(url)
    return parsed._replace(fragment="").geturl()


# Hàm get_current_lessons dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def get_current_lessons():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    node_script = r"""
require('dotenv').config();
const Curriculum = require('./models/Curriculum');
(async () => {
  const lessons = await Curriculum.getAllLessons();
  console.log(JSON.stringify(lessons));
  process.exit(0);
})().catch((err) => { console.error(err); process.exit(1); });
"""
    result = subprocess.run(
        ["node", "-e", node_script],
        cwd=ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=True,
    )
    raw = result.stdout.strip()
    json_lines = [line.strip() for line in raw.splitlines() if line.strip().startswith("[")]
    if json_lines:
        raw = json_lines[-1]
    else:
        json_start = raw.find("[{")
        if json_start > 0:
            raw = raw[json_start:]
    lessons = json.loads(raw)
    LESSONS_JSON.write_text(json.dumps(lessons, ensure_ascii=False, indent=2), encoding="utf-8")
    return lessons


# Hàm discover_lesson_links dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def discover_lesson_links(session, grade):
    index_url = INDEX_URLS[grade]
    soup = fetch_soup(session, index_url)
    links = []
    current_chapter = ""

    if grade in {6, 7}:
      for h2 in soup.find_all("h2"):
        h2_text = compact_text(h2.get_text(" "))
        if "các môn khác" in h2_text.lower() or h2_text.lower().startswith("môn "):
            break
        if not any(token in h2_text.lower() for token in ["tập 1", "tập 2"]):
            continue
        sibling = h2.next_sibling
        while sibling:
            if isinstance(sibling, Tag) and sibling.name == "ul":
                for chapter_li in sibling.find_all("li", recursive=False):
                    chapter_a = chapter_li.find("a", recursive=False)
                    if chapter_a:
                        current_chapter = compact_text(chapter_a.get_text(" "))
                    sub_ul = chapter_li.find("ul", class_="list-posts")
                    if not sub_ul:
                        continue
                    for lesson_li in sub_ul.find_all("li"):
                        a = lesson_li.find("a")
                        if not a:
                            continue
                        title = compact_text(a.get_text(" "))
                        if not title or should_skip_link(title):
                            continue
                        links.append({
                            "grade": grade,
                            "chapter": current_chapter,
                            "title": title,
                            "url": normalize_url(urljoin(index_url, a.get("href"))),
                        })
                break
            sibling = sibling.next_sibling
      return links

    for h2 in soup.find_all("h2"):
        h2_text = compact_text(h2.get_text(" "))
        if "các môn khác" in h2_text.lower() or h2_text.lower().startswith("môn "):
            break
        if any(token in h2_text.lower() for token in ["tập 1", "tập 2"]) and "title-event-parent" in (h2.get("class") or []):
            continue
        if not any(token in h2_text.lower() for token in ["chủ đề", "chương"]):
            continue
        current_chapter = h2_text
        sibling = h2.next_sibling
        while sibling:
            if isinstance(sibling, Tag) and sibling.name == "h2":
                break
            if isinstance(sibling, Tag):
                classes = sibling.get("class") or []
                if "wrap-width50or100" in classes or "event-articles-wrap-2-cols" in classes:
                    for a in sibling.find_all("a"):
                        title = compact_text(a.get_text(" "))
                        if not title or should_skip_link(title):
                            continue
                        links.append({
                            "grade": grade,
                            "chapter": current_chapter,
                            "title": title,
                            "url": normalize_url(urljoin(index_url, a.get("href"))),
                        })
            sibling = sibling.next_sibling
    return links


# Hàm build_link_index dùng để xây dựng kết quả từ các nguồn dữ liệu và quy tắc liên quan; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def build_link_index(session):
    all_links = []
    for grade in sorted(INDEX_URLS):
        print(f"Đang dò link lớp {grade}...")
        links = discover_lesson_links(session, grade)
        print(f"  - {len(links)} link bài học")
        all_links.extend(links)
        time.sleep(0.2)
    return all_links


# Hàm find_best_link dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def find_best_link(lesson, links_by_grade):
    grade_links = links_by_grade.get(int(lesson["grade"]), [])
    target = normalize_title(lesson["lesson_name"])
    if not target:
        return None
    for link in grade_links:
        if normalize_title(link["title"]) == target:
            return link
    for link in grade_links:
        link_title = normalize_title(link["title"])
        if target and (target in link_title or link_title in target):
            return link
    return None


# Hàm find_theory_url dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def find_theory_url(session, lesson_url):
    soup = fetch_soup(session, lesson_url)
    content = soup.select_one(".box_content") or soup.select_one("#main-content") or soup
    for a in content.find_all("a"):
        title = compact_text(a.get_text(" "))
        href = a.get("href") or ""
        lowered = f"{title} {href}".lower()
        if "ly-thuyet" in lowered or "lý thuyết" in lowered:
            full_url = normalize_url(urljoin(lesson_url, href))
            if "loigiaihay.com" in urlparse(full_url).netloc:
                return full_url
    return None


# Hàm remove_noise dùng để xóa hoặc giải phóng tài nguyên theo điều kiện an toàn; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def remove_noise(container):
    for node in container.find_all(["script", "style", "ins", "iframe", "button", "form"]):
        node.decompose()
    for selector in [
        ".block_gopy", ".box_other", ".list-article-bottom", ".ads", ".adsbygoogle",
        ".share", ".social", ".modal", ".box_gray", ".ads-responsive",
    ]:
        for node in container.select(selector):
            node.decompose()


# Hàm image_url_from_tag dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def image_url_from_tag(img, base_url):
    src = img.get("data-src") or img.get("data-original") or img.get("src")
    if not src or src.startswith("data:"):
        return ""
    full_url = normalize_url(urljoin(base_url, src))
    lowered = full_url.lower()
    if any(skip in lowered for skip in ["iconcomment", "facebook-share", "themes/images", "ladicdn", "logo"]):
        return ""
    return full_url


# Hàm extract_images dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def extract_images(container, base_url):
    seen = set()
    images = []
    for img in container.find_all("img"):
        url = image_url_from_tag(img, base_url)
        if not url or url in seen:
            continue
        seen.add(url)
        images.append({
            "id": f"image-{len(images) + 1}",
            "url": url,
            "alt_text": compact_text(img.get("alt") or "Hình minh họa lý thuyết"),
            "width_percent": 100,
        })
    return images


# Hàm text_lines_from_container dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def text_lines_from_container(container):
    lines = []
    for node in container.descendants:
        if isinstance(node, NavigableString):
            text = clean_text(str(node))
            if text:
                lines.append(text)
        elif isinstance(node, Tag) and node.name in {"p", "div", "li", "h2", "h3", "h4", "br"}:
            if lines and lines[-1] != "":
                lines.append("")
    compacted = []
    for line in lines:
        if line == "" and (not compacted or compacted[-1] == ""):
            continue
        compacted.append(line)
    return [line for line in compacted if line != ""]


# Hàm split_cards_from_theory dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def split_cards_from_theory(container, base_url, lesson_title):
    cards = []
    current = {"title": lesson_title, "body_lines": []}
    found_section = False

# Hàm flush dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

    def flush():
        body = "\n".join(line for line in current["body_lines"] if line).strip()
        if body:
            cards.append({
                "title": current["title"] or lesson_title,
                "body": body,
                "example": "",
                "images": [],
            })

    for child in container.children:
        if not isinstance(child, Tag):
            text = clean_text(str(child))
            if text:
                current["body_lines"].append(text)
            continue
        if child.name in {"h2", "h3", "h4"}:
            title = compact_text(child.get_text(" "))
            if title and found_section:
                flush()
                current = {"title": title, "body_lines": []}
            elif title:
                current["title"] = title
                found_section = True
            continue
        if child.name in {"p", "div", "ul", "ol", "table"}:
            lines = text_lines_from_container(child)
            current["body_lines"].extend(lines)

    flush()
    if not cards:
        text = "\n".join(text_lines_from_container(container)).strip()
        if text:
            cards.append({"title": lesson_title, "body": text, "example": "", "images": []})

    images = extract_images(container, base_url)
    if images:
        if cards:
            cards[0]["images"] = images
        else:
            cards.append({"title": lesson_title, "body": "", "example": "", "images": images})
    return cards[:8]


# Hàm extract_theory_from_page dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def extract_theory_from_page(session, url, lesson_title):
    soup = fetch_soup(session, url)
    container = soup.select_one(".detail_new") or soup.select_one(".box_content") or soup.select_one(".content_box") or soup
    remove_noise(container)
    cards = split_cards_from_theory(container, url, lesson_title)
    return cards


# Hàm extract_fallback_summary dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def extract_fallback_summary(session, url, lesson_title):
    soup = fetch_soup(session, url)
    container = soup.select_one(".detail_new") or soup.select_one(".box_content") or soup.select_one(".content_box") or soup
    remove_noise(container)
    lines = text_lines_from_container(container)
    selected = []
    for line in lines:
        lowered = line.lower()
        if any(skip in lowered for skip in ["lời giải chi tiết", "bình luận", "bài tiếp theo", "loigiaihay.com"]):
            break
        if line not in selected:
            selected.append(line)
        if len(selected) >= 8:
            break
    body = "\n".join(selected).strip() or f"Chưa tìm thấy phần lý thuyết riêng cho bài {lesson_title}."
    images = extract_images(container, url)[:4]
    return [{"title": lesson_title, "body": body, "example": "", "images": images}]


# Hàm download_image dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def download_image(session, image_url, cache):
    if image_url in cache:
        return cache[image_url]
    IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    response = session.get(image_url, headers=HEADERS, timeout=30)
    response.raise_for_status()
    content_type = response.headers.get("content-type", "").lower()
    if not content_type.startswith("image/"):
        return None
    ext = Path(urlparse(image_url).path).suffix.lower()
    if ext not in {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"}:
        ext = ".jpg" if "jpeg" in content_type else ".png"
    file_path = IMAGE_DIR / f"{hashlib.sha1(image_url.encode('utf-8')).hexdigest()}{ext}"
    if not file_path.exists():
        file_path.write_bytes(response.content)
    cache[image_url] = file_path
    return file_path


# Hàm add_doc_text_block dùng để tạo bản ghi hoặc tài nguyên mới sau khi kiểm tra đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def add_doc_text_block(document, text):
    for line in (text or "").splitlines():
        line = line.strip()
        if not line:
            continue
        if re.match(r"^(\d+[\.\)]|[IVX]+\.)\s+", line):
            document.add_paragraph(line, style="List Bullet")
        else:
            document.add_paragraph(line)


# Hàm add_images dùng để tạo bản ghi hoặc tài nguyên mới sau khi kiểm tra đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def add_images(document, session, images, cache):
    for image in images or []:
        try:
            path = download_image(session, image["url"], cache)
            if path:
                document.add_picture(str(path), width=Inches(4.8))
                if image.get("alt_text"):
                    p = document.add_paragraph(image["alt_text"])
                    p.style = "Caption"
        except Exception as error:
            document.add_paragraph(f"[Không tải được ảnh: {image.get('url')} - {error}]")


# Hàm setup_document_styles dùng để khởi tạo trạng thái và các phụ thuộc cần thiết; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def setup_document_styles(document):
    styles = document.styles
    styles["Normal"].font.name = "Arial"
    styles["Normal"].font.size = Pt(10.5)
    for name in ["Heading 1", "Heading 2", "Heading 3"]:
        styles[name].font.name = "Arial"


# Hàm export_readable_docx dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def export_readable_docx(items, output_path, session):
    doc = Document()
    setup_document_styles(doc)
    doc.add_heading("Tổng hợp lý thuyết tóm tắt theo chương bài", 0)
    doc.add_paragraph(f"Ngày tạo: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    doc.add_paragraph("Nguồn crawl chính: Loigiaihay.com. Nội dung dùng để rà soát trước khi nhập vào database.")
    image_cache = {}

    current_grade = None
    current_chapter = None
    for item in items:
        if item["grade"] != current_grade:
            current_grade = item["grade"]
            doc.add_page_break()
            doc.add_heading(f"Lớp {current_grade}", 1)
            current_chapter = None
        if item["chapter_name"] != current_chapter:
            current_chapter = item["chapter_name"]
            doc.add_heading(current_chapter, 2)

        doc.add_heading(item["lesson_name"], 3)
        doc.add_paragraph(f"Lesson ID: {item['lesson_id']}")
        doc.add_paragraph(f"Nguồn: {item.get('source_url') or item.get('lesson_url') or 'Không tìm thấy'}")
        doc.add_paragraph(f"Trạng thái: {item['status']}")
        for index, card in enumerate(item["theory_cards"], start=1):
            doc.add_paragraph(f"Thẻ {index}: {card['title']}", style="List Bullet")
            add_doc_text_block(doc, card.get("body", ""))
            if card.get("example"):
                doc.add_paragraph(f"Ví dụ: {card['example']}")
            add_images(doc, session, card.get("images", []), image_cache)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    doc.save(output_path)


# Hàm export_import_docx dùng để đồng bộ dữ liệu giữa các định dạng hoặc nguồn khác nhau; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def export_import_docx(items, output_path):
    doc = Document()
    setup_document_styles(doc)
    doc.add_heading("Dữ liệu lý thuyết dạng nhập database", 0)
    doc.add_paragraph("Mỗi bài dưới đây có lesson_id và JSON theory_cards. JSON này có thể dùng để cập nhật cột Lessons.theory_cards.")

    for item in items:
        doc.add_heading(f"Lesson {item['lesson_id']} - {item['lesson_name']}", 2)
        doc.add_paragraph(f"Lớp: {item['grade']}")
        doc.add_paragraph(f"Chương: {item['chapter_name']}")
        doc.add_paragraph(f"Nguồn: {item.get('source_url') or item.get('lesson_url') or 'Không tìm thấy'}")
        payload = {
            "lesson_id": item["lesson_id"],
            "lesson_name": item["lesson_name"],
            "theory_cards": item["theory_cards"],
        }
        paragraph = doc.add_paragraph()
        run = paragraph.add_run(json.dumps(payload, ensure_ascii=False, indent=2))
        run.font.name = "Consolas"
        run.font.size = Pt(8)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    doc.save(output_path)


# Hàm crawl dùng để đồng bộ dữ liệu giữa các định dạng hoặc nguồn khác nhau; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def crawl(args):
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    session = requests.Session()
    lessons = get_current_lessons()
    links = build_link_index(session)
    links_by_grade = {}
    for link in links:
        links_by_grade.setdefault(link["grade"], []).append(link)

    items = []
    for index, lesson in enumerate(lessons, start=1):
        print(f"[{index}/{len(lessons)}] {lesson['lesson_name']}")
        link = find_best_link(lesson, links_by_grade)
        item = {
            "lesson_id": lesson["id"],
            "grade": int(lesson["grade"]),
            "chapter_id": lesson["chapter_id"],
            "chapter_name": lesson["chapter_name"],
            "lesson_name": lesson["lesson_name"],
            "lesson_url": link["url"] if link else "",
            "source_url": "",
            "source_type": "",
            "status": "not_found",
            "theory_cards": [],
        }

        if not link:
            item["theory_cards"] = [{
                "title": lesson["lesson_name"],
                "body": "Chưa tìm thấy nguồn lý thuyết phù hợp để crawl.",
                "example": "",
                "images": [],
            }]
            items.append(item)
            continue

        try:
            theory_url = find_theory_url(session, link["url"])
            if theory_url:
                item["source_url"] = theory_url
                item["source_type"] = "theory_page"
                item["theory_cards"] = extract_theory_from_page(session, theory_url, lesson["lesson_name"])
                item["status"] = "ok"
            else:
                item["source_url"] = link["url"]
                item["source_type"] = "lesson_summary_fallback"
                item["theory_cards"] = extract_fallback_summary(session, link["url"], lesson["lesson_name"])
                item["status"] = "fallback"
        except Exception as error:
            item["status"] = "error"
            item["error"] = str(error)
            item["theory_cards"] = [{
                "title": lesson["lesson_name"],
                "body": f"Lỗi khi crawl nguồn: {error}",
                "example": "",
                "images": [],
            }]

        items.append(item)
        if args.limit and len(items) >= args.limit:
            break
        time.sleep(args.delay)

    args.json_output.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")
    export_readable_docx(items, args.readable_docx, session)
    export_import_docx(items, args.import_docx)
    return items


# Hàm main dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def main():
    parser = argparse.ArgumentParser(description="Crawl lý thuyết tóm tắt Toán Cánh Diều 1-5 và xuất DOCX.")
    parser.add_argument("--limit", type=int, default=0, help="Giới hạn số bài để test.")
    parser.add_argument("--delay", type=float, default=0.12, help="Delay giữa các request bài học.")
    parser.add_argument("--json-output", type=Path, default=DEFAULT_JSON_OUTPUT)
    parser.add_argument("--readable-docx", type=Path, default=DEFAULT_READABLE_DOCX)
    parser.add_argument("--import-docx", type=Path, default=DEFAULT_IMPORT_DOCX)
    args = parser.parse_args()

    items = crawl(args)
    ok = sum(1 for item in items if item["status"] == "ok")
    fallback = sum(1 for item in items if item["status"] == "fallback")
    missing = sum(1 for item in items if item["status"] in {"not_found", "error"})
    print(json.dumps({
        "total": len(items),
        "ok_theory_pages": ok,
        "fallback_summaries": fallback,
        "missing_or_error": missing,
        "json_output": str(args.json_output),
        "readable_docx": str(args.readable_docx),
        "import_docx": str(args.import_docx),
    }, ensure_ascii=False, indent=2))


# Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
if __name__ == "__main__":
    main()
