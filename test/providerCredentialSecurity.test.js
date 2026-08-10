// Bộ kiểm thử provider credential security.test xác minh hành vi và các điều kiện biên quan trọng của hệ thống.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SystemSetting = require('../models/SystemSetting');
const { checkProvider } = require('../services/ProviderCheckService');
const { explainTheory } = require('../services/SocraticAIService');

const TEST_API_KEY = 'gemini-secret-that-must-not-appear-in-a-url';

// Hàm jsonResponse dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

test('kiểm tra Gemini truyền API key qua header thay vì URL', async (t) => {
  const originalFetch = global.fetch;
  const requests = [];
  t.after(() => {
    global.fetch = originalFetch;
  });

  global.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (String(url).endsWith('/models')) {
      return jsonResponse({ models: [{ name: 'models/another-model' }] });
    }
    return jsonResponse({
      candidates: [{ content: { parts: [{ text: 'OK' }] } }]
    });
  };

  const result = await checkProvider('gemini', {
    gemini_api_key: TEST_API_KEY,
    gemini_model: 'gemini-test'
  });

  assert.equal(result.ok, true);
  assert.equal(requests.length, 2);
  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (const request of requests) {
    assert.equal(request.url.includes(TEST_API_KEY), false);
    assert.equal(new URL(request.url).search, '');
    assert.equal(request.options.headers['x-goog-api-key'], TEST_API_KEY);
  }
});

test('gia sư Gemini truyền API key qua header thay vì URL', async (t) => {
  const originalFetch = global.fetch;
  const originalGetSettings = SystemSetting.getSettings;
  let capturedRequest = null;
  t.after(() => {
    global.fetch = originalFetch;
    SystemSetting.getSettings = originalGetSettings;
  });

  SystemSetting.getSettings = async () => ({
    ai_automation_enabled: 'true',
    ai_provider: 'gemini',
    gemini_api_key: TEST_API_KEY,
    gemini_model: 'gemini-test',
    ai_json_timeout_ms: '1000'
  });
  global.fetch = async (url, options = {}) => {
    capturedRequest = { url: String(url), options };
    return jsonResponse({
      candidates: [{ content: { parts: [{ text: 'Em thử cộng từng hàng nhé.' }] } }]
    });
  };

  const result = await explainTheory({
    grade: 3,
    lesson: { lesson_name: 'Phép cộng' },
    card: { title: 'Cộng có nhớ', body: 'Cộng từ hàng đơn vị.' },
    question: 'Em bắt đầu từ đâu?'
  });

  assert.equal(result.provider, 'gemini');
  assert.equal(capturedRequest.url.includes(TEST_API_KEY), false);
  assert.equal(new URL(capturedRequest.url).search, '');
  assert.equal(capturedRequest.options.headers['x-goog-api-key'], TEST_API_KEY);
});

test('mã nguồn không còn ghép khóa Gemini vào query string', () => {
  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (const relativePath of [
    'services/SocraticAIService.js',
    'services/ProviderCheckService.js'
  ]) {
    const source = fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
    assert.doesNotMatch(source, /generativelanguage\.googleapis\.com[^`'"]*\?(?:key|[^`'"]*&key)=/);
  }
});
