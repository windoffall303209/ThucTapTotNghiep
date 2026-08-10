"""Gắn dữ kiện đã biên soạn thủ công lên 33 ảnh minh họa.

Script chỉ thực hiện định dạng ảnh; không sinh câu hỏi, đáp án hoặc lời giải.
"""
# Script prepare grade5 b75 b76 b77 assets hỗ trợ nhập, xuất, kiểm tra hoặc bảo trì dữ liệu và cấu hình của dự án.

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "output" / "doc" / "assets" / "grade5-b75-b76-b77"
OUTPUT = SOURCE / "final"

LABELS = {
    75: [
        "MINH: 16 km/h  •  NAM: 12 km/h  •  CÙNG ĐI 2 giờ",
        "CÁCH NHAU: 220 km  •  TÀU A: 24,5 km/h  •  TÀU B: 30,5 km/h",
        "HAI NHÀ CÁCH NHAU: 1 080 m  •  AN: 70 m/phút  •  BÌNH: 65 m/phút",
        "BẠN A: 4,5 m/s  •  BẠN B: 5,5 m/s  •  GẶP NHAU SAU 40 giây",
        "HAI BẾN CÁCH NHAU: 180 km  •  THUYỀN XANH: 22 km/h  •  THUYỀN ĐỎ: 23 km/h",
        "XE ĐỎ: 48 km/h  •  XE XANH: 52 km/h  •  THỜI GIAN: 1,5 giờ",
        "KHOẢNG CÁCH: 900 m  •  CHIM XANH: 12 m/s  •  CHIM ĐỎ: 13 m/s",
        "HAI THỊ TRẤN CÁCH NHAU: 270 km  •  MỖI XE: 45 km/h",
        "HUY: 72 m/phút  •  CHÂU: 63 m/phút  •  CÙNG ĐI 8 phút",
        "ĐƯỜNG ĐUA DÀI: 600 m  •  KAYAK ĐỎ: 4 m/s  •  KAYAK XANH: 6 m/s",
        "XE XANH: 42 km/h  •  XE LỤC: 38 km/h  •  CÙNG ĐI 2 giờ",
    ],
    76: [
        "CỰ LI 100 m  •  HÒA 15 s  •  LONG 14 s  •  HÙNG 13 s  •  TÙNG 17 s  •  BẢO 16 s",
        "VẬN TỐC: 17 m/s  •  QUÃNG ĐƯỜNG: 3 060 m",
        "100 m HẾT 40 s  •  QUÃNG ĐƯỜNG CẦN ĐI: 1 200 m",
        "VẬN TỐC: 10 km/s  •  TRÁI ĐẤT - MẶT TRĂNG: 378 000 km",
        "DÀI 300 m  •  RỘNG 70 m  •  DẢI CÀY 0,5 m  •  VẬN TỐC 6 km/h",
        "QUÃNG ĐƯỜNG: 420 km  •  THỜI GIAN: 6 giờ",
        "QUÃNG ĐƯỜNG: 150 m  •  THỜI GIAN: 2 phút 30 giây",
        "QUÃNG ĐƯỜNG: 900 km  •  VẬN TỐC: 600 km/h",
        "QUÃNG ĐƯỜNG: 18 km  •  THỜI GIAN: 1 giờ 12 phút",
        "QUÃNG ĐƯỜNG: 240 km  •  VẬN TỐC: 120 km/h",
        "QUÃNG ĐƯỜNG: 2,4 km  •  THỜI GIAN: 30 phút",
    ],
    77: [
        "HÌNH 1  •  HÌNH 2  •  HÌNH 3  •  HÌNH 4  •  HÌNH 5  •  HÌNH 6  •  HÌNH 7",
        "HÌNH THOI  •  HÌNH BÌNH HÀNH  •  TAM GIÁC  •  HÌNH THANG",
        "HÌNH THANG: HAI ĐÁY 12 m VÀ 8 m  •  CHIỀU CAO 6 m",
        "RỘNG 1,2 m  •  PHẦN CHỮ NHẬT CAO 1,2 m  •  BÁN KÍNH NỬA TRÒN 0,6 m",
        "QUAN SÁT SÁU HÌNH KHAI TRIỂN VÀ KIỂM TRA CÁC MẶT KHI GẤP",
        "DÀI 7,5 cm  •  RỘNG 5 cm  •  CAO 4 cm",
        "CẠNH HÌNH LẬP PHƯƠNG: 9 dm",
        "ĐÁY BỂ: 9 dm × 6 dm  •  MỰC NƯỚC DÂNG: 5 cm",
        "NHÀ - SÂN BAY: 96 km  •  Ô TÔ: 40 km/h  •  CÓ MẶT LÚC 16:00",
        "HÌNH CHỮ L: HÌNH CHỮ NHẬT 18 m × 12 m, BỎ GÓC 6 m × 4 m",
        "CHỮ NHẬT 40 m × 20 m  •  BÁN KÍNH NỬA TRÒN 10 m  •  CHẠY 5 m/s",
    ],
}


# Hàm font dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def font(size):
    for path in ("C:/Windows/Fonts/arialbd.ttf", "C:/Windows/Fonts/calibrib.ttf"):
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


# Hàm fitted dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def fitted(draw, text, width):
    for size in range(38, 17, -2):
        selected = font(size)
        box = draw.textbbox((0, 0), text, font=selected)
        if box[2] - box[0] <= width:
            return selected
    return font(18)


# Hàm prepare dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def prepare(source, destination, label):
    image = Image.open(source).convert("RGB")
    if image.width > 1400:
        image = image.resize(
            (1400, round(image.height * 1400 / image.width)),
            Image.Resampling.LANCZOS,
        )
    banner = max(88, round(image.height * 0.11))
    canvas = Image.new("RGB", (image.width, image.height + banner), "white")
    canvas.paste(image, (0, 0))
    draw = ImageDraw.Draw(canvas)
    top = image.height
    draw.rounded_rectangle(
        (16, top + 9, image.width - 16, canvas.height - 10),
        radius=20,
        fill="#EAF3FF",
        outline="#275D9A",
        width=4,
    )
    selected = fitted(draw, label, image.width - 80)
    box = draw.textbbox((0, 0), label, font=selected)
    x = (image.width - (box[2] - box[0])) / 2
    y = top + (banner - (box[3] - box[1])) / 2 - box[1]
    draw.text((x, y), label, font=selected, fill="#17365D")
    destination.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(destination, "JPEG", quality=92, optimize=True, progressive=True)


# Hàm main dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.

def main():
    produced = []
    for lesson, labels in LABELS.items():
        for number, label in enumerate(labels, 1):
            source = SOURCE / f"b{lesson}" / f"b{lesson}-q{number:02d}.png"
            destination = OUTPUT / f"b{lesson}-q{number:02d}.jpg"
            if not source.exists():
                raise FileNotFoundError(source)
            prepare(source, destination, label)
            produced.append(destination)
    if len(produced) != 33:
        raise RuntimeError(f"Cần đúng 33 ảnh, hiện có {len(produced)}")
    print(f"Prepared {len(produced)} images at {OUTPUT}")


# Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
if __name__ == "__main__":
    main()
