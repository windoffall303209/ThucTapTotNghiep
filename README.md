# Toán Bổ Trợ Tiểu học

Website ôn luyện Toán lớp 1–5, xây dựng bằng Node.js, Express, EJS và MySQL. Hệ thống gồm khu vực học sinh, quản trị nội dung, luyện tập có lưu lịch sử và gợi ý AI có quota.

## Yêu cầu hệ thống

- Node.js 20 trở lên.
- npm đi kèm Node.js.
- MySQL 8.0 trở lên.
- Reverse proxy HTTPS khi triển khai production.
- Cloudinary là tùy chọn; nếu không cấu hình, ảnh được lưu tại `public/uploads/images`.

Kiểm tra phiên bản trước khi cài:

```powershell
node --version
npm --version
mysql --version
```

## Cài đặt local

```powershell
npm ci
Copy-Item .env.example .env
```

Điền cấu hình MySQL và thay các giá trị secret mẫu trong `.env`. Không commit `.env`, file CA, API key hoặc mật khẩu vào Git.

Tạo database rỗng. Nếu dùng MySQL CLI, nên dùng file cấu hình client được bảo vệ thay vì đưa mật khẩu lên command line:

```ini
# C:\secure\mysql-client.cnf
[client]
host=127.0.0.1
port=3306
user=app_user
password=replace-with-a-private-password
default-character-set=utf8mb4
```

```powershell
mysql --defaults-extra-file=C:\secure\mysql-client.cnf -e "CREATE DATABASE IF NOT EXISTS math_revision_ai_tutor CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
```

`db:init` mặc định chỉ in kế hoạch và không thay đổi dữ liệu. Chỉ áp dụng schema sau khi xác nhận đúng tên database:

```powershell
npm run db:init
npm run db:init -- --apply --confirm-database=math_revision_ai_tutor
npm run db:seed-curriculum
npm run db:seed-curriculum -- --apply --confirm-database=math_revision_ai_tutor
```

Cú pháp tổng quát là `npm run db:init -- --apply --confirm-database=<DB_NAME>`. Lệnh này xóa và tạo lại toàn bộ schema; chỉ dùng cho database mới hoặc một lần reset đã có full backup. Với database đang tồn tại, dùng các migration ở phần tiếp theo thay vì `db:init`.

`db:seed-curriculum` cũng chỉ preflight khi không có `--apply`. Công cụ đọc `Danh_sach_chuong_va_bai_hoc.txt`, hoặc đường dẫn từ `CURRICULUM_SOURCE_FILE`/`--source=<path>`, rồi chỉ thêm mới hoặc cập nhật thứ tự; không xóa chương, bài, câu hỏi hay nội dung lý thuyết hiện có. File nguồn là dữ liệu vận hành local và không nên được force-add vào Git nếu chứa nội dung chưa duyệt.

Nếu cần dữ liệu bootstrap cho môi trường local cô lập, có thể chạy seed rồi xoay toàn bộ credential ngay lập tức:

```powershell
npm run db:seed-demo
npm run db:seed-demo -- --apply --confirm-demo-credentials
npm run security:rotate-credentials
npm run security:rotate-credentials -- --apply --confirm-database=math_revision_ai_tutor
```

`db:seed-demo` cũng chỉ preflight nếu thiếu `--apply`. Seed demo bị cấm hoàn toàn khi `NODE_ENV=production`; không dùng dữ liệu bootstrap trên máy chủ public. Production sẽ từ chối khởi động nếu phát hiện tài khoản đang dùng credential mặc định đã biết.

Chạy migration theo đúng thứ tự ở phần tiếp theo, sau đó:

```powershell
npm test
npm start
```

