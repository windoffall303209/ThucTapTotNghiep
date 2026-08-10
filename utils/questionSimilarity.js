// Tiện ích question similarity cung cấp các hàm dùng chung cho chuẩn hóa dữ liệu, bảo mật và xử lý lỗi.
const DEFAULT_SIMILARITY_THRESHOLD = 0.9;
const fingerprintCache = new Map();

// Hàm normalizeQuestionTextForSimilarity dùng để chuẩn hóa và làm sạch dữ liệu đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function normalizeQuestionTextForSimilarity(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[×∙⋅]/g, '*')
    .replace(/(\d)\s*:\s*(\d)/g, '$1/$2')
    .replace(/÷/g, '/')
    .replace(/[–—−]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/\s*([+*/=<>-])\s*/g, '$1')
    .replace(/[^a-z0-9+*/=<>.,%-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Hàm questionSimilarity dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function questionSimilarity(left, right) {
  const leftText = questionText(left);
  const rightText = questionText(right);
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!leftText || !rightText) return 0;
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (leftText === rightText) return 1;
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (Math.min(leftText.length, rightText.length) < 12) return 0;
  return diceCoefficient(fingerprint(leftText), fingerprint(rightText));
}

// Hàm areQuestionsNearDuplicate dùng để xử lý yêu cầu, điều phối các bước nghiệp vụ và phản hồi lỗi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function areQuestionsNearDuplicate(left, right, threshold = DEFAULT_SIMILARITY_THRESHOLD) {
  return questionSimilarity(left, right) >= threshold;
}

// Hàm countNearDuplicatePairs dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function countNearDuplicatePairs(questions = [], threshold = DEFAULT_SIMILARITY_THRESHOLD) {
  let pairs = 0;
  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (let leftIndex = 0; leftIndex < questions.length; leftIndex += 1) {
    // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
    for (let rightIndex = leftIndex + 1; rightIndex < questions.length; rightIndex += 1) {
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (areQuestionsNearDuplicate(questions[leftIndex], questions[rightIndex], threshold)) {
        pairs += 1;
      }
    }
  }
  return pairs;
}

// Hàm questionText dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function questionText(question) {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (typeof question === 'string') return normalizeQuestionTextForSimilarity(question);
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (typeof question?.similarity_text === 'string') return question.similarity_text;
  const content = question?.content_text
    ?? question?.content?.text
    ?? (typeof question?.content === 'string' ? question.content : '');
  return normalizeQuestionTextForSimilarity(content);
}

// Hàm fingerprint dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function fingerprint(value) {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!fingerprintCache.has(value)) {
    fingerprintCache.set(value, characterBigrams(value));
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (fingerprintCache.size > 20000) {
      const oldestKey = fingerprintCache.keys().next().value;
      fingerprintCache.delete(oldestKey);
    }
  }
  return fingerprintCache.get(value);
}

// Hàm characterBigrams dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function characterBigrams(value) {
  const compact = ` ${value} `;
  const counts = new Map();
  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (let index = 0; index < compact.length - 1; index += 1) {
    const gram = compact.slice(index, index + 2);
    counts.set(gram, (counts.get(gram) || 0) + 1);
  }
  return counts;
}

// Hàm diceCoefficient dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function diceCoefficient(left, right) {
  const leftTotal = [...left.values()].reduce((sum, count) => sum + count, 0);
  const rightTotal = [...right.values()].reduce((sum, count) => sum + count, 0);
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (leftTotal === 0 || rightTotal === 0) return 0;
  let overlap = 0;
  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (const [gram, leftCount] of left.entries()) {
    overlap += Math.min(leftCount, right.get(gram) || 0);
  }
  return (2 * overlap) / (leftTotal + rightTotal);
}

module.exports = {
  DEFAULT_SIMILARITY_THRESHOLD,
  normalizeQuestionTextForSimilarity,
  questionSimilarity,
  areQuestionsNearDuplicate,
  countNearDuplicatePairs
};
