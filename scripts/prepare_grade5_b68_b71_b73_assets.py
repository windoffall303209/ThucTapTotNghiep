"""Gắn dữ kiện đã biên soạn thủ công lên 33 ảnh minh họa.

Script chỉ làm công việc trình bày ảnh: thu nhỏ, thêm dải dữ kiện và lưu bản dùng
trong Word. Nội dung câu hỏi, đáp án và lời giải nằm trong tệp JSON riêng và
không được sinh bởi script.
"""
# Script prepare grade5 b68 b71 b73 assets h? tr? nh?p, xu?t, ki?m tra ho?c b?o tr? d? li?u v? c?u h?nh c?a d? ?n.

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "output" / "doc" / "assets" / "grade5-b68-b71-b73"
OUTPUT = SOURCE / "final"

LABELS = {
    68: [
        "THỨ HAI  •  THỨ BA  •  THỨ TƯ  •  THỨ NĂM  •  THỨ SÁU  •  THỨ BẢY  •  CHỦ NHẬT",
        "8:00 SÁNG HÔM NAY  →  8:00 SÁNG HÔM SAU",
        "THỜI GIAN HỌC: 2 GIỜ 15 PHÚT",
        "THÁNG HAI CỦA MỘT NĂM NHUẬN",
        "KHOẢNG THỜI GIAN: 3/4 THẾ KỈ",
        "THỜI GIAN ĐỌC SÁCH: 1,25 GIỜ",
        "30 PHÚT  •  45 PHÚT  •  35 PHÚT  •  40 PHÚT  •  50 PHÚT  •  40 PHÚT  •  30 PHÚT",
        "THỜI GIAN TRÊN ĐỒNG HỒ BẤM GIỜ: 150 GIÂY",
        "BẮT ĐẦU: 17 GIỜ 35 PHÚT  •  THỜI GIAN NẤU: 1 GIỜ 20 PHÚT",
        "THỜI GIAN HOẠT ĐỘNG: 2,5 NĂM",
        "THỜI LƯỢNG VIDEO: 216 PHÚT",
    ],
    71: [
        "4 GIỜ 35 PHÚT  +  2 GIỜ 48 PHÚT",
        "9 GIỜ 15 PHÚT  -  3 GIỜ 47 PHÚT",
        "MỖI LƯỢT: 1 GIỜ 36 PHÚT  •  4 LƯỢT",
        "TỔNG THỜI GIAN: 8 GIỜ 20 PHÚT  •  CHIA ĐỀU 5 PHẦN",
        "CẤT CÁNH: 10 GIỜ 25 PHÚT  •  THỜI GIAN BAY: 2 GIỜ 10 PHÚT",
        "KHỞI HÀNH: 8 GIỜ 40 PHÚT  •  CÓ MẶT TRƯỚC: 1 GIỜ 35 PHÚT",
        "BẮT ĐẦU: 14 GIỜ 10 PHÚT  •  1 VÒNG: 1 GIỜ 25 PHÚT  •  3 VÒNG",
        "AN: 4 PHÚT 10 GIÂY  •  BÌNH: 2 PHÚT 28 GIÂY",
        "TỪ 6 GIỜ 20 PHÚT ĐẾN 10 GIỜ 05 PHÚT  •  3 LUỐNG RAU",
        "TỪ 13 GIỜ 10 PHÚT ĐẾN 18 GIỜ 10 PHÚT  •  4 CHIẾC GHẾ",
        "3 MẢNG TƯỜNG: 3 GIỜ 27 PHÚT  •  CẦN SƠN 5 MẢNG",
    ],
    73: [
        "QUÃNG ĐƯỜNG: 18 km  •  THỜI GIAN: 45 phút",
        "QUÃNG ĐƯỜNG: 400 m  •  THỜI GIAN: 80 giây",
        "QUÃNG ĐƯỜNG: 36 km  •  THỜI GIAN: 1,5 giờ",
        "QUÃNG ĐƯỜNG: 96 km  •  THỜI GIAN: 1 giờ",
        "QUÃNG ĐƯỜNG: 4,2 m  •  THỜI GIAN: 35 phút",
        "QUÃNG ĐƯỜNG: 240 m  •  THỜI GIAN: 12 giây",
        "QUÃNG ĐƯỜNG: 12 km  •  THỜI GIAN: 20 phút",
        "QUÃNG ĐƯỜNG: 4,8 km  •  THỜI GIAN: 1 giờ 12 phút",
        "QUÃNG ĐƯỜNG: 15 km  •  THỜI GIAN: 50 phút",
        "QUÃNG ĐƯỜNG: 72 km  •  THỜI GIAN: 1 giờ 36 phút",
        "QUÃNG ĐƯỜNG: 1 728 km  •  THỜI GIAN: 24 giờ",
    ],
}


# H?m load_font d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def load_font(size: int):
    candidates = [
        Path("C:/Windows/Fonts/arialbd.ttf"),
        Path("C:/Windows/Fonts/calibrib.ttf"),
        Path("C:/Windows/Fonts/seguisb.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size)
    return ImageFont.load_default()


# H?m fit_font d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def fit_font(draw, text, max_width, starting_size=36):
    size = starting_size
    while size >= 20:
        font = load_font(size)
        box = draw.textbbox((0, 0), text, font=font)
        if box[2] - box[0] <= max_width:
            return font
        size -= 2
    return load_font(20)


# H?m prepare d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def prepare(source_path: Path, output_path: Path, label: str):
    image = Image.open(source_path).convert("RGB")
    max_width = 1400
    if image.width > max_width:
        height = round(image.height * max_width / image.width)
        image = image.resize((max_width, height), Image.Resampling.LANCZOS)

    banner_height = max(86, round(image.height * 0.105))
    canvas = Image.new("RGB", (image.width, image.height + banner_height), "white")
    canvas.paste(image, (0, 0))

    draw = ImageDraw.Draw(canvas)
    top = image.height
    draw.rounded_rectangle(
        (18, top + 10, image.width - 18, canvas.height - 12),
        radius=22,
        fill="#EAF3FF",
        outline="#2B5FAB",
        width=4,
    )
    font = fit_font(draw, label, image.width - 90)
    box = draw.textbbox((0, 0), label, font=font)
    text_width = box[2] - box[0]
    text_height = box[3] - box[1]
    x = (image.width - text_width) / 2
    y = top + (banner_height - text_height) / 2 - box[1]
    draw.text((x, y), label, font=font, fill="#17365D")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output_path, "JPEG", quality=91, optimize=True, progressive=True)


# H?m main d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.

def main():
    produced = []
    for lesson, labels in LABELS.items():
        for index, label in enumerate(labels, start=1):
            source_path = SOURCE / f"b{lesson}" / f"b{lesson}-q{index:02d}.png"
            output_path = OUTPUT / f"b{lesson}-q{index:02d}.jpg"
            if not source_path.exists():
                raise FileNotFoundError(source_path)
            prepare(source_path, output_path, label)
            produced.append(output_path)

    if len(produced) != 33:
        raise RuntimeError(f"Cần đúng 33 ảnh, hiện có {len(produced)}")
    print(f"Prepared {len(produced)} images at {OUTPUT}")


# Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u hi?n t?i.
if __name__ == "__main__":
    main()
