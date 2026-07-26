import json
import random
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "output" / "grade1-question-pack"
QUESTIONS_PATH = OUTPUT_DIR / "questions.json"


LESSONS = [
    (1, "Chủ đề 1: Các số đến 10", "Trên - dưới. Phải - trái, trước - sau. Ở giữa", "spatial"),
    (2, "Chủ đề 1: Các số đến 10", "Hình vuông - hình tròn, hình tam giác - hình chữ nhật", "shapes"),
    (3, "Chủ đề 1: Các số đến 10", "Các số 1, 2, 3", "numbers_1_3"),
    (4, "Chủ đề 1: Các số đến 10", "Các số 4, 5, 6", "numbers_4_6"),
    (5, "Chủ đề 1: Các số đến 10", "Các số 7, 8, 9", "numbers_7_9"),
    (6, "Chủ đề 1: Các số đến 10", "Số 0", "zero"),
    (7, "Chủ đề 1: Các số đến 10", "Số 10", "ten"),
    (8, "Chủ đề 1: Các số đến 10", "Nhiều hơn - ít hơn - bằng nhau", "quantity_compare"),
    (9, "Chủ đề 1: Các số đến 10", "Bé hơn, dấu <, Bằng nhau, dấu =", "signs"),
    (10, "Chủ đề 2: Phép cộng, phép trừ trong phạm vi 10", "Làm quen với phép cộng, dấu cộng", "addition_intro"),
    (11, "Chủ đề 2: Phép cộng, phép trừ trong phạm vi 10", "Làm quen với phép cộng - dấu cộng (tiếp theo)", "addition_intro_2"),
    (12, "Chủ đề 2: Phép cộng, phép trừ trong phạm vi 10", "Phép cộng trong phạm vi 6", "addition_6"),
    (13, "Chủ đề 2: Phép cộng, phép trừ trong phạm vi 10", "Phép cộng trong phạm vi 6 (tiếp theo)", "addition_6_2"),
    (14, "Chủ đề 2: Phép cộng, phép trừ trong phạm vi 10", "Phép cộng trong phạm vi 10", "addition_10"),
    (15, "Chủ đề 2: Phép cộng, phép trừ trong phạm vi 10", "Phép cộng trong phạm vi 10 (tiếp theo)", "addition_10_2"),
    (16, "Chủ đề 2: Phép cộng, phép trừ trong phạm vi 10", "Khối hộp chữ nhật, khối lập phương", "solids"),
    (17, "Chủ đề 2: Phép cộng, phép trừ trong phạm vi 10", "Làm quen với phép trừ, dấu trừ", "subtraction_intro"),
    (18, "Chủ đề 2: Phép cộng, phép trừ trong phạm vi 10", "Phép trừ trong phạm vi 6", "subtraction_6"),
    (19, "Chủ đề 2: Phép cộng, phép trừ trong phạm vi 10", "Phép trừ trong phạm vi 6 (tiếp theo)", "subtraction_6_2"),
    (20, "Chủ đề 2: Phép cộng, phép trừ trong phạm vi 10", "Phép trừ trong phạm vi 10", "subtraction_10"),
    (21, "Chủ đề 2: Phép cộng, phép trừ trong phạm vi 10", "Phép trừ trong phạm vi 10 (tiếp theo)", "subtraction_10_2"),
]


SCENES = [
    "một góc lớp học tiểu học sáng sủa",
    "sân chơi trường học nhiều màu sắc",
    "bàn học với đồ dùng học tập gọn gàng",
    "khu vườn nhỏ có hoa và cây",
    "quầy đồ chơi thân thiện cho trẻ em",
    "phòng đọc sách ấm áp",
    "buổi dã ngoại trong công viên",
    "góc xếp hình bằng gỗ",
    "kệ đồ dùng học toán",
    "bàn ăn nhẹ với trái cây",
    "đường đi trong công viên",
    "góc nghệ thuật của lớp",
    "sân trường vào buổi sáng",
    "bàn thực hành toán trực quan",
    "không gian kể chuyện cho học sinh lớp 1",
]


def mistake(value, reason):
    return {"wrong_answer": str(value), "hint": reason}


def numeric_distractors(answer, candidates, low=0, high=None):
    answer = int(answer)
    values = []
    for candidate in candidates:
        candidate = int(candidate)
        if high is not None:
            candidate = min(candidate, high)
        candidate = max(candidate, low)
        if candidate != answer and candidate not in values:
            values.append(candidate)

    radius = 1
    while len(values) < 2:
        for candidate in (answer - radius, answer + radius):
            if candidate < low or (high is not None and candidate > high):
                continue
            if candidate != answer and candidate not in values:
                values.append(candidate)
                if len(values) == 2:
                    break
        radius += 1
    return values[0], values[1]


def make(question, answer, visual, qtype, wrong_a, hint_a, wrong_b, hint_b, difficulty="Cơ bản"):
    return {
        "question": question,
        "answer": str(answer),
        "type": qtype,
        "difficulty": difficulty,
        "visual_prompt": visual,
        "common_mistakes": [
            mistake(wrong_a, hint_a),
            mistake(wrong_b, hint_b),
        ],
    }


