const SystemSetting = require('../models/SystemSetting');
const { execFile } = require('child_process');

async function explainTheory({ grade, lesson, card, question }) {
  const fallback = buildTheoryFallback({ grade, lesson, card, question });
  const settings = await SystemSetting.getSettings();
  const formulas = Array.isArray(card?.formulas)
    ? card.formulas.join('\n')
    : card?.formula || '';
  const prompt = [
    `Em là gia sư Toán theo phương pháp Socratic cho học sinh lớp ${grade}.`,
    'Không đưa đáp án trực tiếp nếu học sinh có thể tự suy luận.',
    `Bài học: ${lesson.lesson_name}.`,
    `Thẻ lý thuyết: ${card?.title || lesson.lesson_name}.`,
    `Nội dung: ${card?.body || ''}`,
    question ? `Câu hỏi thêm của học sinh: ${question}` : ''
  ].filter(Boolean).join('\n');

  return callConfiguredAI(settings, prompt, fallback);
}

async function explainExercise({ grade, question, selectedAnswer, misconception, studentMessage }) {
  const fallback = buildExerciseFallback({ grade, question, selectedAnswer, misconception, studentMessage });
  const selectedText = question.choices.find((choice) => choice.key === selectedAnswer)?.text || 'chưa chọn';
  const settings = await SystemSetting.getSettings();
  const prompt = [
    `Em là gia sư Toán theo phương pháp Socratic cho học sinh lớp ${grade}.`,
    'Hãy gợi mở từng bước, không tự ý thay đổi đáp án chuẩn của hệ thống.',
    `Đề bài: ${question.content?.text || ''}`,
    `Đáp án đúng: ${question.correct_answer}.`,
    `Học sinh chọn: ${selectedAnswer || 'chưa chọn'} - ${selectedText}.`,
    misconception ? `Lỗi sai thường gặp: ${misconception.explanation}` : '',
    `Lời giải chuẩn: ${question.explanation?.text || ''}`,
    studentMessage ? `Câu hỏi thêm của học sinh: ${studentMessage}` : ''
  ].filter(Boolean).join('\n');

  return callConfiguredAI(settings, prompt, fallback);
}

async function callConfiguredAI(settings, prompt, fallback) {
  const provider = normalizeProvider(settings.ai_provider);
  const apiKey = getApiKey(settings, provider);

  if (String(settings.ai_automation_enabled || 'true') === 'false') {
    return `${fallback}\n\nGhi chú: AI automation đang tắt, hệ thống dùng phản hồi mô phỏng.`;
  }

  if (provider === 'gemini_cli') {
    return callGeminiCli(settings, prompt, fallback);
  }

  if (!provider || provider === 'mock' || !apiKey) {
    return `${fallback}\n\nGhi chú: AI đang chạy ở chế độ mô phỏng vì chưa có API key hợp lệ.`;
  }

  try {
    if (provider === 'gemini') {
      return await callGemini(settings, apiKey, prompt);
    }
    return await callOpenAICompatible(settings, provider, apiKey, prompt);
  } catch (error) {
    console.warn('Không thể gọi AI provider, dùng phản hồi mô phỏng:', error.message);
    return `${fallback}\n\nGhi chú: Không gọi được dịch vụ AI, hệ thống đã dùng phản hồi mô phỏng.`;
  }
}

