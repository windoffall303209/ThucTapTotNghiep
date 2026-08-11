// Dịch vụ provider check service đóng gói nghiệp vụ chính và phối hợp các lớp dữ liệu hoặc tích hợp bên ngoài.
const cloudinary = require('cloudinary').v2;
const { execFile } = require('child_process');
const http = require('http');
const https = require('https');
const SystemSetting = require('../models/SystemSetting');
const { assertAllowedProviderBaseUrl } = require('../utils/outboundUrlPolicy');

const CHECK_PROMPT = 'Trả lời đúng một từ: OK';
const CHECK_TIMEOUT_MS = 45000;
const MODELS_TIMEOUT_MS = 20000;
const MAX_PROVIDER_RESPONSE_BYTES = 2 * 1024 * 1024;
const BASE_URL_INPUT_PROVIDERS = Object.freeze({
  openai_base_url: 'openai',
  nvidia_nim_base_url: 'nvidia',
  openrouter_base_url: 'openrouter'
});

// Hàm checkProvider dùng để kiểm tra tính hợp lệ và các điều kiện an toàn; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function checkProvider(provider, input = {}) {
  const normalizedProvider = normalizeProvider(provider);
  if (!normalizedProvider) return fail('Nguồn API không được hỗ trợ.');
  const currentSettings = await SystemSetting.getSettings();
  let settings;
  try {
    settings = mergeSettings(currentSettings, input);
  } catch (error) {
    return fail(error.message || 'Dữ liệu kiểm tra provider không hợp lệ.');
  }

  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (normalizedProvider === 'cloudinary') return checkCloudinary(settings);
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (normalizedProvider === 'gemini_cli') return checkGeminiCli(settings);
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (normalizedProvider === 'gemini') return checkGemini(settings);
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (['openai', 'nvidia', 'openrouter'].includes(normalizedProvider)) {
    return checkOpenAICompatible(settings, normalizedProvider);
  }

  return fail('Nguồn API không được hỗ trợ.');
}

// Hàm mergeSettings dùng để cập nhật trạng thái hoặc dữ liệu theo quy tắc nghiệp vụ; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function mergeSettings(currentSettings, input) {
  const merged = { ...currentSettings };
  Object.entries(input || {}).forEach(([key, value]) => {
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!(key in currentSettings) || value == null) return;
    if (typeof value !== 'string') throw new Error('Dữ liệu kiểm tra provider không đúng định dạng.');
    const trimmedValue = value.trim();
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!trimmedValue) return;
    const validatedValue = SystemSetting.validateSettingValue(key, trimmedValue);
    merged[key] = BASE_URL_INPUT_PROVIDERS[key]
      ? assertAllowedProviderBaseUrl(validatedValue, BASE_URL_INPUT_PROVIDERS[key])
      : validatedValue;
  });
  return merged;
}

// Hàm checkOpenAICompatible dùng để kiểm tra tính hợp lệ và các điều kiện an toàn; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function checkOpenAICompatible(settings, provider) {
  const apiKey = getApiKey(settings, provider);
  const baseUrl = assertAllowedProviderBaseUrl(getBaseUrl(settings, provider), provider);
  const model = getChatModel(settings, provider);

  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!apiKey) return fail('Chưa có API key để kiểm tra.');
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!baseUrl) return fail('Chưa có Base URL để kiểm tra.');
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!model) return fail('Chưa có model để kiểm tra.');

  const modelCheck = await checkModelsEndpoint({ baseUrl, apiKey, model, provider });
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (modelCheck.hardFailure) return fail(modelCheck.message);

  const chatCheck = await checkChatCompletion({ baseUrl, apiKey, model, provider });
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (chatCheck.ok) return chatCheck;

  const prefix = modelCheck.ok ? '' : `${modelCheck.message} `;
  return fail(`${prefix}${chatCheck.message}`.trim());
}

