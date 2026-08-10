-- T?p l?nh SQL seed kh?i t?o ho?c n?p d? li?u cho c? s? d? li?u c?a ?ng d?ng.
-- =========================================================================
-- SEED DATA DEMO CHO HỆ THỐNG ÔN LUYỆN TOÁN TIỂU HỌC 1-5
-- Lưu ý: Tất cả mật khẩu bên dưới đã được băm bằng bcrypt.
-- Mật khẩu demo:
--   admin / admin123
--   content / content123
--   annguyen / matkhau123
--   binhtran / matkhau123
--   chilam / matkhau123
-- Chạy file này sau khi đã chạy database/database_schema.sql.
-- =========================================================================

CREATE TABLE IF NOT EXISTS Admins (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    fullname VARCHAR(100) NOT NULL,
    role VARCHAR(30) DEFAULT 'CONTENT_ADMIN' CHECK (role IN ('SYSADMIN', 'CONTENT_ADMIN')),
    is_active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- C?u l?nh SQL `CREATE` th?c hi?n m?t b??c thay ??i ho?c truy v?n d? li?u; c?n ki?m tra ?i?u ki?n v? ph?m vi t?c ??ng tr??c khi ch?y.
CREATE TABLE IF NOT EXISTS SystemSettings (
    setting_key VARCHAR(100) PRIMARY KEY,
    setting_value TEXT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- C?u l?nh SQL `INSERT` th?c hi?n m?t b??c thay ??i ho?c truy v?n d? li?u; c?n ki?m tra ?i?u ki?n v? ph?m vi t?c ??ng tr??c khi ch?y.
INSERT INTO Admins (username, password_hash, fullname, role, is_active)
VALUES
  (
    'admin',
    '$2b$10$Px9plvW0cgBO6TvqWiEiFOYSO3FvjvVfslUIdG2RjQCVjRZxv8qH2',
    'Quản trị viên',
    'SYSADMIN',
    1
  ),
  (
    'content',
    '$2b$10$O8L4rOVXq6VMZQZlOpI7buYV6CY6hSyg0hBniX/EZnUkdyrOV3Pgi',
    'Biên soạn nội dung',
    'CONTENT_ADMIN',
    1
  )
ON DUPLICATE KEY UPDATE
  fullname = VALUES(fullname),
  role = VALUES(role);

-- C?u l?nh SQL `INSERT` th?c hi?n m?t b??c thay ??i ho?c truy v?n d? li?u; c?n ki?m tra ?i?u ki?n v? ph?m vi t?c ??ng tr??c khi ch?y.
INSERT INTO Students (username, password_hash, fullname, registered_grade, current_grade)
VALUES
  (
    'annguyen',
    '$2b$10$pBiZ2Xqrx5qlySuhgudGQeEUUfHi55i4ywnuQeo3BaFaQCRQQxrai',
    'Nguyễn An',
    4,
    4
  ),
  (
    'binhtran',
    '$2b$10$n.GalEH6PN3oAOkJ1.geR.UKIh/BwvuWQHDN01J7zm7PfOTKEcy4y',
    'Trần Bình',
    5,
    5
  ),
  (
    'chilam',
    '$2b$10$zDlho7mPUo/n3iGJQMqaputIhXPGWCAUSRkyAPS7quRn4Rz4BdRCS',
    'Lâm Chi',
    2,
    2
  )
ON DUPLICATE KEY UPDATE
  fullname = VALUES(fullname),
  registered_grade = VALUES(registered_grade),
  current_grade = VALUES(current_grade);

-- C?u l?nh SQL `INSERT` th?c hi?n m?t b??c thay ??i ho?c truy v?n d? li?u; c?n ki?m tra ?i?u ki?n v? ph?m vi t?c ??ng tr??c khi ch?y.
INSERT INTO SystemSettings (setting_key, setting_value)
VALUES
  ('practice_duration_5_minutes', '10'),
  ('practice_duration_15_minutes', '30'),
  ('practice_duration_20_minutes', '60'),
  ('ai_provider', 'mock'),
  ('ai_automation_enabled', 'true'),
  ('ai_json_timeout_ms', '12000'),
  ('ai_enabled_grades', '3,4,5'),
  ('ai_max_hints_per_question', '2'),
  ('ai_max_hints_per_session', '8'),
  ('ai_max_requests_per_student_per_day', '30'),
  ('ai_require_answer_before_help', 'true'),
  ('ai_log_retention_days', '90'),
  ('openai_api_key', ''),
  ('openai_base_url', 'https://api.openai.com/v1'),
  ('openai_model', 'gpt-4o-mini'),
  ('openai_vision_model', 'gpt-4o-mini'),
  ('openai_embedding_model', 'text-embedding-3-small'),
  ('gemini_api_key', ''),
  ('gemini_model', 'gemini-1.5-flash'),
  ('gemini_cli_model', 'gemini-2.5-flash-lite'),
  ('gemini_cli_timeout_ms', '120000'),
  ('nvidia_nim_api_key', ''),
  ('nvidia_nim_base_url', 'https://integrate.api.nvidia.com/v1'),
  ('nvidia_nim_model', 'meta/llama-3.3-70b-instruct'),
  ('nvidia_nim_vision_model', 'meta/llama-3.2-90b-vision-instruct'),
  ('nvidia_nim_embedding_model', 'nvidia/nv-embedqa-e5-v5'),
  ('openrouter_api_key', ''),
  ('openrouter_base_url', 'https://openrouter.ai/api/v1'),
  ('openrouter_model', 'openai/gpt-4o-mini'),
  ('cloudinary_cloud_name', ''),
  ('cloudinary_api_key', ''),
  ('cloudinary_api_secret', '')
ON DUPLICATE KEY UPDATE
  setting_value = VALUES(setting_value);