async function callOpenAICompatible(settings, provider, apiKey, prompt) {
  const baseUrl = getBaseUrl(settings, provider).replace(/\/$/, '');
  const model = getChatModel(settings, provider);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(settings.ai_json_timeout_ms || 45000));

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        ...(provider === 'openrouter' ? { 'HTTP-Referer': 'http://localhost:3000', 'X-Title': 'Toán Bổ Trợ 1-7' } : {})
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: 'Bạn là gia sư Toán tiếng Việt, giải thích ngắn gọn, gợi mở và phù hợp học sinh lớp 1-7.'
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.4,
        max_tokens: 700
      })
    });

    if (!response.ok) {
      throw new Error(`AI trả về HTTP ${response.status}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || 'AI chưa trả về nội dung.';
  } finally {
    clearTimeout(timeout);
  }
}

async function callGemini(settings, apiKey, prompt) {
  const model = settings.gemini_model || 'gemini-1.5-flash';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(settings.ai_json_timeout_ms || 12000));

  let response;
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }]
            }
          ],
          generationConfig: {
            temperature: 0.4
          }
        })
      }
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`Gemini trả về HTTP ${response.status}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.map((part) => part.text).join('\n').trim()
    || 'AI chưa trả về nội dung.';
}

async function callGeminiCli(settings, prompt, fallback) {
  const timeout = Number(settings.gemini_cli_timeout_ms || 120000);
  const model = settings.gemini_cli_model || 'gemini-2.5-flash-lite';

  try {
    const output = await runGeminiCli(model, prompt, timeout);
    return output || `${fallback}\n\nGhi chú: Gemini CLI không trả về nội dung, hệ thống dùng phản hồi mô phỏng.`;
  } catch (error) {
    console.warn('Không gọi được Gemini CLI, dùng phản hồi mô phỏng:', error.message);
    return `${fallback}\n\nGhi chú: Không gọi được Gemini CLI, hệ thống đã dùng phản hồi mô phỏng.`;
  }
}

function runGeminiCli(model, prompt, timeout) {
  return new Promise((resolve, reject) => {
    const child = execFile('gemini', ['-m', model, prompt], { timeout }, (error, stdout, stderr) => {
      if (error) return reject(error);
      if (stderr && !stdout) return reject(new Error(stderr));
      return resolve(stdout.trim());
    });
    child.stdin?.end();
  });
}

function getApiKey(settings, provider) {
  if (provider === 'openai') return settings.openai_api_key;
  if (provider === 'gemini') return settings.gemini_api_key;
  if (provider === 'nvidia') return settings.nvidia_nim_api_key;
  if (provider === 'openrouter') return settings.openrouter_api_key;
  return '';
}

function getBaseUrl(settings, provider) {
  if (provider === 'openai') return settings.openai_base_url || 'https://api.openai.com/v1';
  if (provider === 'nvidia') return settings.nvidia_nim_base_url || 'https://integrate.api.nvidia.com/v1';
  if (provider === 'openrouter') return settings.openrouter_base_url || 'https://openrouter.ai/api/v1';
  return '';
}

function getChatModel(settings, provider) {
  if (provider === 'openai') return settings.openai_model || 'gpt-4o-mini';
  if (provider === 'nvidia') return settings.nvidia_nim_model || 'meta/llama-3.1-8b-instruct';
  if (provider === 'openrouter') return settings.openrouter_model || 'openai/gpt-4o-mini';
  return '';
}

function normalizeProvider(provider) {
  const value = String(provider || 'mock').toLowerCase();
  if (['openai', 'gemini', 'gemini_cli', 'nvidia', 'openrouter', 'mock'].includes(value)) return value;
  return 'mock';
}

function buildTheoryFallback({ grade, lesson, card, question }) {
  const title = card?.title || lesson.lesson_name;
  const extra = question ? ` Em đang hỏi thêm: "${question}".` : '';

  return [
    `Với học sinh lớp ${grade}, ta có thể hiểu "${title}" theo cách chậm rãi hơn.`,
    card?.body || 'Nội dung lý thuyết của bài này cần được đọc theo từng ý nhỏ.',
    'Em hãy thử tự trả lời: trong ví dụ này, bước nào làm cho giá trị ban đầu không thay đổi?',
    extra
  ].filter(Boolean).join(' ');
}

function buildExerciseFallback({ grade, question, selectedAnswer, misconception, studentMessage }) {
  const selectedText = question.choices.find((choice) => choice.key === selectedAnswer)?.text || 'chưa chọn';
  const misconceptionText = misconception
    ? `Lỗi có thể gặp là: ${misconception.explanation}`
    : 'Trước hết, em cần đọc lại đề và xác định dữ kiện quan trọng nhất.';
  const promptBack = studentMessage
    ? ` Với câu hỏi thêm của em: "${studentMessage}", hãy thử nói lại bước em đang băn khoăn.`
    : '';

  return [
    `Ở mức lớp ${grade}, mình sẽ không đưa ngay đáp án mới.`,
    `Em đã chọn ${selectedText}. ${misconceptionText}`,
    'Bây giờ em hãy nhìn vào mẫu số hoặc đơn vị trong đề: cần biến đổi gì trước khi tính?',
    promptBack
  ].filter(Boolean).join(' ');
}

module.exports = {
  explainTheory,
  explainExercise
};
