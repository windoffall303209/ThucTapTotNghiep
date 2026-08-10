# Script generate all theory h? tr? nh?p, xu?t, ki?m tra ho?c b?o tr? d? li?u v? c?u h?nh c?a d? ?n.
import os
import sys
import json
import time
import re
import requests
import argparse
import hashlib
from pathlib import Path
from urllib.parse import urlparse
from docx import Document
from docx.shared import Pt, Inches
from docx.enum.text import WD_ALIGN_PARAGRAPH

# Ensure utf-8 output encoding for Windows terminal
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = ROOT / ".env"
LESSONS_JSON = ROOT / "output" / "doc" / "current_lessons_for_theory.json"
CACHE_JSON = ROOT / "output" / "doc" / "all_theory_cards.json"
CRAWLED_THEORY_JSON = ROOT / "output" / "doc" / "crawled_theory_cards.json"
IMAGE_DIR = ROOT / "output" / "doc" / "theory_images"

# H?m load_env d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def load_env(env_path):
    env_vars = {}
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                parts = line.split("=", 1)
                if len(parts) == 2:
                    env_vars[parts[0].strip()] = parts[1].strip()
    return env_vars

env = load_env(ENV_PATH)
API_KEY = env.get("NVIDIA_NIM_API_KEY", "")
BASE_URL = env.get("NVIDIA_NIM_BASE_URL", "https://integrate.api.nvidia.com/v1").rstrip("/")
MODEL = env.get("NVIDIA_NIM_MODEL", "meta/llama-3.3-70b-instruct")

# H?m call_nvidia_nim d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def call_nvidia_nim(prompt, retries=3):
    url = f"{BASE_URL}/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {API_KEY}"
    }
    payload = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": "You are an educational assistant that outputs raw JSON content only. Do not enclose the JSON in markdown code blocks like ```json ... ```."},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.2
    }
    
    for attempt in range(1, retries + 1):
        try:
            response = requests.post(url, headers=headers, json=payload, timeout=45)
            if response.status_code == 200:
                data = response.json()
                content = data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
                return content
            else:
                print(f"      [Attempt {attempt}] HTTP Error {response.status_code}: {response.text}")
        except Exception as e:
            print(f"      [Attempt {attempt}] Exception: {str(e)}")
        
        if attempt < retries:
            time.sleep(3 * attempt)
            
    raise Exception("Failed to call API after all retries.")

# H?m fix_json_backslashes d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def fix_json_backslashes(text):
    marker_double_backslash = "___DOUBLE_BACKSLASH_MARKER___"
    marker_escaped_quote = "___ESCAPED_QUOTE_MARKER___"
    
    processed = text.replace("\\\\", marker_double_backslash)
    processed = processed.replace('\\"', marker_escaped_quote)
    
    # Now all remaining backslashes are single backslashes that need to be doubled
    processed = processed.replace("\\", "\\\\")
    
    # Restore the valid escapes
    processed = processed.replace(marker_escaped_quote, '\\"')
    processed = processed.replace(marker_double_backslash, "\\\\")
    
    return processed

# H?m parse_ai_response d?ng ?? ph?n t?ch ??u v?o th?nh c?u tr?c c? th? s? d?ng; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def parse_ai_response(content):
    start_idx = content.find("[")
    end_idx = content.rfind("]")
    
    if start_idx == -1 or end_idx == -1 or end_idx < start_idx:
        start_idx = content.find("{")
        end_idx = content.rfind("}")
        if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
            json_str = fix_json_backslashes(content[start_idx:end_idx+1])
            obj = json.loads(json_str, strict=False)
            return [obj]
        raise Exception("No JSON array or object found in response.")
        
    json_str = fix_json_backslashes(content[start_idx:end_idx+1])
    return json.loads(json_str, strict=False)