// Hàm checkModelsEndpoint dùng để kiểm tra tính hợp lệ và các điều kiện an toàn; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function checkModelsEndpoint({ baseUrl, apiKey, model, provider }) {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  try {
    const response = await requestJson(`${baseUrl}/models`, {
      method: 'GET',
      headers: buildAuthHeaders(apiKey, provider),
      timeoutMs: MODELS_TIMEOUT_MS
    });

    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (response.statusCode === 401 || response.statusCode === 403) {
      return {
        ok: false,
        hardFailure: true,
        message: readJsonError(response.body, 'API key bị từ chối hoặc không có quyền truy cập.')
      };
    }

    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (response.statusCode < 200 || response.statusCode >= 300) {
      return {
        ok: false,
        hardFailure: false,
        message: readJsonError(response.body, `Không đọc được danh sách model, HTTP ${response.statusCode}.`)
      };
    }

    const data = response.body || {};
    const models = Array.isArray(data.data) ? data.data : Array.isArray(data.models) ? data.models : [];
    const modelIds = models
      .map((item) => item.id || item.name || item.model)
      .filter(Boolean);

    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (modelIds.length === 0) {
      return {
        ok: false,
        hardFailure: false,
        message: 'API key hợp lệ nhưng provider không trả danh sách model.'
      };
    }

    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (modelIds.includes(model)) {
      return ok(`API key hợp lệ. Model "${model}" có trong danh sách provider.`);
    }

    const suggestions = modelIds.slice(0, 8).join(', ');
    return {
      ok: false,
      hardFailure: false,
      message: `API key hợp lệ nhưng chưa thấy model "${model}" trong danh sách. Một số model hiện có: ${suggestions}.`
    };
  } catch (error) {
    return {
      ok: false,
      hardFailure: false,
      message: formatError(error)
    };
  }
}

// Hàm checkGemini dùng để kiểm tra tính hợp lệ và các điều kiện an toàn; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function checkGemini(settings) {
  const apiKey = settings.gemini_api_key;
  const model = settings.gemini_model || 'gemini-1.5-flash';

  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!apiKey) return fail('Chưa có Gemini API key để kiểm tra.');
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!model) return fail('Chưa có Gemini model để kiểm tra.');

  const listCheck = await checkGeminiModels(apiKey, model);
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (listCheck.ok) return listCheck;
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (listCheck.hardFailure) return fail(listCheck.message);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);

  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: CHECK_PROMPT }] }],
          generationConfig: { temperature: 0 }
        })
      }
    );

    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!response.ok) {
      return fail(await readProviderError(response, `Gemini trả về HTTP ${response.status}.`));
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.map((part) => part.text).join('');
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!content) return fail('Gemini API key hợp lệ nhưng model không trả về nội dung.');
    return ok(`Kết nối thành công với model "${model}".`);
  } catch (error) {
    return fail(formatError(error));
  } finally {
    clearTimeout(timeout);
  }
}

// Hàm checkChatCompletion dùng để kiểm tra tính hợp lệ và các điều kiện an toàn; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function checkChatCompletion({ baseUrl, apiKey, model, provider }) {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  try {
    const response = await requestJson(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: buildAuthHeaders(apiKey, provider),
      timeoutMs: CHECK_TIMEOUT_MS,
      body: {
        model,
        messages: [
          {
            role: 'system',
            content: 'Bạn chỉ trả lời đúng một từ OK.'
          },
          {
            role: 'user',
            content: CHECK_PROMPT
          }
        ],
        temperature: 0,
        max_tokens: 8
      }
    });

    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (response.statusCode === 401 || response.statusCode === 403) {
      return fail(readJsonError(response.body, 'API key bị từ chối hoặc không có quyền gọi chat completion.'));
    }

    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (response.statusCode < 200 || response.statusCode >= 300) {
      return fail(readJsonError(response.body, `Provider trả về HTTP ${response.statusCode} khi gọi chat completion.`));
    }

    const content = response.body?.choices?.[0]?.message?.content;
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!content) return fail('Provider nhận API key nhưng chat completion không trả về nội dung.');

    return ok(`Kết nối chat thành công với model "${model}".`);
  } catch (error) {
    return fail(formatError(error));
  }
}