Mặc định ứng dụng local mở tại [http://localhost:3000](http://localhost:3000).

Khi MySQL chưa sẵn sàng, dữ liệu mẫu chỉ được phép dùng trong development với `ALLOW_SAMPLE_DATA_FALLBACK=true`. Các luồng xác thực vẫn đóng khi database lỗi. Production luôn yêu cầu MySQL hoạt động.

## Migration database

Trước mỗi đợt nâng cấp, dừng tiến trình ghi dữ liệu hoặc đưa ứng dụng vào maintenance mode và tạo full backup MySQL. Với database đang tồn tại, chạy migration theo thứ tự sau:

```powershell
# 1. Snapshot câu hỏi, soft-delete và reconcile phiên luyện tập
npm run db:session-integrity
npm run db:session-integrity -- --apply
npm run db:session-integrity

# 2. Session store và rate-limit store bền vững
npm run db:runtime-storage
npm run db:runtime-storage -- --apply
npm run db:runtime-storage

# 3. Index, privacy và thời hạn lưu nhật ký AI
npm run db:ai-log-retention
npm run db:ai-log-retention -- --apply
npm run db:ai-log-retention

# 4. Metadata kiểm toán cho thuật toán tạo đề
npm run db:selection-metadata
npm run db:selection-metadata -- --apply
npm run db:selection-metadata
```

Lần chạy không có `--apply` là preflight read-only. `db:session-integrity -- --apply` tự tạo thêm bản sao JSON của dữ liệu bị tác động trong `tmp/session-integrity-backup-*.json`; file này phục vụ kiểm tra hoặc khôi phục có chọn lọc, không thay thế full database dump.

Migration session integrity không tự ghép câu mới vào phiên cũ đã mất câu. Phiên không thể phục hồi được kết thúc với lý do nội dung không còn sẵn có để tránh làm sai lịch sử.

`db:ai-log-retention` tạo các index cần thiết, xóa nội dung hội thoại khỏi log đã bị chính sách chặn và xóa log quá hạn theo `ai_log_retention_days` (1–365 ngày, mặc định 90). Sau lần migration đầu, lập lịch chạy `npm run db:ai-log-retention -- --apply` hằng ngày hoặc hằng tuần; luôn giữ full backup và chạy lại preflight để kiểm tra kết quả.

`database/database_schema.sql` đã chứa schema mới cho cài đặt sạch. Dù vậy, vẫn nên chạy tất cả preflight trên để xác nhận database khớp với phiên bản ứng dụng trước khi khởi động. Các migration mới được lưu trong thư mục `migrations/`; `scripts/` chỉ giữ các công cụ vận hành và dữ liệu cũ chưa được tái cấu trúc.

Audit thuật toán tạo đề và báo cáo hiệu chỉnh độ khó đều chỉ đọc dữ liệu:

```powershell
npm run practice:audit-selector -- --runs=25
npm run questions:calibrate-report
npm run questions:readiness-report
```

Audit mô phỏng nhiều seed cho lớp 1–5 theo chương, học kỳ và cả năm. Báo cáo độ khó chỉ cảnh báo câu đã có ít nhất 30 lượt làm. Báo cáo độ sẵn sàng chỉ ra bài hoặc phạm vi thiếu tổng số câu, thiếu mức độ khó hay không đủ sức chứa khi giới hạn hai câu mỗi bài. Các lệnh này không tự sửa nhãn hoặc nội dung câu hỏi.

## Cấu hình MySQL TLS

Các mode được hỗ trợ:

| `DB_SSL_MODE` | Ý nghĩa | Phạm vi phù hợp |
| --- | --- | --- |
| `disabled` | Không dùng TLS | Chỉ MySQL loopback trong local |
| `required` | Mã hóa kết nối nhưng không xác minh máy chủ | Chỉ môi trường non-production đã cô lập |
| `verify-ca` | Mã hóa và xác minh chứng chỉ với CA được cung cấp | Bắt buộc cho MySQL production từ xa |

Ví dụ production:

```dotenv
DB_HOST=mysql.internal.example
DB_PORT=3306
DB_USER=app_user
DB_PASSWORD=<secret-from-secret-manager>
DB_NAME=math_revision_ai_tutor
DB_SSL_MODE=verify-ca
DB_SSL_CA_FILE=C:\secure\mysql-ca.pem
```

`DB_SSL_CA_FILE` được đọc khi khởi tạo pool và bắt buộc với `verify-ca`. Không đặt CA trong thư mục public hoặc commit vào Git. Production có `DB_HOST` không phải loopback sẽ từ chối cả `disabled` và `required`; chỉ `verify-ca` được chấp nhận.

## Secrets và xoay credential

Production bắt buộc ba secret độc lập, dài ít nhất 32 ký tự và không được dùng placeholder:

- `SESSION_SECRET`
- `JWT_SECRET`
- `API_KEY_ENCRYPTION_SECRET`

Có thể sinh từng giá trị riêng bằng:

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Lưu secret trong secret manager hoặc file môi trường chỉ tài khoản chạy dịch vụ có quyền đọc. `API_KEY_ENCRYPTION_SECRET` dùng để mã hóa API key trong `SystemSettings`; mất secret này sẽ khiến các giá trị đã mã hóa không thể giải mã.

Đối với hệ thống đã có dữ liệu, quy trình xoay khóa an toàn:

1. Dừng toàn bộ instance ứng dụng.
2. Tạo full database dump và bản sao `.env` được mã hóa/lưu ở nơi bảo mật.
3. Chạy preflight `npm run security:rotate-credentials`, kiểm tra đúng database, rồi chạy `npm run security:rotate-credentials -- --apply --confirm-database=<DB_NAME>` trên host được bảo vệ.
4. Chuyển các secret mới sang secret manager, hạn chế lại quyền đọc `.env`.
5. Khởi động đồng thời các instance bằng cùng bộ secret mới và kiểm tra đăng nhập/cấu hình AI.
6. Xoay API key tại chính provider nếu có khả năng key đã lộ. Script chỉ mã hóa lại key đang lưu, không thu hồi key phía provider.

Xoay `SESSION_SECRET` hoặc `JWT_SECRET` làm các phiên/token cũ mất hiệu lực, vì vậy người dùng cần đăng nhập lại.

## Cấu hình AI và lưu ảnh

Các provider hỗ trợ gồm `openai`, `gemini`, `gemini_cli`, `nvidia`, `openrouter` và `mock`. Cấu hình mặc định và danh sách biến đầy đủ nằm trong [.env.example](.env.example).

API key có thể được nhập tại `/admin/settings`; giá trị được mã hóa trước khi ghi vào `SystemSettings`. Chỉ HTTPS origin thuộc allowlist của đúng provider mới được phép nhận Authorization header. Custom gateway phải khai báo riêng, không dùng chung chéo provider:

```dotenv
AI_ALLOWED_OPENAI_BASE_URL_ORIGINS=
AI_ALLOWED_NVIDIA_BASE_URL_ORIGINS=
AI_ALLOWED_OPENROUTER_BASE_URL_ORIGINS=
```

Mỗi biến chỉ nhận danh sách HTTPS origin thuần, phân tách bằng dấu phẩy. Biến cũ `AI_ALLOWED_BASE_URL_ORIGINS` bị từ chối để tránh gửi nhầm API key sang provider khác.

Cloudinary dùng các biến:

```dotenv
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

Nếu không dùng Cloudinary, phải sao lưu `public/uploads/images` cùng database vì các file này không nằm trong MySQL. Khi thay hoặc xóa nội dung, hệ thống chỉ xóa ảnh local/Cloudinary do ứng dụng quản lý sau khi đã khóa và kiểm tra rằng câu hỏi, lý thuyết và snapshot phiên làm bài không còn tham chiếu. Cloudinary object ngoài các folder `math-revision/questions`, `math-revision/choices`, `math-revision/theory` hoặc thuộc cloud account khác sẽ không bị xóa.

## Triển khai production

Checklist tối thiểu:

1. Cài dependency bằng `npm ci` và chạy `npm test` trong pipeline.
2. Tạo full backup, chạy `db:session-integrity`, `db:runtime-storage`, rồi `db:ai-log-retention` theo thứ tự ở trên.
3. Đặt `NODE_ENV=production`, `APP_ORIGIN` là HTTPS origin công khai. Dùng `HOST=127.0.0.1` nếu reverse proxy ở cùng host; chỉ dùng `0.0.0.0` khi container/network policy yêu cầu.
4. Đặt `TRUST_PROXY` bằng đúng số proxy hop kết thúc TLS, từ 1 đến 10.
5. Đặt `ALLOW_SAMPLE_DATA_FALLBACK=false`.
6. Cấu hình ba application secret an toàn, MySQL TLS và các provider cần dùng.
7. Xác nhận không còn credential bootstrap/default đang hoạt động.
8. Chạy `npm start` dưới process manager có restart policy và log rotation.

Khi production khởi động, ứng dụng kiểm tra cấu hình, kết nối MySQL, schema session/rate-limit store và credential mặc định. Bất kỳ kiểm tra bắt buộc nào thất bại đều làm tiến trình dừng thay vì chạy ở trạng thái không an toàn.

Sau khi start, kiểm tra trực tiếp từ host rồi qua reverse proxy:

```powershell
Invoke-WebRequest http://127.0.0.1:3000/ -UseBasicParsing
Invoke-WebRequest https://your-public-origin.example/ -UseBasicParsing
```

## Backup và khôi phục

### Full backup trước deploy

Tạo thư mục backup ngoài web root và dùng file MySQL Client bảo mật:

```powershell
New-Item -ItemType Directory -Force C:\secure\backups | Out-Null
cmd /c "mysqldump --defaults-extra-file=C:\secure\mysql-client.cnf --single-transaction --routines --triggers --events --hex-blob math_revision_ai_tutor > C:\secure\backups\math_revision_before_deploy.sql"
Copy-Item .env C:\secure\backups\app-env-before-deploy -Force
if (Test-Path public\uploads\images) {
  Copy-Item public\uploads\images C:\secure\backups\upload-images -Recurse -Force
}
```

Bảo vệ và mã hóa thư mục backup. Database dump cùng bộ `API_KEY_ENCRYPTION_SECRET` tương ứng là hai phần cần thiết để giải mã lại cấu hình provider.

### Khôi phục

1. Dừng toàn bộ instance ứng dụng.
2. Tạo thêm một dump của trạng thái hỏng để phục vụ điều tra.
3. Khôi phục database bằng đúng database dump đã chọn.
4. Khôi phục bộ secret tương ứng và thư mục upload local nếu có.
5. Chạy lại preflight/migration theo đúng phiên bản code đang triển khai.
6. Chạy `npm test`, khởi động ứng dụng và kiểm tra đăng nhập, lịch sử phiên, ảnh và AI.

```powershell
cmd /c "mysql --defaults-extra-file=C:\secure\mysql-client.cnf math_revision_ai_tutor < C:\secure\backups\math_revision_before_deploy.sql"
npm run db:session-integrity
npm run db:runtime-storage
npm run db:ai-log-retention
```

Không phục hồi riêng JSON trong `tmp/` lên production bằng thao tác chèn hàng loạt. JSON đó là bằng chứng/audit và nguồn cho khôi phục có chọn lọc; full MySQL dump vẫn là điểm khôi phục chính.

## Kiểm tra trước bàn giao

```powershell
npm test
npm audit
npm audit --omit=dev
npm run questions:validate-all
npm run db:session-integrity
npm run db:runtime-storage
npm run db:ai-log-retention
npm run db:seed-curriculum
npm run security:rotate-credentials
```

Kiểm tra thêm rằng `.env`, file CA, backup SQL/JSON và thư mục upload backup không được Git theo dõi.