# H?m get_mathematical_context d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def get_mathematical_context(lesson_name, grade):
    ln = lesson_name.lower()
    
    # Grade 1 & 2 basic math contexts
    if grade in [1, 2]:
        if "cộng" in ln or "trừ" in ln:
            return """SỰ THẬT TOÁN HỌC (PHÉP CỘNG, PHÉP TRỪ LỚP 1-2):
- Phép cộng là gộp hai hay nhiều nhóm lại với nhau. Ký hiệu dấu cộng (+). Ví dụ: $3 + 2 = 5$.
- Phép trừ là bớt đi từ một nhóm ban đầu. Ký hiệu dấu trừ (-). Ví dụ: $5 - 2 = 3$.
- Thành phần phép tính: Số hạng + Số hạng = Tổng; Số bị trừ - Số trừ = Hiệu."""
        if "nhân" in ln or "chia" in ln:
            return """SỰ THẬT TOÁN HỌC (PHÉP NHÂN, PHÉP CHIA LỚP 2):
- Phép nhân là phép cộng các số hạng bằng nhau. Ví dụ: $2 \\times 3 = 2 + 2 + 2 = 6$.
- Phép chia là chia đều thành các phần bằng nhau. Ví dụ: $6 : 2 = 3$.
- Bảng nhân 2 và 5, Bảng chia 2 và 5:
  + $2 \\times 1 = 2$, $2 \\times 2 = 4$, ..., $2 \\times 10 = 20$.
  + $5 \\times 1 = 5$, $5 \\times 2 = 10$, ..., $5 \\times 10 = 50$.
- Thành phần phép tính: Thừa số $\\times$ Thừa số = Tích; Số bị chia : Số chia = Thương."""

    # Grade 5 specific decimals, percentages, geometry and motion contexts
    if grade == 5:
        if "số thập phân" in ln or "thập phân" in ln:
            return """SỰ THẬT TOÁN HỌC (SỐ THẬP PHÂN LỚP 5):
- Số thập phân gồm hai phần: Phần nguyên (ở bên trái dấu phẩy) và phần thập phân (ở bên phải dấu phẩy).
- Ví dụ: Số $12,34$ có phần nguyên là $12$, phần thập phân là $34$ (gồm $3$ phần mười, $4$ phần trăm).
- Các phép tính với số thập phân:
  + Cộng/Trừ: Viết số hạng này dưới số hạng kia sao cho các chữ số ở cùng một hàng đặt thẳng cột với nhau, các dấu phẩy thẳng cột với nhau.
  + Nhân: Nhân như số tự nhiên, đếm xem trong phần thập phân của cả hai thừa số có bao nhiêu chữ số rồi dùng dấu phẩy tách ở tích bấy nhiêu chữ số kể từ phải sang trái.
  + Chia: Chia số thập phân cho số tự nhiên hoặc chia cho một số thập phân khác."""
            
        if "phần trăm" in ln or "tỉ số phần trăm" in ln:
            return """SỰ THẬT TOÁN HỌC (TỈ SỐ PHẦN TRĂM LỚP 5):
- Tìm tỉ số phần trăm của hai số $a$ và $b$:
  + Bước 1: Tìm thương của $a$ và $b$ ($a : b$).
  + Bước 2: Nhân thương đó với $100$ và viết thêm kí hiệu $\%$ vào bên phải tích tìm được.
- Tìm $p\\%$ của số $A$: Lấy $A : 100 \\times p$ hoặc $A \\times p : 100$.
- Tìm một số biết $p\\%$ của nó là $B$: Lấy $B : p \\times 100$ hoặc $B \\times 100 : p$."""

        if "tam giác" in ln:
            return """SỰ THẬT TOÁN HỌC (DIỆN TÍCH HÌNH TAM GIÁC LỚP 5):
- Công thức tính diện tích hình tam giác: $S = \\frac{a \\times h}{2}$ (với $a$ là độ dài đáy, $h$ là chiều cao tương ứng)."""

        if "hình thang" in ln:
            return """SỰ THẬT TOÁN HỌC (DIỆN TÍCH HÌNH THANG LỚP 5):
- Công thức tính diện tích hình thang: $S = \\frac{(a + b) \\times h}{2}$ (với $a, b$ là độ dài hai đáy, $h$ là chiều cao tương ứng)."""

        if "tròn" in ln:
            return """SỰ THẬT TOÁN HỌC (CHU VI VÀ DIỆN TÍCH HÌNH TRÒN LỚP 5):
- Công thức tính chu vi hình tròn: $C = d \\times 3,14 = 2 \\times r \\times 3,14$ (với $d$ là đường kính, $r$ là bán kính).
- Công thức tính diện tích hình tròn: $S = r \\times r \\times 3,14$ (với $r$ là bán kính hình tròn)."""

        if "thể tích" in ln or "hình hộp chữ nhật" in ln or "hình lập phương" in ln:
            return """SỰ THẬT TOÁN HỌC (THỂ TÍCH CÁC HÌNH LỚP 5):
- Thể tích hình hộp chữ nhật: $V = a \\times b \\times c$ (với $a, b, c$ là ba kích thước cùng đơn vị đo).
- Thể tích hình lập phương: $V = a \\times a \\times a$ (với $a$ là độ dài cạnh)."""

        if "chuyển động" in ln or "vận tốc" in ln or "quãng đường" in ln or "thời gian" in ln:
            return """SỰ THẬT TOÁN HỌC (BÀI TOÁN CHUYỂN ĐỘNG ĐỀU LỚP 5):
- Công thức tính vận tốc: $v = s : t$
- Công thức tính quãng đường: $s = v \\times t$
- Công thức tính thời gian: $t = s : v$
- Chú ý đồng bộ đơn vị đo: nếu quãng đường đơn vị km, thời gian giờ thì vận tốc km/h; nếu quãng đường m, thời gian giây thì vận tốc m/s."""

    # General Grade 4 Measurement Units
    if any(k in ln for k in ["yến", "tạ", "tấn"]):
        return """SỰ THẬT TOÁN HỌC (QUY ĐỔI ĐƠN VỊ KHỐI LƯỢNG):
- $1\\text{ yến} = 10\\text{ kg}$
- $1\\text{ tạ} = 100\\text{ kg} = 10\\text{ yến}$
- $1\\text{ tấn} = 1000\\text{ kg} = 10\\text{ tạ} = 100\\text{ yến}$"""
        
    if "giây" in ln:
        return """SỰ THẬT TOÁN HỌC (QUY ĐỔI THỜI GIAN):
- $1\\text{ phút} = 60\\text{ giây}$
- $1\\text{ giờ} = 60\\text{ phút} = 3600\\text{ giây}$"""
        
    if "thế kỉ" in ln or "thế kỷ" in ln:
        return """SỰ THẬT TOÁN HỌC (QUY ĐỔI THỜI GIAN):
- $1\\text{ thế kỉ} = 100\\text{ năm}$
- Để xác định thế kỉ của một năm:
  + Từ năm $1$ đến năm $100$ là thế kỉ $1$ (I).
  + Từ năm $101$ đến năm $200$ là thế kỉ $2$ (II).
  + Tổng quát: Năm có dạng $ab\\dots xy$, nếu $xy > 00$, thế kỉ = $ab\\dots + 1$. Nếu $xy = 00$, thế kỉ = $ab\\dots$. Ví dụ năm $1900$ thuộc thế kỉ $19$, năm $2026$ thuộc thế kỉ $21$ ($20+1$)."""

    if "mét vuông" in ln or "đề-xi-mét vuông" in ln or "mi-li-mét vuông" in ln or "diện tích" in ln:
        return """SỰ THẬT TOÁN HỌC (QUY ĐỔI ĐƠN VỊ DIỆN TÍCH):
- $1\\text{ m}^2 = 100\\text{ dm}^2 = 10\\ 000\\text{ cm}^2 = 1\\ 000\\ 000\\text{ mm}^2$
- $1\\text{ dm}^2 = 100\\text{ cm}^2 = 10\\ 000\\text{ mm}^2$
- $1\\text{ cm}^2 = 100\\text{ mm}^2$"""

    # General Grade 4 Geometry
    if "góc nhọn" in ln or "góc tù" in ln or "góc bẹt" in ln or "góc" in ln:
        return """SỰ THẬT TOÁN HỌC (CÁC LOẠI GÓC):
- Góc vuông: Bằng $90^\\circ$ (góc đỉnh ê-ke).
- Góc nhọn: Bé hơn góc vuông (nhỏ hơn $90^\\circ$).
- Góc tù: Lớn hơn góc vuông nhưng bé hơn góc bẹt (nằm giữa $90^\\circ$ và $180^\\circ$).
- Góc bẹt: Bằng hai góc vuông (bằng $180^\\circ$)."""

    if "vuông góc" in ln:
        return """SỰ THẬT TOÁN HỌC (ĐƯỜNG THẲNG VUÔNG GÓC):
- Hai đường thẳng cắt nhau tạo thành một góc vuông ($90^\\circ$) được gọi là hai đường thẳng vuông góc với nhau."""

    if "song song" in ln:
        return """SỰ THẬT TOÁN HỌC (ĐƯỜNG THẲNG SONG SONG):
- Hai đường thẳng song song là hai đường thẳng không bao giờ cắt nhau (dù kéo dài vô tận)."""

    if "bình hành" in ln:
        return """SỰ THẬT TOÁN HỌC (HÌNH BÌNH HÀNH):
- Hình bình hành có hai cặp cạnh đối diện song song và bằng nhau.
- Công thức tính diện tích hình bình hành: $S = a \\times h$ (với $a$ là độ dài đáy, $h$ là chiều cao tương ứng)."""

    if "thoi" in ln:
        return """SỰ THẬT TOÁN HỌC (HÌNH THOI):
- Hình thoi có 4 cạnh bằng nhau, hai đường chéo vuông góc với nhau tại trung điểm của mỗi đường.
- Công thức tính diện tích hình thoi: $S = \\frac{m \\times n}{2}$ (với $m$ và $n$ là độ dài hai đường chéo)."""

    # General Grade 4 Arithmetic Word Problems
    if "trung bình cộng" in ln:
        return """SỰ THẬT TOÁN HỌC (TÌM SỐ TRUNG BÌNH CỘNG):
- Số trung bình cộng của một nhóm số = (Tổng các số đó) : (Số lượng các số hạng)
- Công thức: $\\text{TBC} = (a_1 + a_2 + \\dots + a_n) : n$"""

    if "tổng và hiệu" in ln:
        return """SỰ THẬT TOÁN HỌC (TÌM HAI SỐ KHI BIẾT TỔNG VÀ HIỆU):
- Công thức tìm Số lớn: $\\text{Số lớn} = (\\text{Tổng} + \\text{Hiệu}) : 2$
- Công thức tìm Số bé: $\\text{Số bé} = (\\text{Tổng} - \\text{Hiệu}) : 2$
- Có thể tính Số bé trước rồi tính Số lớn: $\\text{Số lớn} = \\text{Số bé} + \\text{Hiệu}$ hoặc $\\text{Số lớn} = \\text{Tổng} - \\text{Số bé}$"""

    # General Fractions
    if "phân số bằng nhau" in ln or "tính chất cơ bản của phân số" in ln:
        return """SỰ THẬT TOÁN HỌC (TÍNH CHẤT CƠ BẢN CỦA PHÂN SỐ):
- Nếu nhân cả tử số và mẫu số của một phân số với cùng một số tự nhiên khác $0$ thì được một phân số bằng phân số đã cho: $\\frac{a}{b} = \\frac{a \\times c}{b \\times c}$ ($c \\neq 0$).
- Nếu chia cả tử số và mẫu số của một phân số cho cùng một số tự nhiên khác $0$ (nếu cả tử và mẫu đều chia hết cho số đó) thì được một phân số bằng phân số đã cho: $\\frac{a}{b} = \\frac{a : c}{b : c}$ ($c \\neq 0$)."""

    if "rút gọn phân số" in ln:
        return """SỰ THẬT TOÁN HỌC (RÚT GỌN PHÂN SỐ):
- Chia cả tử số và mẫu số của phân số cho cùng một số tự nhiên lớn hơn $1$ mà cả tử và mẫu đều chia hết, làm như vậy cho đến khi không rút gọn được nữa (ta được phân số tối giản).
- Phân số tối giản là phân số mà tử số và mẫu số không cùng chia hết cho số tự nhiên nào lớn hơn $1$."""

    if "quy đồng" in ln:
        return """SỰ THẬT TOÁN HỌC (QUY ĐỒNG MẪU SỐ PHÂN SỐ):
- Quy đồng mẫu số hai phân số là biến đổi chúng thành hai phân số mới bằng hai phân số đã cho nhưng có cùng mẫu số.
- Cách quy đồng cơ bản: nhân cả tử và mẫu của phân số thứ nhất với mẫu của phân số thứ hai, nhân cả tử và mẫu của phân số thứ hai với mẫu của phân số thứ nhất."""

    if "so sánh hai phân số" in ln or "so sánh phân số" in ln:
        return """SỰ THẬT TOÁN HỌC (SO SÁNH PHÂN SỐ):
- So sánh cùng mẫu số: Phân số nào có tử số lớn hơn thì phân số đó lớn hơn.
- So sánh khác mẫu số: Ta phải quy đồng mẫu số hai phân số đó về cùng một mẫu số rồi so sánh hai phân số cùng mẫu số mới tạo thành.
- So sánh với $1$: Phân số có tử số lớn hơn mẫu số thì lớn hơn $1$; phân số có tử số bé hơn mẫu số thì bé hơn $1$; phân số có tử số bằng mẫu số thì bằng $1$."""

    if "cộng các phân số" in ln or "cộng hai phân số" in ln:
        return """SỰ THẬT TOÁN HỌC (CỘNG PHÂN SỐ):
- Cộng cùng mẫu số: Ta cộng hai tử số với nhau và giữ nguyên mẫu số: $\\frac{a}{c} + \\frac{b}{c} = \\frac{a+b}{c}$.
- Cộng khác mẫu số: Ta quy đồng mẫu số hai phân số đó về cùng mẫu số rồi thực hiện cộng hai phân số cùng mẫu số mới tạo thành."""

    if "trừ các phân số" in ln or "trừ hai phân số" in ln:
        return """SỰ THẬT TOÁN HỌC (TRỪ PHÂN SỐ):
- Trừ cùng mẫu số: Ta lấy tử số của phân số thứ nhất trừ đi tử số của phân số thứ hai và giữ nguyên mẫu số: $\\frac{a}{c} - \\frac{b}{c} = \\frac{a-b}{c}$.
- Trừ khác mẫu số: Ta quy đồng mẫu số hai phân số đó về cùng mẫu số rồi thực hiện trừ hai phân số cùng mẫu số mới tạo thành."""

    if "nhân phân số" in ln:
        return """SỰ THẬT TOÁN HỌC (NHÂN PHÂN SỐ):
- Muốn nhân hai phân số, ta lấy tử số nhân với tử số, mẫu số nhân với mẫu số: $\\frac{a}{b} \\times \\frac{c}{d} = \\frac{a \\times c}{b \\times d}$."""

    if "chia phân số" in ln:
        return """SỰ THẬT TOÁN HỌC (CHIA PHÂN SỐ):
- Muốn chia một phân số cho một phân số, ta lấy phân số thứ nhất nhân với phân số thứ hai đảo ngược: $\\frac{a}{b} : \\frac{c}{d} = \\frac{a}{b} \\times \\frac{d}{c} = \\frac{a \\times d}{b \\times c}$."""

    if "phân số của một số" in ln:
        return """SỰ THẬT TOÁN HỌC (TÌM PHÂN SỐ CỦA MỘT SỐ):
- Muốn tìm phân số $\\frac{m}{n}$ của số $A$, ta tính $A \\times \\frac{m}{n}$ (lấy $A$ nhân với tử số $m$ rồi chia cho mẫu số $n$ hoặc lấy $A$ chia cho $n$ rồi nhân với $m$)."""

    if "phân số" in ln:
        return """SỰ THẬT TOÁN HỌC (KHÁI NIỆM PHÂN SỐ):
- Phân số viết dưới dạng $\\frac{a}{b}$ với $a, b$ là các số tự nhiên, $b \\neq 0$.
- $a$ là tử số (nằm trên gạch ngang) chỉ số phần được lấy ra.
- $b$ là mẫu số (nằm dưới gạch ngang) chỉ tổng số phần bằng nhau được chia ra.
- Phép chia số tự nhiên $a : b$ ($b \\neq 0$) có thể viết dưới dạng phân số là $\\frac{a}{b}$."""

    # General Large Numbers
    if "các số trong phạm vi" in ln or "các số có nhiều chữ số" in ln or "số tự nhiên" in ln:
        return """SỰ THẬT TOÁN HỌC (HÀNG VÀ LỚP CỦA SỐ TỰ NHIÊN):
- Các hàng của Lớp Đơn Vị: Hàng đơn vị, Hàng chục, Hàng trăm.
- Các hàng của Lớp Nghìn: Hàng nghìn, Hàng chục nghìn, Hàng trăm nghìn.
- Các hàng của Lớp Triệu: Hàng triệu, Hàng chục triệu, Hàng trăm triệu.
- Để đọc số có nhiều chữ số: ta tách số thành lớp (từ phải qua trái, mỗi lớp 3 chữ số), sau đó đọc từng lớp từ trái qua phải kèm tên lớp (tên lớp triệu, nghìn; lớp đơn vị không đọc tên lớp)."""

    return ""

