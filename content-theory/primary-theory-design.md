# Quy chuẩn xây dựng lý thuyết Toán cấp Tiểu học

Tài liệu này dùng cho hướng làm mới nội dung lý thuyết. Không phụ thuộc vào các file lý thuyết đã sinh trước đó. Nguồn tham khảo chính là SGK Toán bộ Cánh Diều, sau đó biên soạn lại thành nội dung phù hợp với hệ thống học trực tuyến.

## Nguyên tắc chung

Lý thuyết trong hệ thống không nên hiểu là đoạn văn tóm tắt SGK. Với học sinh tiểu học, lý thuyết nên được chia thành các thẻ học ngắn, mỗi thẻ chỉ xử lý một ý nhận thức.

Mỗi bài học nên có 2 đến 4 thẻ:

- Thẻ quan sát: học sinh nhìn hình, nhóm đồ vật, trục số, mô hình hoặc tình huống.
- Thẻ nhận biết: gọi tên khái niệm, dấu, số, hình, đơn vị hoặc quy tắc.
- Thẻ làm mẫu: hệ thống giải thích một ví dụ thật ngắn theo từng bước.
- Thẻ thử nhanh: học sinh chọn, kéo thả, điền số hoặc bấm đáp án.
- Thẻ ghi nhớ: một câu chốt ngắn, dùng để ôn lại trước khi luyện tập.

## Định hướng theo lớp

### Lớp 1

Đặc điểm nhận thức:

- Học sinh mới làm quen với chữ viết, khả năng đọc hiểu còn hạn chế.
- Tư duy chủ yếu dựa vào hình ảnh, đồ vật thật, thao tác đếm, so sánh trực quan.
- Không nên trình bày lý thuyết bằng đoạn văn dài.

Cách trình bày:

- Mỗi thẻ dùng 1 hình/tình huống lớn và 1 câu lệnh ngắn.
- Ưu tiên câu: "Quan sát", "Đếm", "Chọn", "Nối", "So sánh", "Viết số".
- Công thức gần như không dùng, chỉ dùng ký hiệu đơn giản như +, -, =, <, >.
- Ví dụ cần gắn với đồ vật quen thuộc: quả táo, bút chì, hình khối, ngày trong tuần, đồng hồ.
- Không dùng Chat AI trực tiếp cho học sinh lớp 1.

### Lớp 2

Đặc điểm nhận thức:

- Học sinh đọc tốt hơn nhưng vẫn cần hình ảnh và thao tác.
- Bắt đầu hiểu phép cộng/trừ có nhớ, nhân/chia như thao tác lặp và chia đều.

Cách trình bày:

- Kết hợp hình ảnh với lời giải từng bước rất ngắn.
- Dùng bảng, tia số, bó chục, que tính, nhóm đồ vật.
- Mỗi quy tắc nên có ví dụ mẫu trước khi cho luyện tập.
- Không dùng Chat AI tự do; chỉ dùng gợi ý cố định hoặc lời nhắc từng bước.

### Lớp 3

Đặc điểm nhận thức:

- Học sinh đã đọc hiểu tốt hơn và bắt đầu làm quen với máy tính.
- Có thể học qua quy tắc, ví dụ mẫu, bảng nhân/chia, biểu thức đơn giản.

Cách trình bày:

- Mỗi bài có thể có 1 thẻ khái niệm, 1 thẻ quy tắc, 1 thẻ ví dụ, 1 thẻ luyện nhanh.
- AI chỉ nên đóng vai trò gợi ý khi làm sai, không đưa ngay đáp án.
- Nội dung AI cần bị giới hạn theo bài học hiện tại.

### Lớp 4

Đặc điểm nhận thức:

- Học sinh có thể xử lý khái niệm trừu tượng hơn: phân số, đơn vị đo, hình học, bài toán nhiều bước.
- Cần bắt đầu nhấn mạnh vì sao làm như vậy, không chỉ làm theo mẫu.

Cách trình bày:

- Mỗi thẻ có thể dài hơn lớp 1-3 nhưng vẫn phải rõ một ý.
- Cần có ví dụ mẫu, lỗi sai thường gặp và cách kiểm tra kết quả.
- AI có thể giải thích lại từng bước khi học sinh chọn sai.

### Lớp 5

Đặc điểm nhận thức:

- Học sinh chuẩn bị chuyển sang THCS, có thể tiếp cận công thức, lập luận và bài toán tổng hợp.
- Nội dung có nhiều khái niệm: số thập phân, tỉ số phần trăm, hình học, chuyển động đều.

Cách trình bày:

- Thẻ lý thuyết có thể gồm định nghĩa, công thức, ví dụ mẫu và ghi nhớ.
- Cần phân biệt rõ: hiểu khái niệm, biết quy tắc, vận dụng vào bài toán.
- AI có thể hỗ trợ theo kiểu Socratic: hỏi gợi mở, nhắc bước tiếp theo, kiểm tra đơn vị.

## Schema đề xuất cho thẻ lý thuyết

```json
{
  "id": "card-1",
  "type": "observe | concept | model | quick_try | remember",
  "title": "Tên thẻ ngắn",
  "display_text": "Câu ngắn hiển thị cho học sinh",
  "visual_prompt": "Mô tả hình ảnh hoặc tình huống cần minh họa",
  "student_task": "Việc học sinh cần làm trên thẻ",
  "interaction": "none | choose | drag_drop | count | fill_blank | sort | match",
  "math_focus": "Kiến thức trọng tâm",
  "example": "Ví dụ ngắn nếu có",
  "remember": "Câu ghi nhớ nếu có"
}
```

Với lớp 1 và lớp 2, các trường quan trọng nhất là `visual_prompt`, `display_text`, `student_task`, `interaction`. Với lớp 3 đến lớp 5, có thể bổ sung `formula`, `worked_steps`, `common_mistakes`.

