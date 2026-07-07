# Toán Bổ Trợ Tiểu học

Website ôn luyện Toán cho học sinh Tiểu học lớp 1 đến lớp 5, xây dựng bằng Node.js, Express.js, EJS và MySQL theo kiến trúc MVC.

## Chức năng đã triển khai

- Đăng ký và đăng nhập học sinh.
- Đăng nhập quản trị bằng tài khoản cấu hình trong `.env`.
- Dashboard học sinh theo khối học hiện tại.
- Xem lý thuyết bài học.
- Luyện tập trắc nghiệm, kiểm tra đáp án, hiển thị lời giải và lỗi sai thường gặp.
- Tính năng gợi ý thêm dạng mô phỏng để hỗ trợ học sinh sau khi thử làm bài.
- Admin xem tổng quan, thêm câu hỏi và xem danh sách học sinh.
- Fallback dữ liệu mẫu khi chưa kết nối MySQL.

## Cài đặt

```powershell
npm install
Copy-Item .env.example .env
npm start
```

Ứng dụng chạy mặc định tại:

```text
http://localhost:3000
```

## Cấu hình MySQL

1. Tạo database, ví dụ `math_revision_ai_tutor`.
2. Cập nhật thông tin kết nối trong `.env`.
3. Chạy schema:

```powershell
mysql -u root -p math_revision_ai_tutor < database/database_schema.sql
```

4. Nạp khung chương trình lớp 1-5 từ file danh sách:

```powershell
npm run db:seed-curriculum
```

5. Nạp tài khoản demo đã mã hóa mật khẩu bằng bcrypt:

```powershell
mysql -u root -p math_revision_ai_tutor < database/seed.sql
```

Nếu MySQL chưa sẵn sàng, ứng dụng vẫn chạy bằng dữ liệu mẫu trong `sample-data/sampleData.js`.

## Cấu hình AI và Cloudinary

Có thể cấu hình bằng `.env` hoặc vào trang quản trị:

```text
/admin/settings
```

AI hỗ trợ một trong các provider sau:

- `openai`
- `gemini`
- `nvidia`
- `openrouter`
- `mock` để dùng phản hồi mô phỏng khi chưa có API key

Biến môi trường tương ứng:

```text
AI_PROVIDER=mock
AI_AUTOMATION_ENABLED=true
AI_JSON_TIMEOUT_MS=12000

OPENAI_API_KEY=
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
OPENAI_VISION_MODEL=gpt-4o-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small

GEMINI_API_KEY=
GEMINI_MODEL=gemini-1.5-flash
GEMINI_CLI_MODEL=gemini-2.5-flash-lite
GEMINI_CLI_TIMEOUT_MS=120000

NVIDIA_NIM_API_KEY=
NVIDIA_NIM_BASE_URL=https://integrate.api.nvidia.com/v1
NVIDIA_NIM_MODEL=meta/llama-3.3-70b-instruct
NVIDIA_NIM_VISION_MODEL=meta/llama-3.2-90b-vision-instruct
NVIDIA_NIM_EMBEDDING_MODEL=nvidia/nv-embedqa-e5-v5

OPENROUTER_API_KEY=
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_MODEL=openai/gpt-4o-mini

API_KEY_ENCRYPTION_SECRET=change_me_for_admin_saved_api_keys
```

Các API key lưu từ `/admin/settings` được mã hóa trước khi ghi vào bảng `SystemSettings`.

Cloudinary:

```text
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

Khi đủ cấu hình Cloudinary, ảnh câu hỏi sẽ được tải lên Cloudinary. Nếu thiếu cấu hình hoặc Cloudinary lỗi, hệ thống tự lưu ảnh vào `public/uploads/images`.

## Tài khoản demo

```text
Quản trị hệ thống: admin / admin123
Biên soạn nội dung: content / content123
Học sinh: annguyen / matkhau123
Học sinh: binhtran / matkhau123
Học sinh: chilam / matkhau123
```

Các mật khẩu demo trong `database/seed.sql` và dữ liệu fallback đều được lưu bằng bcrypt hash, không lưu plain text.