# H?m generate_theory_prompt d?ng ?? x?y d?ng k?t qu? t? c?c ngu?n d? li?u v? quy t?c li?n quan; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def generate_theory_prompt(grade, chapter_name, lesson_name, raw_context):
    math_context = get_mathematical_context(lesson_name, grade)
    context_str = f"\n{math_context}\n" if math_context else ""
    
    raw_context_str = ""
    if raw_context.strip():
        raw_context_str = f"""
Dưới đây là nội dung lý thuyết thô thu thập được từ trang giáo dục (có thể chứa quảng cáo hoặc viết chưa đầy đủ):
---
{raw_context}
---
Dựa vào nội dung thô này, hãy làm sạch quảng cáo và biên soạn lại nội dung chính xác.
"""

    return f"""Bạn là một giáo viên dạy Toán xuất sắc tại Việt Nam, am hiểu sâu sắc về chương trình Sách giáo khoa Toán lớp {grade} (bộ sách Cánh Diều).
{context_str}
{raw_context_str}
Hãy biên soạn nội dung lý thuyết chi tiết, chuẩn xác và trực quan cho bài học sau:
- Khối lớp: Lớp {grade}
- Chương: {chapter_name}
- Bài học: {lesson_name}

YÊU CẦU CỰC KỲ QUAN TRỌNG VỀ TOÁN HỌC & CẤU TRÚC JSON (BẮT BUỘC TUÂN THỦ):
1. KHÔNG được sử dụng các ký hiệu toán học quá phức tạp vượt cấp ngoài chương trình học của Lớp {grade}. Đối với học sinh tiểu học (Lớp 1-5), chỉ dùng các phép toán cơ bản cộng, trừ, nhân, chia, phân số, số thập phân đơn giản.
2. Hãy cực kỳ cẩn thận về các hàng số, lớp số, công thức toán và quy đổi đơn vị đo lường. Mọi ví dụ và phép tính phải chính xác 100% chuẩn toán học sư phạm.
3. Mọi công thức, phép tính và ký hiệu toán học trong body, formula, example bắt buộc phải bọc trong dấu đô-la ($).
4. TUYỆT ĐỐI KHÔNG sử dụng dấu ngoặc kép (") ở bên trong nội dung văn bản của các trường JSON (như body, thinking, example). Nếu cần viết tên gọi, trích dẫn hoặc ký hiệu, bắt buộc sử dụng dấu ngoặc đơn (') thay thế để tránh lỗi cú pháp JSON.

Yêu cầu về cấu trúc của mảng JSON:
1. Chia bài học thành 1 đến 3 thẻ lý thuyết (theory cards) đại diện cho các phần kiến thức quan trọng nhất của bài học.
2. Với mỗi thẻ lý thuyết, bạn cần cung cấp:
   - "thinking": Suy nghĩ và phân tích chi tiết từng bước bằng tiếng Việt để giải quyết bài toán và lập luận toán học chính xác trước khi viết định nghĩa/ví dụ. Phải tự giải nháp ví dụ và kiểm tra lại các số và phép tính cẩn thận.
   - "title": Tên thẻ lý thuyết (ngắn gọn, tập trung vào nội dung chính, ví dụ: "Khái niệm phân số", "Quy tắc quy đồng mẫu số", "Đơn vị Yến, Tạ, Tấn").
   - "body": Nội dung định nghĩa, khái niệm hoặc lý thuyết cốt lõi được trình bày mạch lạc, dễ hiểu với học sinh lớp {grade}. Sử dụng danh sách liệt kê để làm rõ các ý nếu cần.
   - "formula": Quy tắc, công thức tính toán hoặc ghi nhớ cốt lõi (nếu có, bắt buộc dùng LaTeX kẹp trong dấu $).
   - "example": Một ví dụ minh họa thực tế, sinh động, kèm theo lời giải chi tiết từng bước (bắt buộc dùng LaTeX kẹp trong dấu $). Tránh các ví dụ mang tính lặp lại sáo rỗng hoặc quá đơn giản.

Định dạng trả về:
BẮT BUỘC chỉ trả về một mảng JSON duy nhất chứa danh sách các thẻ lý thuyết, không bao gồm mã code block markdown (ví dụ không bọc trong ```json ... ```) và không có bất kỳ lời thoại hay chữ nào khác ngoài JSON.

JSON Schema mẫu:
[
  {{
    "thinking": "Phân tích logic toán học cho thẻ này...",
    "title": "Tên thẻ 1",
    "body": "Nội dung lý thuyết thẻ 1...",
    "formula": "Công thức hoặc quy tắc (sử dụng LaTeX $)...",
    "example": "Ví dụ và lời giải mẫu chi tiết (sử dụng LaTeX $)..."
  }}
]"""

