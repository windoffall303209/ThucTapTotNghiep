# Script thử nghiệm test pdf dùng để khảo sát nhanh một thư viện, dữ liệu hoặc ý tưởng xử lý.
import pypdf
import os

pdf_path1 = "SachGiaoKhoa/Toan_4_Tap_1_-_Canh_dieu_26e5b.pdf"
pdf_path2 = "SachGiaoKhoa/Toan_4_Tap_2_-_Canh_dieu_59332.pdf"

print("Checking PDF 1...")
# Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
if os.path.exists(pdf_path1):
    reader = pypdf.PdfReader(pdf_path1)
    print(f"Total pages in Tap 1: {len(reader.pages)}")
    text_sample = ""
    for idx in range(10, 15):
        page_text = reader.pages[idx].extract_text()
        if page_text:
            text_sample += f"\n--- Page {idx} ---\n" + page_text[:200]
    print("Text Sample from Tap 1:")
    print(text_sample[:1000])
# Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
else:
    print("PDF 1 not found.")

print("\nChecking PDF 2...")
# Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
if os.path.exists(pdf_path2):
    reader = pypdf.PdfReader(pdf_path2)
    print(f"Total pages in Tap 2: {len(reader.pages)}")
    text_sample = ""
    for idx in range(10, 15):
        page_text = reader.pages[idx].extract_text()
        if page_text:
            text_sample += f"\n--- Page {idx} ---\n" + page_text[:200]
    print("Text Sample from Tap 2:")
    print(text_sample[:1000])
# Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
else:
    print("PDF 2 not found.")