def spatial_questions():
    return [
        make("Lan đứng bên trái Mai. Ai đứng bên phải Lan?", "Mai", "hai bạn nhỏ đứng cạnh nhau, Lan ở trái và Mai ở phải", "Nhận biết vị trí", "Lan", "Em đã nhìn từ phía người trong tranh thay vì từ phía người xem.", "Không xác định", "Hãy tìm người còn lại ở phía bên phải của Lan."),
        make("Quả bóng ở dưới chiếc bàn. Chiếc bàn ở vị trí nào so với quả bóng?", "Ở trên", "chiếc bàn và quả bóng nằm rõ ràng bên dưới bàn", "Quan hệ đảo", "Ở dưới", "Em đã giữ nguyên quan hệ mà chưa đổi chiều so sánh.", "Ở giữa", "Trong câu hỏi chỉ có hai vật nên không có vị trí ở giữa."),
        make("Nam đứng trước Bình. Bình đứng ở đâu so với Nam?", "Ở sau", "hai bạn xếp hàng, Nam phía trước và Bình phía sau", "Trước - sau", "Ở trước", "Khi đổi đối tượng so sánh, trước trở thành sau.", "Ở bên trái", "Câu hỏi hỏi thứ tự trước sau, không hỏi trái phải."),
        make("Ba bạn An, Bình, Chi đứng thành hàng theo thứ tự đó. Ai đứng ở giữa?", "Bình", "ba bạn nhỏ xếp hàng, bạn Bình ở giữa", "Xác định ở giữa", "An", "An đứng ở đầu hàng, không phải vị trí giữa.", "Chi", "Chi đứng cuối hàng, không phải vị trí giữa."),
        make("Con mèo ở bên phải chiếc ghế. Muốn đến chiếc ghế, mèo cần đi về phía nào?", "Sang trái", "mèo ở bên phải một chiếc ghế, khoảng cách rõ ràng", "Định hướng", "Sang phải", "Đi sang phải sẽ xa chiếc ghế hơn.", "Đi lên", "Chiếc ghế nằm ngang với mèo, không ở phía trên."),
        make("Trên kệ có sách ở ngăn trên và hộp bút ở ngăn dưới. Vật nào ở cao hơn?", "Sách", "kệ hai tầng, sách ở tầng trên và hộp bút ở tầng dưới", "Trên - dưới", "Hộp bút", "Hộp bút ở ngăn dưới nên thấp hơn.", "Cả hai", "Hai vật ở hai ngăn khác nhau nên không cao bằng nhau."),
        make("Minh đứng giữa Hoa và Phúc. Hãy nêu hai bạn đứng hai bên Minh.", "Hoa và Phúc", "ba bạn đứng cạnh nhau, Minh ở chính giữa", "Mô tả vị trí", "Chỉ Hoa", "Cần nêu đủ cả hai bạn ở hai bên Minh.", "Minh và Phúc", "Minh là người ở giữa, không phải người đứng bên cạnh chính mình."),
        make("Đúng hay sai: Nếu bút chì ở bên trái thước kẻ thì thước kẻ ở bên phải bút chì.", "Đúng", "bút chì bên trái và thước kẻ bên phải trên bàn học", "Đúng - sai", "Sai", "Hai quan hệ trái và phải đổi chiều tương ứng.", "Không đủ dữ kiện", "Vị trí của hai vật đã được mô tả đầy đủ."),
        make("Một chú chim đậu trên cành, một chú khác đứng dưới gốc cây. Chú chim nào gần bầu trời hơn?", "Chú chim trên cành", "một cây nhỏ với chim trên cành và chim dưới gốc", "Vận dụng", "Chú chim dưới gốc", "Chim dưới gốc ở vị trí thấp hơn.", "Cả hai như nhau", "Hai chú chim ở độ cao khác nhau."),
        make("Điền từ thích hợp: Chiếc cặp ở ___ hai chiếc ghế.", "Giữa", "hai chiếc ghế và một chiếc cặp đặt chính giữa", "Điền từ", "Trên", "Chiếc cặp không nằm cao hơn hai ghế.", "Bên phải", "Cặp nằm giữa, không lệch hẳn sang phải."),
        make("Bé đi từ cửa lớp đến bàn giáo viên. Bàn ở phía trước bé. Bé nên đi thẳng hay quay lại?", "Đi thẳng", "bé đứng trong lớp hướng về bàn giáo viên phía trước", "Tình huống", "Quay lại", "Quay lại sẽ đi xa bàn ở phía trước.", "Rẽ trái", "Không có dữ kiện cho thấy bàn nằm bên trái."),
        make("Trong hàng, Vy đứng sau Hà nhưng trước Linh. Thứ tự từ trước đến sau là gì?", "Hà, Vy, Linh", "ba bạn xếp hàng theo thứ tự Hà, Vy, Linh", "Sắp xếp", "Vy, Hà, Linh", "Vy đứng sau Hà nên không thể đứng trước Hà.", "Hà, Linh, Vy", "Vy phải đứng trước Linh."),
        make("Một chiếc hộp ở dưới bàn và một quyển sách ở trên bàn. Vật nào cách sàn gần hơn?", "Chiếc hộp", "bàn học, hộp dưới gầm và sách trên mặt bàn", "Suy luận vị trí", "Quyển sách", "Sách ở trên bàn nên xa sàn hơn.", "Hai vật bằng nhau", "Hai vật ở độ cao khác nhau."),
        make("Robot quay mặt về phía trước. Quả bóng nằm phía sau robot. Robot cần quay lại hay đi thẳng để thấy bóng?", "Quay lại", "robot đồ chơi quay lưng về phía quả bóng", "Đổi hướng", "Đi thẳng", "Đi thẳng làm robot xa quả bóng phía sau.", "Rẽ phải", "Bóng ở phía sau, không xác định là bên phải."),
        make("Có ba ngôi nhà: nhà đỏ bên trái, nhà xanh ở giữa, nhà vàng bên phải. Nhà nào ở giữa?", "Nhà xanh", "ba ngôi nhà đồ chơi đỏ, xanh, vàng xếp ngang", "Tổng hợp", "Nhà đỏ", "Nhà đỏ ở bên trái.", "Nhà vàng", "Nhà vàng ở bên phải."),
    ]