// Hàm checkGeminiModels dùng để kiểm tra tính hợp lệ và các điều kiện an toàn; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function checkGeminiModels(apiKey, model) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MODELS_TIMEOUT_MS);
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  try {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
      signal: controller.signal,
      headers: { 'x-goog-api-key': apiKey }
    });
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (response.status === 401 || response.status === 403) {
      return { ok: false, hardFailure: true, message: 'Gemini API key bị từ chối hoặc không có quyền truy cập.' };
    }
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!response.ok) return { ok: false, hardFailure: false, message: `Không đọc được danh sách Gemini model, HTTP ${response.status}.` };
    const data = await response.json();
    const modelIds = (data.models || []).map((item) => String(item.name || '').replace(/^models\//, '')).filter(Boolean);
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (modelIds.includes(model)) return ok(`API key hợp lệ. Model "${model}" có trong danh sách Gemini.`);
    return {
      ok: false,
      hardFailure: false,
      message: `API key hợp lệ nhưng chưa thấy model "${model}" trong danh sách Gemini. Một số model hiện có: ${modelIds.slice(0, 8).join(', ')}.`
    };
  } catch (error) {
    return { ok: false, hardFailure: false, message: formatError(error) };
  } finally {
    clearTimeout(timeout);
  }
}

// Hàm checkGeminiCli dùng để kiểm tra tính hợp lệ và các điều kiện an toàn; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function checkGeminiCli(settings) {
  const model = settings.gemini_cli_model || 'gemini-2.5-flash-lite';
  const timeout = Number(settings.gemini_cli_timeout_ms || 120000);

  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  try {
    const output = await runGeminiCli(model, CHECK_PROMPT, timeout);
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!output) return fail('Gemini CLI chạy được nhưng không trả về nội dung.');
    return ok(`Gemini CLI hoạt động với model "${model}".`);
  } catch (error) {
    return fail(formatError(error));
  }
}

// Hàm checkCloudinary dùng để kiểm tra tính hợp lệ và các điều kiện an toàn; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function checkCloudinary(settings) {
  const cloudName = settings.cloudinary_cloud_name;
  const apiKey = settings.cloudinary_api_key;
  const apiSecret = settings.cloudinary_api_secret;

  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!cloudName || !apiKey || !apiSecret) {
    return fail('Cần đủ Cloud name, API key và API secret để kiểm tra.');
  }

  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  try {
    cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
    await cloudinary.api.ping();
    return ok('Kết nối Cloudinary thành công.');
  } catch (error) {
    return fail(formatError(error));
  }
}

// Hàm buildAuthHeaders dùng để xây dựng kết quả từ các nguồn dữ liệu và quy tắc liên quan; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function buildAuthHeaders(apiKey, provider) {
  return {
    Authorization: `Bearer ${apiKey}`,
    ...(provider === 'openrouter' ? {
      'HTTP-Referer': 'http://localhost:3000',
      'X-Title': 'Toán Bổ Trợ Tiểu học'
    } : {})
  };
}

// Hàm runGeminiCli dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function runGeminiCli(model, prompt, timeout) {
  return new Promise((resolve, reject) => {
    const child = execFile('gemini', ['-m', model, prompt], { timeout }, (error, stdout, stderr) => {
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (error) return reject(error);
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (stderr && !stdout) return reject(new Error(stderr));
      return resolve(stdout.trim());
    });
    child.stdin?.end();
  });
}