# H?m download_image d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def download_image(session, image_url, cache_dir):
    cache_dir.mkdir(parents=True, exist_ok=True)
    h = hashlib.sha1(image_url.encode('utf-8')).hexdigest()
    ext = os.path.splitext(urlparse(image_url).path)[1]
    if not ext or len(ext) > 5:
        ext = ".png"
    file_path = cache_dir / f"{h}{ext}"
    if file_path.exists():
        return file_path
    
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        }
        r = session.get(image_url, headers=headers, timeout=20)
        if r.status_code == 200:
            file_path.write_bytes(r.content)
            return file_path
    except Exception as e:
        print(f"      [Lỗi tải ảnh] {image_url}: {e}")
    return None

# H?m build_docx_for_grade d?ng ?? x?y d?ng k?t qu? t? c?c ngu?n d? li?u v? quy t?c li?n quan; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def build_docx_for_grade(grade, grade_lessons, output_path):
    print(f"Đang xây dựng file Word cho Lớp {grade} tại: {output_path}...")
    doc = Document()
    session = requests.Session()
    
    # Page setup - Margins
    for section in doc.sections:
        section.top_margin = Inches(1.0)
        section.bottom_margin = Inches(1.0)
        section.left_margin = Inches(1.0)
        section.right_margin = Inches(1.0)
        
    # Set default font
    style = doc.styles['Normal']
    font = style.font
    font.name = 'Arial'
    font.size = Pt(11)
    
    # Title
    title_p = doc.add_paragraph()
    title_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    title_run = title_p.add_run(f"TỔNG HỢP LÝ THUYẾT TOÁN LỚP {grade}\n")
    title_run.font.name = 'Arial'
    title_run.font.size = Pt(20)
    title_run.bold = True
    
    subtitle_run = title_p.add_run("Bộ Sách Giáo Khoa Cánh Diều — Gợi Ý Học Tập & Hình Minh Họa")
    subtitle_run.font.name = 'Arial'
    subtitle_run.font.size = Pt(12)
    subtitle_run.italic = True
    
    doc.add_paragraph("\n")
    
    # Group by Chapter
    chapters = {}
    for item in grade_lessons:
        ch_name = item.get("chapter_name", "Khác")
        if ch_name not in chapters:
            chapters[ch_name] = []
        chapters[ch_name].append(item)
        
    for ch_name, ch_lessons in chapters.items():
        # Chapter Heading
        ch_h = doc.add_heading(ch_name, level=1)
        ch_h.style.font.name = 'Arial'
        ch_h.style.font.size = Pt(16)
        ch_h.style.font.bold = True
        
        for lesson in ch_lessons:
            # Lesson Heading
            l_h = doc.add_heading(lesson["lesson_name"], level=2)
            l_h.style.font.name = 'Arial'
            l_h.style.font.size = Pt(13)
            l_h.style.font.bold = True
            
            cards = lesson.get("theory_cards", [])
            if not cards:
                p = doc.add_paragraph("Chưa có lý thuyết cho bài học này.")
                p.italic = True
                continue
                
            for idx, card in enumerate(cards, 1):
                # Card Title
                c_p = doc.add_paragraph()
                c_run = c_p.add_run(f"• Thẻ {idx}: {card.get('title', '')}")
                c_run.font.name = 'Arial'
                c_run.font.size = Pt(11.5)
                c_run.bold = True
                
                # Card Body
                body = card.get("body", "")
                body_p = doc.add_paragraph()
                body_p.paragraph_format.left_indent = Inches(0.2)
                
                if isinstance(body, list):
                    body_text = "\n".join([f"- {item}" for item in body])
                else:
                    body_text = str(body)
                    
                body_run = body_p.add_run(body_text)
                body_run.font.name = 'Arial'
                
                # Card Formula
                formula = card.get("formula", "")
                if isinstance(formula, list):
                    formula_text = "\n".join([str(item) for item in formula])
                else:
                    formula_text = str(formula).strip()
                    
                if formula_text:
                    form_p = doc.add_paragraph()
                    form_p.paragraph_format.left_indent = Inches(0.4)
                    form_run = form_p.add_run(f"Công thức/Quy tắc: {formula_text}")
                    form_run.font.name = 'Arial'
                    form_run.italic = True
                    form_run.bold = True
                    
                # Card Example
                example = card.get("example", "")
                if isinstance(example, list):
                    example_text = "\n".join([str(item) for item in example])
                else:
                    example_text = str(example).strip()
                    
                if example_text:
                    ex_p = doc.add_paragraph()
                    ex_p.paragraph_format.left_indent = Inches(0.4)
                    ex_run = ex_p.add_run(f"Ví dụ: {example_text}")
                    ex_run.font.name = 'Arial'
                    ex_run.italic = True

                
                # Card Images
                card_images = card.get("images", [])
                for img in card_images:
                    img_url = img.get("url")
                    if img_url:
                        img_path = download_image(session, img_url, IMAGE_DIR)
                        if img_path and img_path.exists():
                            try:
                                img_p = doc.add_paragraph()
                                img_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                                img_p.paragraph_format.left_indent = Inches(0.4)
                                doc.add_picture(str(img_path), width=Inches(3.8))
                                
                                caption_p = doc.add_paragraph()
                                caption_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                                caption_run = caption_p.add_run(f"Hình vẽ: {img.get('alt_text', 'Hình minh họa lý thuyết')}")
                                caption_run.font.name = 'Arial'
                                caption_run.font.size = Pt(9.5)
                                caption_run.italic = True
                            except Exception as img_err:
                                print(f"      [Lỗi chèn ảnh vào Word] {img_path}: {img_err}")
                    
            doc.add_paragraph()  # Blank line between lessons
            
    try:
        doc.save(output_path)
        print(f"Đã lưu file Word thành công tại: {output_path}")
    except PermissionError:
        fallback_path = output_path.with_name(output_path.stem + "_temp.docx")
        print(f"      [CẢNH BÁO] File {output_path.name} đang bị mở và khóa bởi ứng dụng khác. Thử lưu vào file tạm: {fallback_path.name}")
        try:
            doc.save(fallback_path)
            print(f"Đã lưu file Word tạm thành công tại: {fallback_path}")
        except Exception as fe:
            print(f"      [LỖI] Không thể lưu file Word: {fe}")
    except Exception as e:
        print(f"      [LỖI] Không thể lưu file Word: {e}")


