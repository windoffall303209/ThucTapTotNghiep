import requests
import os
import json
import sys

# Ensure UTF-8 output
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

env_vars = {}
if os.path.exists(".env"):
    with open(".env", "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split("=", 1)
            if len(parts) == 2:
                env_vars[parts[0].strip()] = parts[1].strip()

API_KEY = env_vars.get("NVIDIA_NIM_API_KEY", "")
BASE_URL = env_vars.get("NVIDIA_NIM_BASE_URL", "https://integrate.api.nvidia.com/v1").rstrip("/")
MODEL = "meta/llama-3.1-8b-instruct"

# Load crawled theory cards
with open("output/doc/crawled_theory_cards.json", "r", encoding="utf-8") as f:
    crawled_cards = json.load(f)

crawled_by_id = {c["lesson_id"]: c for c in crawled_cards}

test_ids = [157, 158, 159]

for l_id in test_ids:
    crawled_item = crawled_by_id.get(l_id)
    if not crawled_item:
        continue
        
    print(f"\n========================================\nProcessing Lesson ID {l_id}: {crawled_item['lesson_name']}")
    
    # Format the crawled text context
    raw_context_parts = []
    for card in crawled_item.get("theory_cards", []):
        raw_context_parts.append(f"Thẻ: {card.get('title')}\nNội dung: {card.get('body')}")
    raw_context = "\n\n".join(raw_context_parts)
    
    prompt = f"""Bạn là một giáo viên dạy Toán tiểu học xuất sắc tại Việt Nam, am hiểu sâu sắc về chương trình Sách giáo khoa Toán lớp 4 (bộ sách Cánh Diều).
Dưới đây là nội dung lý thuyết thô thu thập được từ trang giáo dục:
---
{raw_context}
---

Hãy biên soạn lại nội dung lý thuyết này thành 1 đến 3 thẻ lý thuyết (theory cards) chất lượng cao, chuẩn xác, loại bỏ hoàn toàn quảng cáo/rác và bổ sung ví dụ minh họa chi tiết.

YÊU CẦU CỰC KỲ QUAN TRỌNG VỀ TOÁN HỌC (BẮT BUỘC TUÂN THỦ):
1. KHÔNG được sử dụng các ký hiệu toán học quá phức tạp vượt cấp như logarit (\\log), tổng (\\sum), giới hạn, lũy thừa lớn, v.v. Học sinh lớp 4 chỉ học các phép tính cộng, trừ, nhân, chia cơ bản.
2. Hãy cực kỳ cẩn thận về HÀNG và LỚP của số tự nhiên:
   - Các hàng thuộc Lớp Đơn Vị: Hàng đơn vị, Hàng chục, Hàng trăm.
   - Các hàng thuộc Lớp Nghìn: Hàng nghìn, Hàng chục nghìn, Hàng trăm nghìn.
   - Các hàng thuộc Lớp Triệu: Hàng triệu, Hàng chục triệu, Hàng trăm triệu.
   Ví dụ số $4\\ 567\\ 890$ gồm: $4$ triệu (hàng triệu), $5$ trăm nghìn (hàng trăm nghìn), $6$ chục nghìn (hàng chục nghìn), $7$ nghìn (hàng nghìn), $8$ trăm (hàng trăm), $9$ chục (hàng chục), $0$ đơn vị (hàng đơn vị). Tuyệt đối không được viết nhầm thành "chục triệu" hay "trăm triệu" cho số có 7 chữ số này!
3. Chú ý về các đơn vị đo lường:
   - $1\\text{{ yến}} = 10\\text{{ kg}}$
   - $1\\text{{ tạ}} = 100\\text{{ kg}}$
   - $1\\text{{ tấn}} = 1000\\text{{ kg}}$
   - Tuyệt đối không được nhầm lẫn $1\\text{{ yến}} = 1\\ 000\\ 000\\text{{ kg}}$!
4. Các số trong phạm vi 1 000 000 là các số nhỏ hơn hoặc bằng 1 000 000 (tức là có tối đa 7 chữ số). Ví dụ: $999\\ 999$, $1\\ 000\\ 000$, $123\\ 456$.
5. Mọi công thức, phép tính và ký hiệu toán học trong body, formula, example bắt buộc phải bọc trong dấu đô-la ($).

Yêu cầu cấu trúc từng thẻ lý thuyết:
- "thinking": Suy nghĩ và lập luận toán học chi tiết từng bước bằng tiếng Việt. Phải tự giải nháp ví dụ và đếm số chữ số từng số để đảm bảo tính chính xác 100%.
- "title": Tên thẻ lý thuyết (ngắn gọn, tập trung vào nội dung chính).
- "body": Nội dung khái niệm cốt lõi, viết ngắn gọn, dễ hiểu với học sinh lớp 4.
- "formula": Quy tắc, công thức tính toán hoặc ghi nhớ cốt lõi (nếu có, bắt buộc dùng LaTeX kẹp trong dấu $).
- "example": Ví dụ thực tế và lời giải mẫu chi tiết từng bước (bắt buộc dùng LaTeX kẹp trong dấu $).

Định dạng trả về:
BẮT BUỘC chỉ trả về một mảng JSON duy nhất chứa danh sách các thẻ lý thuyết, không bao gồm mã code block markdown và không có bất kỳ lời thoại nào khác ngoài JSON.
"""

    payload = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": "You are an educational assistant that outputs raw JSON content only."},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.1
    }
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {API_KEY}"
    }
    
    try:
        response = requests.post(f"{BASE_URL}/chat/completions", headers=headers, json=payload, timeout=45)
        if response.status_code == 200:
            content = response.json()["choices"][0]["message"]["content"].strip()
            print("AI Response:")
            print(content)
        else:
            print("HTTP Error:", response.text)
    except Exception as e:
        print("Exception:", str(e))
