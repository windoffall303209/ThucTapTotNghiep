# Kiểm tra phạm vi kiến thức lớp 1 - bài 1 đến bài 5

Nguồn đối chiếu trực tiếp: `SachGiaoKhoa/Toán 1 Cánh diều.pdf`, PDF trang 7-16, tương ứng trang sách 6-15.

## Kết luận theo từng bài

| Bài | Kiến thức được phép hỏi | Nội dung chưa được dùng |
| --- | --- | --- |
| 1. Vị trí | Trên, dưới, phải, trái, trước, sau, ở giữa | Suy luận vị trí dài hoặc góc nhìn mơ hồ |
| 2. Hình cơ bản | Nhận biết, gọi tên, tìm đồ vật và ghép hình vuông, tròn, tam giác, chữ nhật | Số cạnh, số góc, tính chất cạnh |
| 3. Số 1, 2, 3 | Đếm, đọc, viết và ghép số với lượng | Cộng, trừ, tách gộp, so sánh |
| 4. Số 4, 5, 6 | Đếm, đọc, viết, ghép số với lượng, điền dãy đến 6 | Cộng, trừ, nhiều hơn, ít hơn, dấu so sánh |
| 5. Số 7, 8, 9 | Đếm, đọc, viết, ghép số với lượng, điền dãy đến 9 | Cộng, trừ, lớn hơn, bé hơn, dấu so sánh |

## Đánh giá lô 001 đã thu hồi

- Câu 1 về vật ở giữa: đúng phạm vi bài 1 nhưng dạng này đã có nhiều câu tương tự.
- Câu 2 về bốn cạnh: vượt phạm vi bài 2 vì SGK mới yêu cầu nhận dạng hình.
- Câu 3 đếm bánh trên hai đĩa: có thể quy về đếm, nhưng cách nói “cả hai đĩa” dễ chuyển thành ý nghĩa gộp trước bài phép cộng và dạng tương tự đã có.
- Câu 4 dùng “nhiều hơn 4 nhưng ít hơn 6”: vượt phạm vi bài 4.
- Câu 5 dùng “lớn hơn 7 nhưng bé hơn 9”: vượt phạm vi bài 5.

Vì vậy, toàn bộ lô 001 được thu hồi và không insert database.

## Vấn đề phát hiện trong dữ liệu hiện có

Ngân hàng hiện tại cũng có các câu dùng số cạnh, số góc, phép cộng, phép trừ và dấu so sánh trước bài giới thiệu tương ứng. Các câu này cần được rà soát theo phạm vi SGK; không được dùng số lượng câu hiện tại làm bằng chứng rằng nội dung đã đúng chương trình.

## Quy trình bắt buộc trước khi tạo câu mới

1. Mở đúng trang SGK của bài học.
2. Ghi rõ mục tiêu, dạng bài xuất hiện và kiến thức chưa được giới thiệu.
3. Kiểm tra câu hiện có để tránh trùng và phát hiện câu sai phạm vi.
4. Chỉ tạo câu cho khoảng trống thực sự; không ép sinh câu khó vượt chương trình.
5. Kiểm tra ảnh AI theo đúng số lượng, vị trí và hình dạng trước khi lưu.
6. Chạy preflight, gửi lô cho người dùng duyệt và chỉ insert sau phê duyệt.
