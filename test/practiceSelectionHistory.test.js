const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../config/db');
const Question = require('../models/Question');

test('lịch sử tạo đề cộng dồn số lần xuất hiện và giữ thời điểm gần nhất của từng bài', async () => {
  const originalQuery = db.query;
  let capturedSql = '';
  let capturedParams = [];
  db.query = async (sql, params) => {
    capturedSql = sql;
    capturedParams = params;
    return [
      { question_id: 11, lesson_id: 101, chapter_id: 1, appearance_count: 2, last_selected_at: '2026-08-01T08:00:00.000Z' },
      { question_id: 12, lesson_id: 101, chapter_id: 1, appearance_count: 3, last_selected_at: '2026-08-03T08:00:00.000Z' },
      { question_id: 21, lesson_id: 102, chapter_id: 1, appearance_count: 1, last_selected_at: '2026-07-30T08:00:00.000Z' }
    ];
  };

  try {
    const history = await Question.getPracticeSelectionHistory({ studentId: 7, grade: 5 });
    assert.deepEqual(capturedParams, [7, 5]);
    assert.match(capturedSql, /PracticeSessionQuestions/);
    assert.match(capturedSql, /COUNT\(\*\) AS appearance_count/);
    assert.match(capturedSql, /MAX\(ps\.started_at\) AS last_selected_at/);
    assert.deepEqual(history.questions[11], {
      count: 2,
      lastSelectedAt: '2026-08-01T08:00:00.000Z'
    });
    assert.deepEqual(history.lessons[101], {
      count: 5,
      lastSelectedAt: '2026-08-03T08:00:00.000Z'
    });
    assert.deepEqual(history.lessons[102], {
      count: 1,
      lastSelectedAt: '2026-07-30T08:00:00.000Z'
    });
  } finally {
    db.query = originalQuery;
  }
});

test('lịch sử tạo đề rỗng khi học sinh hoặc khối lớp không hợp lệ', async () => {
  assert.deepEqual(
    await Question.getPracticeSelectionHistory({ studentId: 0, grade: 5 }),
    { questions: {}, lessons: {} }
  );
  assert.deepEqual(
    await Question.getPracticeSelectionHistory({ studentId: 7, grade: 9 }),
    { questions: {}, lessons: {} }
  );
});
