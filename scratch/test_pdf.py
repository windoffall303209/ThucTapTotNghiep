# Script th? nghi?m test pdf d?ng ?? kh?o s?t nhanh m?t th? vi?n, d? li?u ho?c ? t??ng x? l?.
import pypdf
import os

pdf_path1 = "SachGiaoKhoa/Toan_4_Tap_1_-_Canh_dieu_26e5b.pdf"
pdf_path2 = "SachGiaoKhoa/Toan_4_Tap_2_-_Canh_dieu_59332.pdf"

print("Checking PDF 1...")
# Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u hi?n t?i.
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
# Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u hi?n t?i.
else:
    print("PDF 1 not found.")

print("\nChecking PDF 2...")
# Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u hi?n t?i.
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
# Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u hi?n t?i.
else:
    print("PDF 2 not found.")
