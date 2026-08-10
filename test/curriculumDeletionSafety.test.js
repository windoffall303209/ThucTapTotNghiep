// B? ki?m th? curriculum deletion safety.test x?c minh h?nh vi v? c?c ?i?u ki?n bi?n quan tr?ng c?a h? th?ng.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const Curriculum = require('../models/Curriculum');

test('xóa chương chỉ thành công trong cùng câu lệnh khi không còn bài học', async () => {
  let captured = null;
  const deleted = await Curriculum.deleteChapterIfEmpty(7, {
    query: async (sql, params) => {
      captured = { sql, params };
      return { affectedRows: 1 };
    }
  });

  assert.equal(deleted, true);
  assert.deepEqual(captured.params, [7]);
  assert.match(captured.sql, /DELETE c[\s\S]+LEFT JOIN Lessons l/);
  assert.match(captured.sql, /c\.id = \? AND l\.id IS NULL/);
});

test('xóa bài khóa hàng và trả đúng ảnh ở thời điểm xóa', async () => {
  const calls = [];
  const deletion = await Curriculum.deleteLessonIfEmpty(11, {
    transaction: async (callback) => callback({
      // H?m execute d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
      async execute(sql, params) {
        calls.push({ sql, params });
        // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
        if (/SELECT theory_cards/.test(sql)) {
          return [[{
            theory_cards: [{
              images: [{
                url: '/uploads/images/current.png',
                storage_provider: 'local'
              }]
            }]
          }]];
        }
        // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
        if (/FROM QuestionBank/.test(sql)) return [[]];
        return [{ affectedRows: 1 }];
      }
    })
  });

  assert.equal(deletion.deleted, true);
  assert.equal(deletion.theoryCards[0].images[0].url, '/uploads/images/current.png');
  assert.equal(calls.length, 3);
  assert.match(calls[0].sql, /FROM Lessons[\s\S]+FOR UPDATE/);
  assert.match(calls[1].sql, /FROM QuestionBank[\s\S]+FOR SHARE/);
  assert.match(calls[2].sql, /DELETE FROM Lessons/);
  assert(calls.every((call) => call.params[0] === 11));
});

test('cập nhật lý thuyết khóa hàng và từ chối revision đã cũ', async () => {
  const calls = [];
  const result = await Curriculum.updateLessonTheoryCards(
    15,
    [{ title: 'Nội dung mới' }],
    {
      expectedTheoryCards: [{ title: 'Nội dung cũ' }],
      transaction: async (callback) => callback({
        // H?m execute d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
        async execute(sql) {
          calls.push(sql);
          return [[{
            theory_cards: [{ title: 'Nội dung của request khác' }]
          }]];
        }
      })
    }
  );
  assert.equal(result, null);
  assert.equal(calls.length, 1);
  assert.match(calls[0], /SELECT theory_cards[\s\S]+FOR UPDATE/);
});

test('controller không còn tách bước đếm và xóa thành hai thao tác', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'controllers', 'AdminController.js'),
    'utf8'
  );
  const chapterDelete = source.slice(
    source.indexOf('async function deleteChapter'),
    source.indexOf('async function createLesson')
  );
  const lessonDelete = source.slice(
    source.indexOf('async function deleteLesson'),
    source.indexOf('async function aiLogs')
  );

  assert.match(chapterDelete, /deleteChapterIfEmpty/);
  assert.doesNotMatch(chapterDelete, /Curriculum\.deleteChapter\(/);
  assert.ok(
    chapterDelete.indexOf('deleteChapterIfEmpty')
      < chapterDelete.indexOf('countLessonsInChapter')
  );

  assert.match(lessonDelete, /deleteLessonIfEmpty/);
  assert.doesNotMatch(lessonDelete, /Curriculum\.deleteLesson\(/);
  assert.ok(
    lessonDelete.indexOf('deleteLessonIfEmpty')
      < lessonDelete.indexOf('countQuestionsInLesson')
  );
  assert.match(lessonDelete, /deletion\.theoryCards/);
  assert.match(lessonDelete, /kể cả câu hỏi đã lưu trữ/);

  const theoryMutations = source.slice(
    source.indexOf('async function createTheoryCard'),
    source.indexOf('async function lessonQuestions')
  );
  assert.equal(
    (theoryMutations.match(/if \(!savedCards\)/g) || []).length,
    3
  );
});