def shape_questions():
    return [
        make("Hình nào có 4 cạnh bằng nhau và 4 góc?", "Hình vuông", "các khối hình phẳng bằng giấy màu, nổi bật hình vuông", "Nhận biết hình", "Hình tròn", "Hình tròn không có cạnh thẳng và góc.", "Hình tam giác", "Hình tam giác chỉ có 3 cạnh."),
        make("Hình nào không có cạnh thẳng?", "Hình tròn", "hình tròn cạnh các hình vuông và tam giác", "Phân loại", "Hình chữ nhật", "Hình chữ nhật có 4 cạnh thẳng.", "Hình tam giác", "Hình tam giác có 3 cạnh thẳng."),
        make("Một hình có 3 cạnh. Đó là hình gì?", "Hình tam giác", "một hình tam giác bằng gỗ trên bàn", "Dựa vào số cạnh", "Hình vuông", "Hình vuông có 4 cạnh.", "Hình tròn", "Hình tròn không có cạnh thẳng."),
        make("Cánh cửa lớp thường có dạng hình gì?", "Hình chữ nhật", "cánh cửa lớp học dạng chữ nhật", "Liên hệ thực tế", "Hình tròn", "Cánh cửa không có đường bao tròn.", "Hình tam giác", "Cánh cửa thường có 4 cạnh và dài hơn chiều rộng."),
        make("Đúng hay sai: Hình vuông và hình chữ nhật đều có 4 cạnh.", "Đúng", "hình vuông và hình chữ nhật đặt cạnh nhau", "Đúng - sai", "Sai", "Hãy đếm cạnh của từng hình, cả hai đều có 4 cạnh.", "Chỉ hình vuông đúng", "Hình chữ nhật cũng có 4 cạnh."),
        make("Trong các hình vuông, tròn, tam giác, hình nào có nhiều cạnh nhất?", "Hình vuông", "ba hình vuông, tròn và tam giác tách biệt", "So sánh", "Hình tam giác", "Tam giác có 3 cạnh, ít hơn hình vuông 4 cạnh.", "Hình tròn", "Hình tròn không có cạnh thẳng."),
        make("Hai hình tam giác ghép cạnh nhau có thể tạo hình lớn hơn. Mỗi tam giác ban đầu có mấy cạnh?", "3 cạnh", "hai mảnh ghép tam giác màu sắc", "Tách - ghép", "4 cạnh", "Em có thể đã đếm đường bao của hình ghép thay vì một tam giác.", "2 cạnh", "Một hình kín tam giác cần 3 cạnh."),
        make("Tìm hình khác loại: ba hình tròn và một hình vuông. Hình nào khác loại?", "Hình vuông", "ba miếng ghép tròn và một miếng ghép vuông", "Tìm khác loại", "Hình tròn", "Có ba hình tròn cùng loại, chỉ hình vuông khác.", "Tất cả giống nhau", "Các hình có đường bao khác nhau."),
        make("Dãy hình: tròn, vuông, tròn, vuông, ... Hình tiếp theo là gì?", "Hình tròn", "chuỗi miếng ghép xen kẽ tròn và vuông", "Quy luật", "Hình vuông", "Quy luật đang xen kẽ tròn rồi vuông.", "Hình tam giác", "Dãy chưa dùng hình tam giác."),
        make("Một tấm biển có 4 cạnh, hai cạnh dài và hai cạnh ngắn. Tấm biển có dạng hình gì?", "Hình chữ nhật", "tấm biển chữ nhật đơn giản trong sân trường", "Mô tả đặc điểm", "Hình vuông", "Hình vuông có 4 cạnh bằng nhau.", "Hình tam giác", "Tam giác chỉ có 3 cạnh."),
        make("Hình tròn và hình tam giác khác nhau rõ nhất ở điều gì?", "Hình tròn không có cạnh thẳng, tam giác có 3 cạnh", "hình tròn và tam giác đặt cạnh nhau để so sánh", "Giải thích", "Cả hai đều có 3 cạnh", "Hình tròn không có cạnh thẳng.", "Cả hai đều có 4 cạnh", "Tam giác có 3 cạnh, không phải 4."),
        make("Nếu xoay một hình vuông, nó có còn là hình vuông không?", "Có", "một hình vuông đứng thẳng và một hình vuông xoay nghiêng", "Bất biến khi xoay", "Không", "Xoay hình không làm thay đổi số cạnh hay độ dài các cạnh.", "Thành hình tròn", "Đường bao vẫn gồm 4 cạnh thẳng."),
        make("Khung ảnh hình chữ nhật có mấy góc?", "4 góc", "khung ảnh chữ nhật trên bàn", "Đếm góc", "3 góc", "Hãy lần lượt chỉ bốn góc của khung.", "Không có góc", "Hình chữ nhật có các góc rõ ràng."),
        make("Em cần chọn miếng ghép không có góc để làm bánh xe. Chọn hình gì?", "Hình tròn", "bộ miếng ghép hình học và bánh xe đồ chơi", "Ứng dụng", "Hình vuông", "Hình vuông có 4 góc nên không lăn trơn như bánh xe.", "Hình tam giác", "Hình tam giác có 3 góc."),
        make("Sắp xếp theo số cạnh tăng dần: hình tròn, hình tam giác, hình vuông.", "Hình tròn, hình tam giác, hình vuông", "ba hình học cơ bản xếp trên bàn học", "Sắp xếp", "Hình tam giác, hình vuông, hình tròn", "Hình tròn có 0 cạnh thẳng nên phải đứng đầu.", "Hình vuông, hình tam giác, hình tròn", "Thứ tự này đang giảm dần số cạnh."),
    ]