// Hàm requestJson dùng để xử lý yêu cầu, điều phối các bước nghiệp vụ và phản hồi lỗi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function requestJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const targetUrl = new URL(url);
    const client = targetUrl.protocol === 'http:' ? http : https;
    const body = options.body ? JSON.stringify(options.body) : null;
    const timeoutMs = options.timeoutMs || MODELS_TIMEOUT_MS;
    const maxResponseBytes = options.maxResponseBytes || MAX_PROVIDER_RESPONSE_BYTES;
    let settled = false;

    const request = client.request(
      {
        method: options.method || 'GET',
        protocol: targetUrl.protocol,
        hostname: targetUrl.hostname,
        port: targetUrl.port,
        path: `${targetUrl.pathname}${targetUrl.search}`,
        headers: {
          ...(options.headers || {}),
          ...(body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {})
        },
        timeout: timeoutMs
      },
      (response) => {
        let raw = '';
        let receivedBytes = 0;
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          receivedBytes += Buffer.byteLength(chunk);
          if (receivedBytes > maxResponseBytes) {
            if (settled) return;
            settled = true;
            clearTimeout(hardTimer);
            const error = new Error('Phản hồi từ API vượt quá giới hạn an toàn.');
            error.code = 'PROVIDER_RESPONSE_TOO_LARGE';
            response.destroy();
            request.destroy();
            reject(error);
            return;
          }
          raw += chunk;
        });
        response.on('end', () => {
          // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
          if (settled) return;
          settled = true;
          clearTimeout(hardTimer);
          let parsed = null;
          // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
          try {
            parsed = raw ? JSON.parse(raw) : null;
          } catch (error) {
            parsed = { raw };
          }
          resolve({
            statusCode: response.statusCode || 0,
            headers: response.headers,
            body: parsed
          });
        });
      }
    );

    const hardTimer = setTimeout(() => {
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (settled) return;
      settled = true;
      request.destroy(new Error('Quá thời gian chờ khi kiểm tra API.'));
      reject(new Error('Quá thời gian chờ khi kiểm tra API.'));
    }, timeoutMs);

    request.on('timeout', () => {
      request.destroy(new Error('Quá thời gian chờ khi kiểm tra API.'));
    });
    request.on('error', (error) => {
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (settled) return;
      settled = true;
      clearTimeout(hardTimer);
      reject(error);
    });
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (body) request.write(body);
    request.end();
  });
}

// Hàm readProviderError dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function readProviderError(response, fallback) {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  try {
    const data = await response.json();
    return data.error?.message || data.message || fallback;
  } catch (error) {
    return fallback;
  }
}

// Hàm readJsonError dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function readJsonError(data, fallback) {
  return data?.error?.message || data?.message || data?.raw || fallback;
}

// Hàm getApiKey dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function getApiKey(settings, provider) {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (provider === 'openai') return settings.openai_api_key;
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (provider === 'nvidia') return settings.nvidia_nim_api_key;
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (provider === 'openrouter') return settings.openrouter_api_key;
  return '';
}

// Hàm getBaseUrl dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function getBaseUrl(settings, provider) {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (provider === 'openai') return settings.openai_base_url || 'https://api.openai.com/v1';
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (provider === 'nvidia') return settings.nvidia_nim_base_url || 'https://integrate.api.nvidia.com/v1';
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (provider === 'openrouter') return settings.openrouter_base_url || 'https://openrouter.ai/api/v1';
  return '';
}

// Hàm getChatModel dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function getChatModel(settings, provider) {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (provider === 'openai') return settings.openai_model || 'gpt-4o-mini';
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (provider === 'nvidia') return settings.nvidia_nim_model || 'meta/llama-3.3-70b-instruct';
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (provider === 'openrouter') return settings.openrouter_model || 'openai/gpt-4o-mini';
  return '';
}

// Hàm getTimeout dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function getTimeout(settings) {
  return Number(settings.ai_json_timeout_ms || 12000);
}

// Hàm normalizeProvider dùng để chuẩn hóa và làm sạch dữ liệu đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function normalizeProvider(provider) {
  if (typeof provider !== 'string') return '';
  const value = provider.trim().toLowerCase().replace('-', '_');
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (['openai', 'gemini', 'gemini_cli', 'nvidia', 'openrouter', 'cloudinary'].includes(value)) return value;
  return '';
}

// Hàm ok dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function ok(message) {
  return { ok: true, message };
}

// Hàm fail dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function fail(message) {
  return { ok: false, message };
}

// Hàm formatError dùng để chuyển đổi dữ liệu sang định dạng phù hợp; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function formatError(error) {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (error?.name === 'AbortError') return 'Quá thời gian chờ khi kiểm tra API.';
  return error?.message || 'Không kiểm tra được kết nối API.';
}

module.exports = {
  checkProvider,
  _test: {
    MAX_PROVIDER_RESPONSE_BYTES,
    mergeSettings,
    requestJson
  }
};
