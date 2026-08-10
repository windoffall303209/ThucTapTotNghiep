// Script report question bank readiness h? tr? nh?p, xu?t, ki?m tra ho?c b?o tr? d? li?u v? c?u h?nh c?a d? ?n.
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

// H?m buildReadinessReport d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function buildReadinessReport() {
  const lessons = [];
  const scopes = [];

  // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
  for (let grade = MIN_GRADE; grade <= MAX_GRADE; grade += 1) {
    const [chapters, candidates] = await Promise.all([
      Curriculum.getCurriculumByGrade(grade),
      Question.getQuestionCandidates({ grade })
    ]);

    // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
    for (const chapter of chapters) {
      // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
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

    // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
    for (const definition of scopeDefinitions) {
      // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
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

// H?m main d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function main() {
  const connection = await db.testConnection();
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!connection.connected) throw new Error(`Không kết nối được database: ${connection.reason}`);
  console.log(JSON.stringify(await buildReadinessReport(), null, 2));
}

// Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
if (require.main === module) {
  main()
    .catch((error) => {
      console.error(`Báo cáo độ sẵn sàng ngân hàng thất bại: ${error.message}`);
      process.exitCode = 1;
    })
    .finally(() => db.close());
}

module.exports = { buildReadinessReport };
