const test = require('node:test');
const assert = require('node:assert/strict');

const { parsePositiveIntegerList } = require('../utils/requestValidation');

test('danh sách mã bài học được chuẩn hóa, loại trùng và giới hạn số phần tử', () => {
  assert.deepEqual(parsePositiveIntegerList(['3', '2', '3']), [3, 2]);
  assert.deepEqual(parsePositiveIntegerList('7'), [7]);
  assert.equal(parsePositiveIntegerList(['1', 'x']), null);
  assert.equal(parsePositiveIntegerList(['0']), null);
  assert.equal(parsePositiveIntegerList(['1', '2', '3'], { maxItems: 2 }), null);
});