def number_questions(values, label):
    lo, hi = min(values), max(values)
    mid = values[len(values) // 2]
    next_after_lo = min(lo + 1, hi)
    before_hi = max(hi - 1, lo)
    return [
        make(f"Đếm từ {lo} đến {hi} theo thứ tự tăng dần.", ", ".join(map(str, values)), f"các thẻ số từ {lo} đến {hi} đặt trên bàn", "Đọc dãy số", ", ".join(map(str, reversed(values))), "Em đã đếm theo thứ tự giảm dần.", str(hi), "Cần nêu đủ các số trong dãy."),
        make(f"Số nào lớn nhất trong các số {', '.join(map(str, values))}?", hi, f"các khối đồ chơi mang số từ {lo} đến {hi}", "Tìm số lớn nhất", lo, "Đây là số bé nhất trong nhóm.", mid, "Vẫn còn một số lớn hơn số này."),
        make(f"Số nào bé nhất trong các số {', '.join(map(str, values))}?", lo, f"các thẻ số từ {lo} đến {hi} xếp rời", "Tìm số bé nhất", hi, "Đây là số lớn nhất trong nhóm.", mid, "Vẫn còn một số bé hơn số này."),
        make(f"Số đứng ngay sau {lo} là số nào?", next_after_lo, f"đường số ngắn từ {lo} đến {hi}", "Số liền sau", lo, "Số liền sau phải lớn hơn một đơn vị.", hi, "Em đã nhảy qua số đứng ngay sau."),
        make(f"Số đứng ngay trước {hi} là số nào?", before_hi, f"đường số ngắn kết thúc ở {hi}", "Số liền trước", hi, "Số liền trước phải bé hơn một đơn vị.", lo, "Em đã lùi quá nhiều bước."),
        make(f"Điền số còn thiếu: {lo}, __, {hi}.", mid, f"ba ô số theo thứ tự, ô giữa để trống, chủ đề {label}", "Điền dãy", lo, "Số này đã có ở đầu dãy.", hi, "Số này đã có ở cuối dãy."),
        make(f"Có {mid} chiếc bút. Thêm 1 chiếc thì có tất cả bao nhiêu chiếc?", min(mid + 1, hi + 1), f"nhóm bút chì màu trong {SCENES[2]}", "Thêm một", mid, "Em chưa tính chiếc bút được thêm.", max(mid - 1, 0), "Thêm vào thì số lượng phải tăng, không giảm."),
        make(f"Có {hi} quả bóng. Bớt 1 quả thì còn bao nhiêu quả?", hi - 1, f"những quả bóng mềm trong {SCENES[4]}", "Bớt một", hi, "Em chưa bớt quả bóng nào.", max(hi - 2, 0), "Em đã bớt hai thay vì một."),
        make(f"Đúng hay sai: {lo} bé hơn {hi}.", "Đúng", f"hai thẻ số {lo} và {hi} cạnh nhau", "Đúng - sai", "Sai", f"Trong dãy số, {lo} đứng trước {hi} nên bé hơn.", "Bằng nhau", "Hai số có giá trị khác nhau."),
        make(f"Sắp xếp các số {hi}, {lo}, {mid} từ bé đến lớn.", ", ".join(map(str, sorted({hi, lo, mid}))), f"ba thẻ số {hi}, {lo}, {mid} lộn xộn", "Sắp xếp", ", ".join(map(str, sorted({hi, lo, mid}, reverse=True))), "Đây là thứ tự từ lớn đến bé.", str(mid), "Cần sắp xếp đủ ba số."),
        make(f"Số {mid} được tạo bởi bao nhiêu đồ vật nếu mỗi đồ vật được tính là 1?", mid, f"một nhóm đồ vật nhỏ minh họa số {mid}", "Biểu diễn số", max(mid - 1, 0), "Em đã bỏ sót một đồ vật.", mid + 1, "Em đã đếm thừa một đồ vật."),
        make(f"Chọn cách đọc đúng của số {hi}.", number_word(hi), f"thẻ số lớn {hi} trang trí đơn giản", "Đọc số", number_word(max(hi - 1, 0)), "Em đã đọc số đứng trước.", number_word(hi + 1), "Em đã đọc số đứng sau."),
        make(f"Có hai nhóm, một nhóm {lo} vật và một nhóm {hi} vật. Nhóm nào nhiều hơn?", f"Nhóm {hi} vật", f"hai nhóm đồ chơi tách biệt có quy mô {lo} và {hi}", "So sánh nhóm", f"Nhóm {lo} vật", f"{lo} bé hơn {hi}.", "Hai nhóm bằng nhau", "Hai nhóm có số lượng khác nhau."),
        make(f"Tách số {hi} thành {lo} và một số khác. Số còn lại là bao nhiêu?", hi - lo, f"một nhóm đồ vật được tách làm hai phần cho bài {label}", "Tách số", hi, "Đây là số ban đầu, chưa phải phần còn lại.", lo, "Hai phần không nhất thiết bằng nhau."),
        make(f"Điền dấu thích hợp: {mid} __ {hi}.", "<" if mid < hi else "=", f"hai thẻ số {mid} và {hi} với khoảng trống ở giữa", "Điền dấu", ">", "Hãy nhìn vị trí của hai số trên dãy số.", "=", "Hai số không bằng nhau."),
    ]


def number_word(value):
    words = {0: "không", 1: "một", 2: "hai", 3: "ba", 4: "bốn", 5: "năm", 6: "sáu", 7: "bảy", 8: "tám", 9: "chín", 10: "mười"}
    return words.get(value, str(value))


def zero_questions():
    return [
        make("Trong giỏ không có quả táo nào. Giỏ có bao nhiêu quả táo?", 0, "một chiếc giỏ trống trên bàn", "Ý nghĩa số 0", 1, "Em đã đếm chiếc giỏ như một quả táo.", 2, "Không có quả táo nào nên không thể là 2."),
        make("Số nào biểu thị không có đồ vật nào?", 0, "một hộp đồ chơi trống và thẻ số 0", "Nhận biết số", 1, "Số 1 biểu thị có một đồ vật.", 10, "Số 10 biểu thị mười đồ vật."),
        make("Điền số còn thiếu: 0, 1, __, 3.", 2, "dãy thẻ số từ 0 đến 3 với một ô trống", "Dãy số", 0, "Số 0 đã đứng đầu dãy.", 3, "Số 3 đã đứng cuối dãy."),
        make("Số đứng ngay sau 0 là số nào?", 1, "đoạn tia số bắt đầu từ 0", "Số liền sau", 0, "Số liền sau phải lớn hơn một đơn vị.", 2, "Em đã nhảy qua số 1."),
        make("Đúng hay sai: 0 bé hơn 1.", "Đúng", "hai thẻ số 0 và 1 trên đường số", "Đúng - sai", "Sai", "Trên dãy số, 0 đứng trước 1.", "Bằng nhau", "0 và 1 là hai số khác nhau."),
        make("Có 3 con chim, cả 3 bay đi. Còn lại bao nhiêu con?", 0, "cành cây trống sau khi chim bay đi", "Bớt hết", 3, "Em chưa bớt những con chim đã bay đi.", 1, "Cả 3 đều bay đi nên không còn con nào."),
        make("Điền số: 0 + 2 = __.", 2, "hai khối đồ chơi cạnh một khay trống", "Cộng với 0", 0, "Cộng 0 không làm mất số đang có.", 3, "Không có đồ vật nào được thêm ngoài 2 đồ vật."),
        make("Điền số: 4 - 4 = __.", 0, "bốn đồ vật được lấy đi hết khỏi khay", "Trừ hết", 4, "Đây là số ban đầu, chưa trừ.", 1, "Lấy đi hết thì không còn một vật nào."),
        make("Trong các số 2, 0, 1, số nào bé nhất?", 0, "ba thẻ số 2, 0, 1 lộn xộn", "So sánh", 1, "Số 0 còn bé hơn 1.", 2, "Số 2 là số lớn nhất trong nhóm."),
        make("Sắp xếp 2, 0, 1 từ bé đến lớn.", "0, 1, 2", "ba thẻ số 2, 0, 1 để sắp xếp", "Sắp xếp", "2, 1, 0", "Đây là thứ tự từ lớn đến bé.", "1, 0, 2", "Số 0 phải đứng trước số 1."),
        make("Một hộp có 0 viên bi, hộp kia có 2 viên bi. Hộp nào ít bi hơn?", "Hộp có 0 viên bi", "hai hộp, một hộp trống và một hộp có vài viên bi", "So sánh nhóm", "Hộp có 2 viên bi", "Hai viên bi nhiều hơn không viên bi.", "Hai hộp bằng nhau", "Hai hộp có số lượng khác nhau."),
        make("Có thể vẽ 0 ngôi sao bằng cách để ô trống không?", "Có", "một ô giấy trống sạch sẽ cạnh biểu tượng ngôi sao mẫu", "Biểu diễn số 0", "Không", "Ô trống biểu thị không có ngôi sao nào.", "Phải vẽ 1 ngôi sao", "Vẽ 1 ngôi sao sẽ biểu thị số 1."),
        make("Điền dấu thích hợp: 0 __ 3.", "<", "hai thẻ số 0 và 3 có khoảng trống ở giữa", "Điền dấu", ">", "0 đứng trước 3 trên dãy số.", "=", "0 và 3 không bằng nhau."),
        make("Số 0 nằm trước hay sau số 1 trên dãy số?", "Trước số 1", "dãy số 0, 1, 2 rõ ràng", "Vị trí trên dãy", "Sau số 1", "Dãy số tăng bắt đầu từ 0 rồi đến 1.", "Cùng vị trí", "Mỗi số có một vị trí riêng."),
        make("An có 1 chiếc kẹo và cho bạn 1 chiếc. An còn mấy chiếc kẹo?", 0, "một bạn nhỏ trao chiếc kẹo duy nhất cho bạn", "Tình huống", 1, "Chiếc kẹo duy nhất đã được cho đi.", 2, "Cho đi làm số kẹo giảm, không tăng."),
    ]


def ten_questions():
    return [
        make("Số nào đứng ngay sau số 9?", 10, "đoạn dãy số 8, 9, 10 với điểm nhấn ở cuối", "Số liền sau", 9, "Số 9 là số đang xét, chưa phải số liền sau.", 8, "Số 8 đứng trước 9."),
        make("Số nào đứng ngay trước số 10?", 9, "đường số kết thúc ở số 10", "Số liền trước", 10, "Số liền trước phải bé hơn một đơn vị.", 8, "Số 8 cách số 10 hai đơn vị."),
        make("Đếm tiếp: 7, 8, 9, __.", 10, "bốn thẻ số theo hàng, thẻ cuối để trống", "Điền dãy số", 9, "Số 9 đã có ngay trước ô trống.", 11, "Lớp 1 đang đếm tiếp từng một đơn vị."),
        make("Chọn cách đọc đúng của số 10.", "mười", "thẻ số 10 lớn trong góc học toán", "Đọc số", "một không", "Số 10 được đọc là mười trong cách đọc số tự nhiên.", "chín", "Chín là số đứng trước 10."),
        make("Trong các số 8, 9, 10, số nào lớn nhất?", 10, "ba thẻ số 8, 9, 10 đặt cạnh nhau", "Tìm số lớn nhất", 9, "Số 10 đứng sau số 9.", 8, "Số 8 là số bé nhất trong nhóm."),
        make("Sắp xếp 10, 8, 9 từ bé đến lớn.", "8, 9, 10", "ba thẻ số 10, 8, 9 lộn xộn", "Sắp xếp", "10, 9, 8", "Đây là thứ tự từ lớn đến bé.", "8, 10, 9", "Số 9 phải đứng trước số 10."),
        make("Một bó có 10 que tính. Nếu tách 7 que sang một bên thì bên còn lại có mấy que?", 3, "mười que tính được tách thành nhóm bảy và nhóm còn lại", "Tách số 10", 7, "Đây là số que ở nhóm đã tách ra.", 2, "7 và 2 mới có 9 que."),
        make("Khung 10 ô đã tô kín tất cả các ô. Có bao nhiêu ô được tô?", 10, "khung mười ô được tô kín rõ ràng", "Khung 10", 9, "Khung đã kín nên không thiếu ô nào.", 5, "Năm chỉ bằng một nửa khung."),
        make("Hai bàn tay có tất cả bao nhiêu ngón tay?", 10, "hai bàn tay trẻ em xòe đủ ngón", "Liên hệ thực tế", 5, "Em mới đếm một bàn tay.", 9, "Hãy đếm đủ ngón của cả hai bàn tay."),
        make("Điền số: 6 và __ gộp lại thành 10.", 4, "mười khối nhỏ chia thành nhóm sáu và nhóm còn lại", "Tách - gộp", 6, "Hai phần không cần bằng nhau; 6 và 6 vượt quá 10.", 3, "6 và 3 mới được 9."),
        make("Điền số: 10 bớt 1 còn __.", 9, "mười đồ vật, một vật được tách ra", "Bớt một", 10, "Em chưa bớt một.", 8, "Em đã bớt hai."),
        make("Đúng hay sai: 10 lớn hơn 9.", "Đúng", "hai thẻ số 10 và 9 trên dãy số", "Đúng - sai", "Sai", "10 đứng sau 9 trên dãy số nên lớn hơn.", "Bằng nhau", "10 và 9 khác nhau một đơn vị."),
        make("Một khung có 10 ô, đã tô 8 ô. Còn mấy ô chưa tô?", 2, "khung mười ô với tám ô màu và hai ô trống", "Khung 10", 8, "Đây là số ô đã tô, không phải số ô trống.", 1, "Hãy đếm đủ hai ô chưa tô."),
        make("Sắp xếp 8, 10, 9 từ bé đến lớn.", "8, 9, 10", "ba thẻ số 8, 10, 9 lộn xộn", "Sắp xếp", "10, 9, 8", "Đây là thứ tự từ lớn đến bé.", "8, 10, 9", "Số 9 phải đứng trước số 10."),
        make("Có 5 quả đỏ và 5 quả xanh. Có tất cả bao nhiêu quả?", 10, "hai nhóm trái cây đỏ và xanh cân đối", "Gộp hai nhóm", 5, "Em mới đếm một nhóm.", 9, "5 và 5 tạo thành 10, không phải 9."),
    ]


def quantity_compare_questions():
    pairs = [(3, 5), (6, 2), (4, 4), (7, 9), (8, 5), (1, 3), (10, 10), (2, 6), (9, 7), (5, 5), (4, 8), (6, 6), (3, 2), (7, 4), (1, 1)]
    qs = []
    for index, (a, b) in enumerate(pairs):
        if index % 3 == 0:
            answer = "Nhóm A" if a > b else "Nhóm B" if b > a else "Hai nhóm bằng nhau"
            q = f"Nhóm A có {a} vật, nhóm B có {b} vật. Nhóm nào nhiều hơn?"
            wrong_a = "Nhóm A" if answer != "Nhóm A" else "Nhóm B"
            wrong_b = "Hai nhóm bằng nhau" if answer != "Hai nhóm bằng nhau" else "Nhóm B"
            qtype = "Nhiều hơn"
        elif index % 3 == 1:
            answer = "Nhóm A" if a < b else "Nhóm B" if b < a else "Hai nhóm bằng nhau"
            q = f"Nhóm A có {a} vật, nhóm B có {b} vật. Nhóm nào ít hơn?"
            wrong_a = "Nhóm A" if answer != "Nhóm A" else "Nhóm B"
            wrong_b = "Hai nhóm bằng nhau" if answer != "Hai nhóm bằng nhau" else "Nhóm B"
            qtype = "Ít hơn"
        else:
            answer = "Bằng nhau" if a == b else "Không bằng nhau"
            q = f"Hai nhóm có lần lượt {a} và {b} vật. Hai nhóm có bằng nhau không?"
            wrong_a = "Bằng nhau" if answer != "Bằng nhau" else "Không bằng nhau"
            wrong_b = "Không xác định"
            qtype = "Bằng nhau"
        qs.append(make(q, answer, f"hai nhóm đồ vật A và B tách biệt, minh họa so sánh số lượng {a} và {b}", qtype, wrong_a, "Hãy ghép từng vật của hai nhóm hoặc so sánh hai số.", wrong_b, "Số lượng của hai nhóm đã được cho đầy đủ."))
    return qs


def sign_questions():
    pairs = [(2, 5), (4, 4), (7, 9), (1, 3), (6, 6), (3, 8), (5, 5), (0, 2), (8, 10), (2, 2), (4, 7), (1, 1), (6, 9), (3, 3), (5, 8)]
    qs = []
    for index, (a, b) in enumerate(pairs):
        answer = "<" if a < b else "="
        forms = [
            f"Điền dấu < hoặc =: {a} __ {b}.",
            f"Chọn dấu đúng để so sánh {a} và {b}.",
            f"Đúng hay sai: Có thể điền dấu {answer} vào {a} __ {b}.",
        ]
        question = forms[index % len(forms)]
        expected = "Đúng" if index % 3 == 2 else answer
        wrong_a = ">" if expected != ">" else "<"
        wrong_b = "=" if expected != "=" else "<"
        qs.append(make(question, expected, f"hai thẻ số {a} và {b}, khoảng trống rõ ở giữa, không hiển thị dấu đáp án", "So sánh bằng dấu", wrong_a, "Số bên trái không lớn hơn số bên phải.", wrong_b, "Chỉ dùng dấu bằng khi hai số có cùng giá trị."))
    return qs


def addition_questions(limit, phase=1, intro=False):
    rng = random.Random(limit * 100 + phase)
    pairs = []
    while len(pairs) < 15:
        a = rng.randint(0, max(1, limit - 1))
        b = rng.randint(0 if phase == 2 else 1, max(1, limit - a))
        if a + b > limit or (a, b) in pairs:
            continue
        pairs.append((a, b))
    qs = []
    scope = "Bài làm quen" if intro else f"Phạm vi {limit}"
    if phase == 2:
        scope += " - luyện tiếp"
    for index, (a, b) in enumerate(pairs):
        total = a + b
        mode = index % 6
        if mode == 0:
            q = f"Tính: {a} + {b} = ?"
            answer = total
            qtype = "Tính tổng"
        elif mode == 1:
            q = f"Có {a} con bướm, bay đến thêm {b} con. Có tất cả bao nhiêu con bướm?"
            answer = total
            qtype = "Tình huống gộp"
        elif mode == 2:
            q = f"Điền số còn thiếu: {a} + __ = {total}."
            answer = b
            qtype = "Tìm số hạng"
        elif mode == 3:
            q = f"Đúng hay sai: {a} + {b} = {total}."
            answer = "Đúng"
            qtype = "Đúng - sai"
        elif mode == 4:
            q = f"Hai nhóm có {a} và {b} đồ vật. Phép tính nào cho biết có tất cả bao nhiêu đồ vật?"
            answer = f"{a} + {b} = {total}"
            qtype = "Lập phép tính"
        else:
            q = f"So sánh hai tổng: {a} + {b} và {b} + {a}. Hai tổng có bằng nhau không?"
            answer = "Bằng nhau"
            qtype = "Đổi chỗ số hạng"
        q = f"{scope}: {q}"
        wrong_num_a = max(total - 1, 0)
        wrong_num_b = min(total + 1, limit + 1)
        if isinstance(answer, int):
            wa, wb = numeric_distractors(answer, (wrong_num_a, wrong_num_b), 0, limit + 1)
        elif answer == "Đúng":
            wa, wb = "Sai", str(total - 1)
        elif answer == "Bằng nhau":
            wa, wb = "Không bằng nhau", f"{a + b + 1}"
        else:
            wa, wb = f"{a} - {b}", f"{a} + {b} = {wrong_num_b}"
        qs.append(make(q, answer, f"minh họa trực quan hai nhóm đồ vật {a} và {b} trong {SCENES[index]}", qtype, wa, "Em có thể đã đếm thiếu hoặc dùng nhầm phép trừ.", wb, "Hãy gộp hai nhóm rồi đếm lại từng vật.", "Vận dụng" if index >= 10 else "Cơ bản"))
    return qs


def solid_questions():
    return [
        make("Khối nào có các mặt đều là hình vuông bằng nhau?", "Khối lập phương", "khối lập phương gỗ cạnh khối hộp chữ nhật", "Nhận biết khối", "Khối hộp chữ nhật", "Các mặt của khối hộp chữ nhật không nhất thiết đều là hình vuông bằng nhau.", "Hình vuông", "Hình vuông là hình phẳng, không phải khối."),
        make("Hộp sữa dạng viên gạch thường gần giống khối nào?", "Khối hộp chữ nhật", "hộp sữa dạng khối hộp chữ nhật", "Liên hệ thực tế", "Khối lập phương", "Hộp sữa thường có chiều dài, rộng, cao không bằng nhau.", "Hình chữ nhật", "Hình chữ nhật là hình phẳng."),
        make("Con xúc xắc thường có dạng khối gì?", "Khối lập phương", "một con xúc xắc lớn bằng gỗ", "Liên hệ thực tế", "Khối hộp chữ nhật", "Xúc xắc có các cạnh bằng nhau.", "Hình vuông", "Mặt xúc xắc là hình vuông nhưng cả vật là một khối."),
        make("Khối lập phương có thể xếp chồng ổn định không?", "Có", "nhiều khối lập phương đồ chơi xếp chồng", "Đặc điểm sử dụng", "Không", "Các mặt phẳng giúp khối xếp chồng ổn định.", "Chỉ khi lăn", "Lăn không giúp xếp chồng."),
        make("Khối hộp chữ nhật có lăn trơn như quả bóng không?", "Không", "khối hộp chữ nhật cạnh một quả bóng tròn", "So sánh chuyển động", "Có", "Các mặt phẳng và cạnh làm khối không lăn trơn.", "Luôn lăn nhanh", "Khối hộp thường trượt hoặc lật hơn là lăn trơn."),
        make("Đúng hay sai: Khối lập phương là một vật có chiều dài, chiều rộng và chiều cao.", "Đúng", "khối lập phương trong không gian ba chiều", "Đúng - sai", "Sai", "Khối là vật ba chiều nên có ba kích thước.", "Chỉ có chiều dài", "Đó là cách mô tả đoạn thẳng, không phải khối."),
        make("Mặt của khối lập phương có dạng hình gì?", "Hình vuông", "khối lập phương trong suốt làm nổi bật một mặt vuông", "Nhận biết mặt", "Hình tròn", "Khối lập phương không có mặt tròn.", "Hình tam giác", "Mỗi mặt có 4 cạnh bằng nhau."),
        make("Một viên gạch đồ chơi dài hơn chiều rộng. Viên gạch gần giống khối nào?", "Khối hộp chữ nhật", "viên gạch đồ chơi dạng hộp dài", "Phân loại", "Khối lập phương", "Khối lập phương có các cạnh bằng nhau.", "Hình chữ nhật", "Cần gọi tên khối ba chiều."),
        make("Tìm vật khác loại: xúc xắc, khối Rubik, hộp giày. Vật nào thường là khối hộp chữ nhật?", "Hộp giày", "xúc xắc, khối đồ chơi lập phương và hộp giày", "Tìm khác loại", "Xúc xắc", "Xúc xắc gần khối lập phương.", "Khối Rubik", "Khối Rubik cũng gần khối lập phương."),
        make("Nếu đặt khối lập phương lên một mặt, khối có đứng yên được không?", "Có", "khối lập phương đặt trên mặt bàn phẳng", "Dự đoán", "Không", "Mặt phẳng giúp khối đứng yên.", "Khối sẽ luôn lăn", "Khối lập phương không có mặt cong để lăn liên tục."),
        make("Một hộp quà có chiều dài, rộng, cao bằng nhau. Hộp quà gần giống khối gì?", "Khối lập phương", "hộp quà vuông vắn dạng khối lập phương", "Mô tả đặc điểm", "Khối hộp chữ nhật dài", "Ba kích thước bằng nhau là dấu hiệu của khối lập phương.", "Hình vuông", "Hộp quà là vật ba chiều."),
        make("Khối hộp chữ nhật và khối lập phương giống nhau ở điểm nào?", "Đều có các mặt phẳng", "hai khối gỗ chữ nhật và lập phương cạnh nhau", "So sánh", "Đều có mặt tròn", "Hai khối này không có mặt tròn.", "Đều chỉ là hình phẳng", "Cả hai đều là khối ba chiều."),
        make("Muốn xây bức tường đồ chơi, nên chọn khối có mặt phẳng hay vật tròn?", "Khối có mặt phẳng", "trẻ xây tường bằng các khối gỗ phẳng", "Ứng dụng", "Vật tròn", "Vật tròn dễ lăn và khó xếp ổn định.", "Chọn vật nào cũng như nhau", "Hình dạng ảnh hưởng khả năng xếp chồng."),
        make("Đúng hay sai: Một mặt của khối hộp chữ nhật có thể là hình chữ nhật.", "Đúng", "khối hộp chữ nhật làm nổi bật một mặt chữ nhật", "Đúng - sai", "Sai", "Tên khối đã gợi ý các mặt thường là hình chữ nhật.", "Mặt luôn là hình tròn", "Khối hộp chữ nhật không có mặt tròn."),
        make("Phân loại hai vật: con xúc xắc và hộp bút dài. Vật nào gần khối lập phương?", "Con xúc xắc", "xúc xắc cạnh hộp bút dài dạng hộp", "Tổng hợp", "Hộp bút dài", "Hộp bút dài gần khối hộp chữ nhật.", "Cả hai đều là hình vuông", "Hai vật là khối, không phải hình phẳng."),
    ]


def subtraction_questions(limit, phase=1, intro=False):
    rng = random.Random(limit * 200 + phase)
    pairs = []
    while len(pairs) < 15:
        a = rng.randint(1 if intro else 2, limit)
        b = rng.randint(0 if phase == 2 else 1, a)
        if (a, b) in pairs:
            continue
        pairs.append((a, b))
    qs = []
    scope = "Bài làm quen" if intro else f"Phạm vi {limit}"
    if phase == 2:
        scope += " - luyện tiếp"
    for index, (a, b) in enumerate(pairs):
        remain = a - b
        mode = index % 6
        if mode == 0:
            q = f"Tính: {a} - {b} = ?"
            answer = remain
            qtype = "Tính hiệu"
        elif mode == 1:
            q = f"Có {a} quả bóng, lấy đi {b} quả. Còn lại bao nhiêu quả bóng?"
            answer = remain
            qtype = "Tình huống bớt"
        elif mode == 2:
            q = f"Điền số còn thiếu: {a} - __ = {remain}."
            answer = b
            qtype = "Tìm số bị bớt"
        elif mode == 3:
            q = f"Đúng hay sai: {a} - {b} = {remain}."
            answer = "Đúng"
            qtype = "Đúng - sai"
        elif mode == 4:
            q = f"Từ {a} đồ vật bớt {b} đồ vật. Phép tính nào biểu thị số còn lại?"
            answer = f"{a} - {b} = {remain}"
            qtype = "Lập phép tính"
        else:
            q = f"Có {a} bạn, {b} bạn rời hàng. Số bạn còn lại nhiều hơn hay ít hơn {a}?"
            answer = "Ít hơn"
            qtype = "Nhận biết thay đổi"
        q = f"{scope}: {q}"
        wrong_num_a = a + b
        wrong_num_b = min(remain + 1, limit)
        if isinstance(answer, int):
            wa, wb = numeric_distractors(answer, (wrong_num_a, wrong_num_b), 0, limit)
        elif answer == "Đúng":
            wa, wb = "Sai", str(remain + 1)
        elif answer == "Ít hơn":
            wa, wb = "Nhiều hơn", "Bằng nhau"
        else:
            wa, wb = f"{a} + {b}", f"{a} - {b} = {wrong_num_b}"
        qs.append(make(q, answer, f"minh họa trực quan một nhóm {a} đồ vật và hành động bớt đi {b} trong {SCENES[index]}", qtype, wa, "Em có thể đã dùng phép cộng hoặc chưa bớt đủ số vật.", wb, "Hãy gạch từng vật bị lấy đi rồi đếm phần còn lại.", "Vận dụng" if index >= 10 else "Cơ bản"))
    return qs


def questions_for(kind):
    if kind == "spatial":
        return spatial_questions()
    if kind == "shapes":
        return shape_questions()
    if kind == "numbers_1_3":
        return number_questions([1, 2, 3], "các số 1, 2, 3")
    if kind == "numbers_4_6":
        return number_questions([4, 5, 6], "các số 4, 5, 6")
    if kind == "numbers_7_9":
        return number_questions([7, 8, 9], "các số 7, 8, 9")
    if kind == "zero":
        return zero_questions()
    if kind == "ten":
        return ten_questions()
    if kind == "quantity_compare":
        return quantity_compare_questions()
    if kind == "signs":
        return sign_questions()
    if kind == "addition_intro":
        return addition_questions(5, phase=1, intro=True)
    if kind == "addition_intro_2":
        return addition_questions(6, phase=2, intro=True)
    if kind == "addition_6":
        return addition_questions(6, phase=1)
    if kind == "addition_6_2":
        return addition_questions(6, phase=2)
    if kind == "addition_10":
        return addition_questions(10, phase=1)
    if kind == "addition_10_2":
        return addition_questions(10, phase=2)
    if kind == "solids":
        return solid_questions()
    if kind == "subtraction_intro":
        return subtraction_questions(5, phase=1, intro=True)
    if kind == "subtraction_6":
        return subtraction_questions(6, phase=1)
    if kind == "subtraction_6_2":
        return subtraction_questions(6, phase=2)
    if kind == "subtraction_10":
        return subtraction_questions(10, phase=1)
    if kind == "subtraction_10_2":
        return subtraction_questions(10, phase=2)
    raise ValueError(f"Unknown lesson kind: {kind}")


def image_prompt(question, visual, lesson, index):
    return (
        "Use case: scientific-educational\n"
        "Asset type: square illustrated background for a Vietnamese grade-1 math question card\n"
        f"Primary request: create a distinct child-friendly educational illustration for question {index} of lesson {lesson}.\n"
        f"Scene/backdrop: {visual}.\n"
        "Style/medium: polished 2D children's textbook illustration, clean shapes, soft natural lighting, crisp edges.\n"
        "Composition/framing: square, important objects in the lower two-thirds, calm light area across the upper third reserved for later text overlay.\n"
        "Color palette: balanced teal, yellow, coral, green and neutral white; not dominated by one hue.\n"
        "Constraints: age-appropriate for 6-year-olds; visually clear; one coherent scene; no answer cues; no equations; no numerals; no letters; no words.\n"
        "Avoid: text, watermark, logo, clutter, tiny objects, photorealistic faces, confusing perspective, decorative borders."
    )


def build_pack():
    pack = {
        "title": "Bộ câu hỏi Toán lớp 1 - Chủ đề 1 và 2",
        "grade": 1,
        "questions_per_lesson": 15,
        "lesson_count": len(LESSONS),
        "lessons": [],
    }
    all_questions = set()

    for lesson_id, chapter, lesson, kind in LESSONS:
        questions = questions_for(kind)
        if len(questions) != 15:
            raise ValueError(f"Lesson {lesson_id} generated {len(questions)} questions instead of 15")

        lesson_entry = {
            "lesson_id": lesson_id,
            "chapter": chapter,
            "lesson": lesson,
            "questions": [],
        }
        for index, question in enumerate(questions, start=1):
            normalized = " ".join(question["question"].lower().split())
            if normalized in all_questions:
                raise ValueError(f"Duplicate question: {question['question']}")
            all_questions.add(normalized)
            question_id = f"lesson-{lesson_id:02d}-q-{index:02d}"
            question["id"] = question_id
            question["image_file"] = f"images/{question_id}.jpg"
            question["image_prompt"] = image_prompt(
                question["question"], question["visual_prompt"], lesson, index
            )
            lesson_entry["questions"].append(question)
        pack["lessons"].append(lesson_entry)

    pack["question_count"] = sum(len(lesson["questions"]) for lesson in pack["lessons"])
    return pack


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    pack = build_pack()
    QUESTIONS_PATH.write_text(json.dumps(pack, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {pack['question_count']} questions across {pack['lesson_count']} lessons to {QUESTIONS_PATH}")


if __name__ == "__main__":
    main()
