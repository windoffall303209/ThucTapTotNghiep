-- Chạy file này trên database đã chọn (DB_NAME); không tự chuyển sang một schema khác.
-- Disable foreign key checks temporarily to drop tables in any order
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS AIConversationLogs;
DROP TABLE IF EXISTS AIUsageDaily;
DROP TABLE IF EXISTS PracticeSessionChats;
DROP TABLE IF EXISTS PracticeSessionQuestions;
DROP TABLE IF EXISTS PracticeSessions;
DROP TABLE IF EXISTS StudentLogs;
DROP TABLE IF EXISTS CommonMisconceptions;
DROP TABLE IF EXISTS QuestionBank;
DROP TABLE IF EXISTS ConceptDependencies;
DROP TABLE IF EXISTS KnowledgeConcepts;
DROP TABLE IF EXISTS Lessons;
DROP TABLE IF EXISTS Chapters;
DROP TABLE IF EXISTS SystemSettings;
DROP TABLE IF EXISTS AppSessions;
DROP TABLE IF EXISTS RequestRateLimits;
DROP TABLE IF EXISTS Admins;
DROP TABLE IF EXISTS Students;
SET FOREIGN_KEY_CHECKS = 1;

-- 1. Table: Admins (Quản lý tài khoản quản trị)
CREATE TABLE Admins (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    fullname VARCHAR(100) NOT NULL,
    role VARCHAR(30) DEFAULT 'CONTENT_ADMIN' CHECK (role IN ('SYSADMIN', 'CONTENT_ADMIN')),
    is_active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_admins_username ON Admins(username);
CREATE INDEX idx_admins_role ON Admins(role);

-- 2. Table: SystemSettings (Cấu hình AI, Cloudinary và hệ thống)
CREATE TABLE SystemSettings (
    setting_key VARCHAR(100) PRIMARY KEY,
    setting_value TEXT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Table: Students (Quản lý hồ sơ học sinh)
CREATE TABLE Students (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    fullname VARCHAR(100) NOT NULL,
    registered_grade INT NOT NULL CHECK (registered_grade BETWEEN 1 AND 5),
    current_grade INT NOT NULL CHECK (current_grade BETWEEN 1 AND 5),
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_students_username ON Students(username);
CREATE INDEX idx_students_current_grade ON Students(current_grade);
CREATE INDEX idx_students_is_active ON Students(is_active);

-- 4. Table: Chapters (Quản lý Chương học)
CREATE TABLE Chapters (
    id INT AUTO_INCREMENT PRIMARY KEY,
    grade INT NOT NULL CHECK (grade BETWEEN 1 AND 5),
    semester TINYINT NOT NULL DEFAULT 1 CHECK (semester IN (1, 2)),
    chapter_name VARCHAR(255) NOT NULL,
    sort_order INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_chapters_grade ON Chapters(grade);
CREATE INDEX idx_chapters_grade_sort ON Chapters(grade, sort_order, id);
CREATE INDEX idx_chapters_grade_semester_sort ON Chapters(grade, semester, sort_order, id);

-- 5. Table: Lessons (Quản lý Bài học)
CREATE TABLE Lessons (
    id INT AUTO_INCREMENT PRIMARY KEY,
    chapter_id INT NOT NULL,
    lesson_name VARCHAR(255) NOT NULL,
    theory_cards JSON NULL, -- Chứa mảng thẻ lý thuyết: [{"id": "card-1", "definition": "...", "visual_url": "...", "example": "..."}]
    sort_order INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (chapter_id) REFERENCES Chapters(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_lessons_chapter_id ON Lessons(chapter_id);
CREATE INDEX idx_lessons_chapter_sort ON Lessons(chapter_id, sort_order, id);

-- 6. Table: KnowledgeConcepts (Quản lý đơn vị kiến thức/Kỹ năng chi tiết)
CREATE TABLE KnowledgeConcepts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    lesson_id INT NOT NULL,
    concept_name VARCHAR(255) NOT NULL,
    description TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lesson_id) REFERENCES Lessons(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Table: ConceptDependencies (Bản đồ liên kết kiến thức trước - sau)
CREATE TABLE ConceptDependencies (
    concept_id INT NOT NULL,
    prerequisite_concept_id INT NOT NULL,
    PRIMARY KEY (concept_id, prerequisite_concept_id),
    CONSTRAINT chk_no_self_dependency CHECK (concept_id <> prerequisite_concept_id),
    FOREIGN KEY (concept_id) REFERENCES KnowledgeConcepts(id) ON DELETE CASCADE,
    FOREIGN KEY (prerequisite_concept_id) REFERENCES KnowledgeConcepts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Table: QuestionBank (Ngân hàng câu hỏi trắc nghiệm & điền khuyết)
CREATE TABLE QuestionBank (
    id INT AUTO_INCREMENT PRIMARY KEY,
    lesson_id INT NOT NULL,
    concept_id INT NULL,
    question_type VARCHAR(30) DEFAULT 'MULTIPLE_CHOICE' CHECK (question_type IN ('MULTIPLE_CHOICE', 'FILL_IN_THE_BLANK')),
    difficulty VARCHAR(15) DEFAULT 'EASY' CHECK (difficulty IN ('EASY', 'MEDIUM', 'HARD', 'EXPERT')),
    layout_template VARCHAR(50) DEFAULT 'STACK_VERTICAL' CHECK (layout_template IN (
        'STACK_VERTICAL',
        'SPLIT_HORIZONTAL_LEFT_IMAGE',
        'SPLIT_HORIZONTAL_RIGHT_IMAGE',
        'IMAGE_IN_CHOICES'
    )),
    content JSON NOT NULL, -- {"text": "...", "images": [{"id": "...", "url": "..."}]}
    choices JSON NULL, -- [{"key": "A", "text": "...", "images": []}, ...]
    correct_answer VARCHAR(50) NOT NULL,
    explanation JSON NOT NULL, -- {"text": "...", "images": []}
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    archived_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (lesson_id) REFERENCES Lessons(id) ON DELETE CASCADE,
    FOREIGN KEY (concept_id) REFERENCES KnowledgeConcepts(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_questions_lesson ON QuestionBank(lesson_id);
CREATE INDEX idx_questions_lesson_difficulty_id ON QuestionBank(lesson_id, difficulty, id);
CREATE INDEX idx_questions_concept ON QuestionBank(concept_id);
CREATE INDEX idx_questions_difficulty ON QuestionBank(difficulty);
CREATE INDEX idx_questions_active_lesson ON QuestionBank(is_active, lesson_id, difficulty, id);

-- 9. Table: CommonMisconceptions (Ánh xạ các lỗi sai thường gặp khi làm trắc nghiệm)
CREATE TABLE CommonMisconceptions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    question_id INT NOT NULL,
    distractor_key VARCHAR(10) NOT NULL, -- "A", "B", "C", "D"
    misconception_name VARCHAR(255) NOT NULL,
    explanation TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_misconceptions_question_distractor (question_id, distractor_key),
    FOREIGN KEY (question_id) REFERENCES QuestionBank(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_misconceptions_question ON CommonMisconceptions(question_id);

-- 10. Table: PracticeSessions
CREATE TABLE PracticeSessions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    student_id INT NOT NULL,
    lesson_id INT NULL,
    chapter_id INT NULL,
    scope_semester TINYINT NULL CHECK (scope_semester IN (1, 2)),
    session_mode VARCHAR(20) NOT NULL CHECK (session_mode IN ('REVIEW', 'LESSON', 'CHAPTER', 'COMPREHENSIVE')),
    title VARCHAR(255) NOT NULL,
    question_ids JSON NOT NULL,
    question_count INT NOT NULL DEFAULT 0,
    duration_seconds INT NULL,
    current_index INT NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'IN_PROGRESS' CHECK (status IN ('IN_PROGRESS', 'COMPLETED')),
    completion_reason VARCHAR(40) NULL,
    active_key VARCHAR(191) NULL,
    ai_hint_count INT UNSIGNED NOT NULL DEFAULT 0,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NULL,
    completed_at TIMESTAMP NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES Students(id) ON DELETE CASCADE,
    FOREIGN KEY (lesson_id) REFERENCES Lessons(id) ON DELETE SET NULL,
    FOREIGN KEY (chapter_id) REFERENCES Chapters(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_practice_sessions_student ON PracticeSessions(student_id, status);
CREATE INDEX idx_practice_sessions_student_started ON PracticeSessions(student_id, started_at, id);
CREATE INDEX idx_practice_sessions_student_status_started ON PracticeSessions(student_id, status, started_at, id);
CREATE INDEX idx_practice_sessions_expiry ON PracticeSessions(student_id, status, expires_at);
CREATE UNIQUE INDEX uq_practice_sessions_active_key ON PracticeSessions(active_key);

-- 10.1. Immutable question snapshots for each practice session
CREATE TABLE PracticeSessionQuestions (
    practice_session_id BIGINT NOT NULL,
    question_id INT NOT NULL,
    position INT UNSIGNED NOT NULL,
    snapshot JSON NOT NULL,
    ai_hint_count INT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (practice_session_id, question_id),
    UNIQUE KEY uq_practice_session_question_position (practice_session_id, position),
    FOREIGN KEY (practice_session_id) REFERENCES PracticeSessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2.1. Persistent server-side sessions
CREATE TABLE AppSessions (
    session_id VARCHAR(128) PRIMARY KEY,
    session_data JSON NOT NULL,
    expires_at TIMESTAMP(3) NOT NULL,
    updated_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_app_sessions_expiry ON AppSessions(expires_at);

-- 2.2. Shared counters for sensitive endpoint rate limits
CREATE TABLE RequestRateLimits (
    namespace VARCHAR(32) NOT NULL,
    key_hash CHAR(64) NOT NULL,
    hits INT UNSIGNED NOT NULL DEFAULT 0,
    reset_at TIMESTAMP(3) NOT NULL,
    updated_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (namespace, key_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_request_rate_limits_expiry ON RequestRateLimits(reset_at);

CREATE INDEX idx_practice_session_questions_source ON PracticeSessionQuestions(question_id);

-- 10.2. Student answer history
CREATE TABLE StudentLogs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    student_id INT NOT NULL,
    practice_session_id BIGINT NULL,
    question_id INT NOT NULL,
    selected_answer VARCHAR(50) NOT NULL,
    is_correct TINYINT(1) NOT NULL CHECK (is_correct IN (0, 1)),
    detected_misconception_id INT NULL,
    time_spent_seconds INT NULL CHECK (time_spent_seconds IS NULL OR time_spent_seconds BETWEEN 0 AND 86400),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_logs_session_question (practice_session_id, question_id),
    FOREIGN KEY (student_id) REFERENCES Students(id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES QuestionBank(id) ON DELETE RESTRICT,
    FOREIGN KEY (detected_misconception_id) REFERENCES CommonMisconceptions(id) ON DELETE SET NULL,
    FOREIGN KEY (practice_session_id, question_id)
        REFERENCES PracticeSessionQuestions(practice_session_id, question_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_logs_student ON StudentLogs(student_id);
CREATE INDEX idx_logs_student_question ON StudentLogs(student_id, question_id);
CREATE INDEX idx_logs_practice_session ON StudentLogs(practice_session_id);
CREATE INDEX idx_logs_session_created ON StudentLogs(practice_session_id, created_at, id);
CREATE INDEX idx_logs_student_created ON StudentLogs(student_id, created_at, id);
CREATE INDEX idx_logs_student_correct_question ON StudentLogs(student_id, is_correct, question_id);

-- 10.3. PracticeSessionChats
CREATE TABLE PracticeSessionChats (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    practice_session_id BIGINT NOT NULL,
    question_id INT NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('student', 'ai')),
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (practice_session_id, question_id)
        REFERENCES PracticeSessionQuestions(practice_session_id, question_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_practice_chats_session ON PracticeSessionChats(practice_session_id, question_id);
CREATE INDEX idx_practice_chats_session_role ON PracticeSessionChats(practice_session_id, role, created_at, id);

-- 10.4. Durable per-student daily AI quota
CREATE TABLE AIUsageDaily (
    student_id INT NOT NULL,
    usage_date DATE NOT NULL,
    request_count INT UNSIGNED NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (student_id, usage_date),
    FOREIGN KEY (student_id) REFERENCES Students(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 11. Table: AIConversationLogs (Nhật ký gợi ý học tập có kiểm soát)
CREATE TABLE AIConversationLogs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    student_id INT NOT NULL,
    session_type VARCHAR(20) CHECK (session_type IN ('EXERCISE_HELP', 'THEORY_EXPLAIN')),
    reference_id INT NOT NULL,
    practice_session_id BIGINT NULL,
    question_id INT NULL,
    lesson_id INT NULL,
    provider VARCHAR(50) NULL,
    model VARCHAR(120) NULL,
    is_fallback TINYINT(1) DEFAULT 0,
    blocked_reason VARCHAR(120) NULL,
    chat_history JSON NOT NULL, -- [{"role": "user", "text": "..."}, ...]
    total_tokens_used INT DEFAULT 0,
    estimated_cost_usd DECIMAL(10, 6) DEFAULT 0.000000,
    is_flagged_inaccurate TINYINT(1) DEFAULT 0, -- 0: Bình thường, 1: Báo lỗi nội dung từ Admin
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES Students(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_ai_logs_student ON AIConversationLogs(student_id);
