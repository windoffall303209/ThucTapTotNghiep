// Script report question bank readiness hỗ trợ nhập, xuất, kiểm tra hoặc bảo trì dữ liệu và cấu hình của dự án.
/* eslint-disable no-console */
require('dotenv').config({ quiet: true });

const db = require('../config/db');
const Curriculum = require('../models/Curriculum');
const Question = require('../models/Question');
const { MIN_GRADE, MAX_GRADE } = require('../config/grades');
const {
  evaluateLessonReadiness,
  evaluateScopeReadiness,
  summarizeReadiness
} = require('../utils/questionBankReadiness');

// Hàm buildReadinessReport dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function buildReadinessReport() {
  const lessons = [];
  const scopes = [];

  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (let grade = MIN_GRADE; grade <= MAX_GRADE; grade += 1) {
    const [chapters, candidates] = await Promise.all([
      Curriculum.getCurriculumByGrade(grade),
      Question.getQuestionCandidates({ grade })
    ]);

    // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
    for (const chapter of chapters) {
      // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
      for (const lesson of chapter.lessons || []) {
        const lessonCandidates = candidates.filter(
          (question) => Number(question.lesson_id) === Number(lesson.id)
        );
        const readiness = evaluateLessonReadiness(lessonCandidates);
        lessons.push({
          grade,
          chapterId: Number(chapter.id),
          chapterName: chapter.chapter_name,
          lessonId: Number(lesson.id),
          lessonName: lesson.lesson_name,
          ...readiness
        });
      }
    }

    const scopeDefinitions = [
      { scope: 'YEAR', scopeId: grade, candidates },
      ...[1, 2].map((semester) => ({
        scope: `SEMESTER_${semester}`,
        scopeId: semester,
        candidates: candidates.filter((question) => Number(question.semester) === semester)
      })),
      ...chapters.map((chapter) => ({
        scope: 'CHAPTER',
        scopeId: Number(chapter.id),
        scopeName: chapter.chapter_name,
        candidates: candidates.filter(
          (question) => Number(question.chapter_id) === Number(chapter.id)
        )
      }))
    ];

    // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
    for (const definition of scopeDefinitions) {
      // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
      for (const count of [15, 20]) {
        scopes.push({
          grade,
          scope: definition.scope,
          scopeId: definition.scopeId,
          scopeName: definition.scopeName || null,
          ...evaluateScopeReadiness(definition.candidates, count, 2)
        });
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    readOnly: true,
    lessonSummary: {
      totalLessons: lessons.length,
      readyLessons: lessons.filter((lesson) => lesson.ready).length,
      blockedLessons: lessons.filter((lesson) => !lesson.ready).length
    },
    scopeSummary: summarizeReadiness(scopes),
    lessonsNeedingData: lessons.filter((lesson) => !lesson.ready),
    scopesNeedingData: scopes.filter((scope) => !scope.ready)
  };
}

// Hàm main dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function main() {
  const connection = await db.testConnection();
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!connection.connected) throw new Error(`Không kết nối được database: ${connection.reason}`);
  console.log(JSON.stringify(await buildReadinessReport(), null, 2));
}

// Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
if (require.main === module) {
  main()
    .catch((error) => {
      console.error(`Báo cáo độ sẵn sàng ngân hàng thất bại: ${error.message}`);
      process.exitCode = 1;
    })
    .finally(() => db.close());
}

module.exports = { buildReadinessReport };