# H?m main d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def main():
    parser = argparse.ArgumentParser(description="Sinh lý thuyết Toán 1-5 Cánh Diều bằng NVIDIA NIM API")
    parser.add_argument("--grade", type=int, default=0, help="Khối lớp muốn sinh (1-5), mặc định 0 nghĩa là tất cả")
    parser.add_argument("--limit", type=int, default=0, help="Giới hạn số lượng bài để chạy thử nghiệm")
    parser.add_argument("--force", action="store_true", help="Chạy lại từ đầu, không dùng cache")
    args = parser.parse_args()
    
    if not API_KEY:
        print("Lỗi: Không tìm thấy NVIDIA_NIM_API_KEY trong file .env.")
        sys.exit(1)
        
    if not LESSONS_JSON.exists():
        print(f"Lỗi: Không tìm thấy file bài học tại {LESSONS_JSON}.")
        sys.exit(1)
        
    with open(LESSONS_JSON, "r", encoding="utf-8") as f:
        all_lessons = json.load(f)
        
    # Filter lessons by grade
    if args.grade > 0:
        lessons_to_process = [l for l in all_lessons if l.get("grade") == args.grade]
        print(f"Chế độ chạy lớp {args.grade}: Đã tìm thấy {len(lessons_to_process)} bài học.")
    else:
        lessons_to_process = all_lessons
        print(f"Chế độ chạy TẤT CẢ các lớp: Đã tìm thấy {len(lessons_to_process)} bài học tổng cộng.")
        
    if args.limit > 0:
        lessons_to_process = lessons_to_process[:args.limit]
        print(f"Chế độ giới hạn: Chỉ xử lý {len(lessons_to_process)} bài học đầu tiên.")
        
    # Load crawled theory cards for context and images
    crawled_by_id = {}
    if CRAWLED_THEORY_JSON.exists():
        try:
            with open(CRAWLED_THEORY_JSON, "r", encoding="utf-8") as f:
                crawled_list = json.load(f)
                for item in crawled_list:
                    crawled_by_id[item["lesson_id"]] = item
            print(f"Đã tải {len(crawled_by_id)} bài học từ file lý thuyết thô cào được.")
        except Exception as e:
            print(f"Lỗi khi đọc file lý thuyết thô: {str(e)}")
            
    # Load cache
    cache = {}
    if CACHE_JSON.exists() and not args.force:
        try:
            with open(CACHE_JSON, "r", encoding="utf-8") as f:
                cached_list = json.load(f)
                for item in cached_list:
                    cache[item["lesson_id"]] = item
            print(f"Đã tải {len(cache)} bài học từ bộ nhớ đệm (cache).")
        except Exception as e:
            print(f"Lỗi khi đọc file cache, sẽ sinh mới: {str(e)}")
            
    results = []
    success_count = 0
    
    for idx, lesson in enumerate(lessons_to_process, 1):
        lesson_id = lesson["id"]
        lesson_name = lesson["lesson_name"]
        chapter_name = lesson["chapter_name"]
        grade = lesson["grade"]
        
        print(f"[{idx}/{len(lessons_to_process)}] Đang xử lý Lớp {grade}: {chapter_name} -> {lesson_name}")
        
        if lesson_id in cache and not args.force:
            print("  -> Đã có trong cache. Bỏ qua.")
            # Verify if cached entry has images; if not, merge them
            lesson_entry = cache[lesson_id]
            crawled_item = crawled_by_id.get(lesson_id)
            if crawled_item and lesson_entry.get("theory_cards"):
                # Collect crawled images
                crawled_images = []
                for card in crawled_item.get("theory_cards", []):
                    if card.get("images"):
                        for img in card["images"]:
                            if 'alt_text' not in img:
                                img['alt_text'] = img.get('alt', 'Hình minh họa lý thuyết')
                            crawled_images.append(img)
                # Map images to the first theory card if not present
                first_card = lesson_entry["theory_cards"][0]
                if crawled_images and not first_card.get("images"):
                    first_card["images"] = crawled_images
                    
            results.append(lesson_entry)
            success_count += 1
            continue
            
        # Get raw context and images
        raw_context = ""
        crawled_images = []
        crawled_item = crawled_by_id.get(lesson_id)
        if crawled_item:
            raw_context_parts = []
            for card in crawled_item.get("theory_cards", []):
                title = card.get("title", "")
                body = card.get("body", "")
                if body:
                    body_clean = re.sub(r'<[^>]+>', '', body)
                    raw_context_parts.append(f"Tiêu đề: {title}\nNội dung: {body_clean}")
                if card.get("images"):
                    for img in card["images"]:
                        if 'alt_text' not in img:
                            img['alt_text'] = img.get('alt', 'Hình minh họa lý thuyết')
                        crawled_images.append(img)
            raw_context = "\n\n".join(raw_context_parts)
            
        prompt = generate_theory_prompt(grade, chapter_name, lesson_name, raw_context)
        
        try:
            raw_response = call_nvidia_nim(prompt)
            theory_cards = parse_ai_response(raw_response)
            
            # Map images to first card
            if theory_cards:
                for i, card in enumerate(theory_cards):
                    if i == 0:
                        card["images"] = crawled_images
                    else:
                        card["images"] = []
            
            lesson_entry = {
                "lesson_id": lesson_id,
                "grade": grade,
                "chapter_name": chapter_name,
                "lesson_name": lesson_name,
                "theory_cards": theory_cards
            }
            
            results.append(lesson_entry)
            cache[lesson_id] = lesson_entry
            success_count += 1
            print(f"  -> Sinh thành công {len(theory_cards)} thẻ lý thuyết.")
            
            # Save cache immediately
            with open(CACHE_JSON, "w", encoding="utf-8") as f:
                json.dump(list(cache.values()), f, ensure_ascii=False, indent=2)
                
        except Exception as e:
            print(f"  -> LỖI: Không thể xử lý bài học này: {str(e)}")
            if args.limit > 0:
                print("Dừng do lỗi ở chế độ giới hạn.")
                raise e
                
        time.sleep(0.5)  # Politeness delay
        
    print(f"\nĐã hoàn thành sinh lý thuyết cho {success_count}/{len(lessons_to_process)} bài học.")
    
    # Save the final JSON
    with open(CACHE_JSON, "w", encoding="utf-8") as f:
        json.dump(list(cache.values()), f, ensure_ascii=False, indent=2)
        
    # Group results by grade and build DOCX for each grade
    print("\n--- BẮT ĐẦU XÂY DỰNG FILE WORD CHO TỪNG LỚP ---")
    by_grade = {}
    for item in cache.values():
        g = item.get("grade")
        if g:
            by_grade.setdefault(g, []).append(item)
            
    for g, grade_lessons in by_grade.items():
        # Only build for the requested grade if --grade was specified
        if args.grade > 0 and g != args.grade:
            continue
        output_file = ROOT / "output" / "doc" / f"toan_{g}_ly_thuyet_canh_dieu_co_hinh_ve.docx"
        # Sort lessons by ID/order
        grade_lessons_sorted = sorted(grade_lessons, key=lambda x: x["lesson_id"])
        build_docx_for_grade(g, grade_lessons_sorted, output_file)

# Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u hi?n t?i.
if __name__ == "__main__":
    main()
