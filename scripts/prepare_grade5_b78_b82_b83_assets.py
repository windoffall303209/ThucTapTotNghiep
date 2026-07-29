"""Gắn dữ kiện thủ công lên 33 ảnh của Bài 78, 82 và 83."""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "output" / "doc" / "assets" / "grade5-b78-b82-b83"
OUTPUT = SOURCE / "final"
LABELS = {
    78: [
        "BỘ TANGRAM: 7 MẢNH  •  5 TAM GIÁC  •  1 HÌNH VUÔNG  •  1 HÌNH BÌNH HÀNH",
        "HAI TAM GIÁC: MỖI HÌNH 16 cm²  •  HÌNH VUÔNG: 16 cm²",
        "BỐN MẢNH CÓ DIỆN TÍCH: 18 cm²  •  18 cm²  •  9 cm²  •  27 cm²",
        "NGÔI NHÀ GỒM 8 MẢNH MÀU  •  MỖI MẢNH TÍNH LÀ 4 cm²",
        "THUYỀN BUỒM GỒM 7 MẢNH MÀU  •  MỖI MẢNH TÍNH LÀ 6 cm²",
        "CHÚ MÈO GỒM 8 MẢNH MÀU  •  3 MẢNH LÀ TAM GIÁC",
        "CHÚ CHIM GỒM 8 MẢNH MÀU  •  4 MẢNH LÀ TAM GIÁC",
        "NGƯỜI CHẠY GỒM 8 MẢNH MÀU  •  2 MẢNH LÀM CHÂN",
        "TÊN LỬA GỒM 7 MẢNH MÀU  •  3 MẢNH LÀ TAM GIÁC",
        "CHÚ CÁ GỒM 8 MẢNH MÀU  •  PHẦN ĐUÔI GỒM 2 MẢNH",
        "CHIM THIÊN NGA GỒM 7 MẢNH MÀU  •  2 MẢNH TẠO CỔ VÀ ĐẦU",
    ],
    82: [
        "CÁC CHỮ SỐ: 7  •  3  •  1  •  8  •  9  •  6  •  0",
        "ĐOẠN TỪ 0 ĐẾN 1 000 000  •  CHIA THÀNH 10 PHẦN BẰNG NHAU",
        "LÀM TRÒN: 731 986  •  5 392 107  •  689 540 001",
        "SỐ A: 92 504  •  SỐ B: 103 600",
        "KỆ 1: 1 245 QUYỂN  •  KỆ 2: 986 QUYỂN  •  KỆ 3: 1 769 QUYỂN",
        "BAN ĐẦU: 8 250 THÙNG  •  ĐÃ GIAO: 3 675 THÙNG",
        "24 HÀNG GHẾ  •  MỖI HÀNG 36 GHẾ",
        "864 QUẢ  •  CHIA ĐỀU VÀO 6 THÙNG",
        "BẮT ĐẦU 1 250  •  + 750  •  − 400  •  × 3",
        "125 QUYỂN VỞ × 8 000 đồng  •  75 BÚT × 5 000 đồng",
        "SỐ CÓ 7 CHỮ SỐ: 6 0 8 4 2 7 5",
    ],
    83: [
        "CHIẾC BÁNH CHIA 8 PHẦN BẰNG NHAU  •  4 PHẦN MÀU ĐỎ",
        "BĂNG 1: 2/4  •  BĂNG 2: 3/6  •  BĂNG 3: 5/10",
        "12 QUẢ TÁO  •  5 QUẢ ĐƯỢC KHOANH",
        "ĐOẠN TỪ 0 ĐẾN 1  •  CHIA THÀNH 12 PHẦN BẰNG NHAU",
        "HÌNH TRÁI: 4/6  •  HÌNH PHẢI: 6/9",
        "BỘT: 3/4 kg  •  SỮA: 2/5 l  •  BƠ: 1/8 kg",
        "BỂ CÓ 5/8 DUNG TÍCH NƯỚC  •  DUNG TÍCH BỂ: 240 l",
        "12 Ô ĐẤT  •  4 Ô RAU  •  3 Ô HOA  •  5 Ô ĐẤT TRỐNG",
        "DÂY ĐỎ: 3/4 m  •  DÂY XANH: 2/3 m  •  DÂY LỤC: 5/8 m",
        "20 HỌC SINH  •  5 BẠN XANH  •  10 BẠN CAM  •  5 BẠN LỤC",
        "17 QUẢ  •  8 QUẢ CAM  •  5 QUẢ TÁO  •  4 QUẢ LÊ",
    ],
}


def font(size):
    for path in ("C:/Windows/Fonts/arialbd.ttf", "C:/Windows/Fonts/calibrib.ttf"):
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def fit(draw, text, width):
    for size in range(38, 17, -2):
        selected = font(size)
        box = draw.textbbox((0, 0), text, font=selected)
        if box[2] - box[0] <= width:
            return selected
    return font(18)


def prepare(source, destination, label):
    image = Image.open(source).convert("RGB")
    if image.width > 1400:
        image = image.resize((1400, round(image.height * 1400 / image.width)), Image.Resampling.LANCZOS)
    banner = max(88, round(image.height * 0.11))
    canvas = Image.new("RGB", (image.width, image.height + banner), "white")
    canvas.paste(image, (0, 0))
    draw = ImageDraw.Draw(canvas)
    top = image.height
    draw.rounded_rectangle((16, top + 9, image.width - 16, canvas.height - 10),
                           radius=20, fill="#EAF3FF", outline="#275D9A", width=4)
    selected = fit(draw, label, image.width - 80)
    box = draw.textbbox((0, 0), label, font=selected)
    x = (image.width - (box[2] - box[0])) / 2
    y = top + (banner - (box[3] - box[1])) / 2 - box[1]
    draw.text((x, y), label, font=selected, fill="#17365D")
    destination.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(destination, "JPEG", quality=92, optimize=True, progressive=True)


def main():
    files = []
    for lesson, labels in LABELS.items():
        for number, label in enumerate(labels, 1):
            source = SOURCE / f"b{lesson}" / f"b{lesson}-q{number:02d}.png"
            destination = OUTPUT / f"b{lesson}-q{number:02d}.jpg"
            if not source.exists():
                raise FileNotFoundError(source)
            prepare(source, destination, label)
            files.append(destination)
    if len(files) != 33:
        raise RuntimeError(f"Cần 33 ảnh, hiện có {len(files)}")
    print(f"Prepared {len(files)} images at {OUTPUT}")


if __name__ == "__main__":
    main()
