const cloudinary = require('cloudinary').v2;
const { execFile } = require('child_process');
const http = require('http');
const https = require('https');
const SystemSetting = require('../models/SystemSetting');
const { assertAllowedProviderBaseUrl } = require('../utils/outboundUrlPolicy');

const CHECK_PROMPT = 'Trả lời đúng một từ: OK';
const CHECK_TIMEOUT_MS = 45000;
const MODELS_TIMEOUT_MS = 20000;

async function checkProvider(provider, input = {}) {
  const currentSettings = await SystemSetting.getSettings();
  const settings = mergeSettings(currentSettings, input);
  const normalizedProvider = normalizeProvider(provider);

  if (normalizedProvider === 'cloudinary') return checkCloudinary(settings);
  if (normalizedProvider === 'gemini_cli') return checkGeminiCli(settings);
  if (normalizedProvider === 'gemini') return checkGemini(settings);
  if (['openai', 'nvidia', 'openrouter'].includes(normalizedProvider)) {
    return checkOpenAICompatible(settings, normalizedProvider);
  }

  return fail('Nguồn API không được hỗ trợ.');
}

function mergeSettings(currentSettings, input) {
  const merged = { ...currentSettings };
  Object.entries(input || {}).forEach(([key, value]) => {
    if (typeof value !== 'string' || !(key in currentSettings)) return;
    const trimmedValue = value.trim();
    if (trimmedValue) merged[key] = trimmedValue;
  });
  return merged;
}

async function checkOpenAICompatible(settings, provider) {
  const apiKey = getApiKey(settings, provider);
  const baseUrl = assertAllowedProviderBaseUrl(getBaseUrl(settings, provider), provider);
  const model = getChatModel(settings, provider);

  if (!apiKey) return fail('Chưa có API key để kiểm tra.');
  if (!baseUrl) return fail('Chưa có Base URL để kiểm tra.');
  if (!model) return fail('Chưa có model để kiểm tra.');

  const modelCheck = await checkModelsEndpoint({ baseUrl, apiKey, model, provider });
  if (modelCheck.hardFailure) return fail(modelCheck.message);

  const chatCheck = await checkChatCompletion({ baseUrl, apiKey, model, provider });
  if (chatCheck.ok) return chatCheck;

  const prefix = modelCheck.ok ? '' : `${modelCheck.message} `;
  return fail(`${prefix}${chatCheck.message}`.trim());
}

async function checkModelsEndpoint({ baseUrl, apiKey, model, provider }) {
  try {
    const response = await requestJson(`${baseUrl}/models`, {
      method: 'GET',
      headers: buildAuthHeaders(apiKey, provider),
      timeoutMs: MODELS_TIMEOUT_MS
    });

    if (response.statusCode === 401 || response.statusCode === 403) {
      return {
        ok: false,
        hardFailure: true,
        message: readJsonError(response.body, 'API key bị từ chối hoặc không có quyền truy cập.')
      };
    }

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

    if (modelIds.length === 0) {
      return {
        ok: false,
        hardFailure: false,
        message: 'API key hợp lệ nhưng provider không trả danh sách model.'
      };
    }

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

async function checkGemini(settings) {
  const apiKey = settings.gemini_api_key;
  const model = settings.gemini_model || 'gemini-1.5-flash';

  if (!apiKey) return fail('Chưa có Gemini API key để kiểm tra.');
  if (!model) return fail('Chưa có Gemini model để kiểm tra.');

  const listCheck = await checkGeminiModels(apiKey, model);
  if (listCheck.ok) return listCheck;
  if (listCheck.hardFailure) return fail(listCheck.message);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: CHECK_PROMPT }] }],
          generationConfig: { temperature: 0 }
        })
      }
    );

    if (!response.ok) {
      return fail(await readProviderError(response, `Gemini trả về HTTP ${response.status}.`));
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.map((part) => part.text).join('');
    if (!content) return fail('Gemini API key hợp lệ nhưng model không trả về nội dung.');
    return ok(`Kết nối thành công với model "${model}".`);
  } catch (error) {
    return fail(formatError(error));
  } finally {
    clearTimeout(timeout);
  }
}

async function checkChatCompletion({ baseUrl, apiKey, model, provider }) {
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

    if (response.statusCode === 401 || response.statusCode === 403) {
      return fail(readJsonError(response.body, 'API key bị từ chối hoặc không có quyền gọi chat completion.'));
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      return fail(readJsonError(response.body, `Provider trả về HTTP ${response.statusCode} khi gọi chat completion.`));
    }

    const content = response.body?.choices?.[0]?.message?.content;
    if (!content) return fail('Provider nhận API key nhưng chat completion không trả về nội dung.');

    return ok(`Kết nối chat thành công với model "${model}".`);
  } catch (error) {
    return fail(formatError(error));
  }
}

async function checkGeminiModels(apiKey, model) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MODELS_TIMEOUT_MS);
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`, {
      signal: controller.signal
    });
    if (response.status === 401 || response.status === 403) {
      return { ok: false, hardFailure: true, message: 'Gemini API key bị từ chối hoặc không có quyền truy cập.' };
    }
    if (!response.ok) return { ok: false, hardFailure: false, message: `Không đọc được danh sách Gemini model, HTTP ${response.status}.` };
    const data = await response.json();
    const modelIds = (data.models || []).map((item) => String(item.name || '').replace(/^models\//, '')).filter(Boolean);
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

async function checkGeminiCli(settings) {
  const model = settings.gemini_cli_model || 'gemini-2.5-flash-lite';
  const timeout = Number(settings.gemini_cli_timeout_ms || 120000);

  try {
    const output = await runGeminiCli(model, CHECK_PROMPT, timeout);
    if (!output) return fail('Gemini CLI chạy được nhưng không trả về nội dung.');
    return ok(`Gemini CLI hoạt động với model "${model}".`);
  } catch (error) {
    return fail(formatError(error));
  }
}

async function checkCloudinary(settings) {
  const cloudName = settings.cloudinary_cloud_name;
  const apiKey = settings.cloudinary_api_key;
  const apiSecret = settings.cloudinary_api_secret;

  if (!cloudName || !apiKey || !apiSecret) {
    return fail('Cần đủ Cloud name, API key và API secret để kiểm tra.');
  }

  try {
    cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
    await cloudinary.api.ping();
    return ok('Kết nối Cloudinary thành công.');
  } catch (error) {
    return fail(formatError(error));
  }
}

function buildAuthHeaders(apiKey, provider) {
  return {
    Authorization: `Bearer ${apiKey}`,
    ...(provider === 'openrouter' ? {
      'HTTP-Referer': 'http://localhost:3000',
      'X-Title': 'Toán Bổ Trợ Tiểu học'
    } : {})
  };
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

function requestJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const targetUrl = new URL(url);
    const client = targetUrl.protocol === 'http:' ? http : https;
    const body = options.body ? JSON.stringify(options.body) : null;
    const timeoutMs = options.timeoutMs || MODELS_TIMEOUT_MS;
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
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          raw += chunk;
        });
        response.on('end', () => {
          if (settled) return;
          settled = true;
          clearTimeout(hardTimer);
          let parsed = null;
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
      if (settled) return;
      settled = true;
      request.destroy(new Error('Quá thời gian chờ khi kiểm tra API.'));
      reject(new Error('Quá thời gian chờ khi kiểm tra API.'));
    }, timeoutMs);

    request.on('timeout', () => {
      request.destroy(new Error('Quá thời gian chờ khi kiểm tra API.'));
    });
    request.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(hardTimer);
      reject(error);
    });
    if (body) request.write(body);
    request.end();
  });
}

async function readProviderError(response, fallback) {
  try {
    const data = await response.json();
    return data.error?.message || data.message || fallback;
  } catch (error) {
    return fallback;
  }
}

function readJsonError(data, fallback) {
  return data?.error?.message || data?.message || data?.raw || fallback;
}

function getApiKey(settings, provider) {
  if (provider === 'openai') return settings.openai_api_key;
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
  if (provider === 'nvidia') return settings.nvidia_nim_model || 'meta/llama-3.3-70b-instruct';
  if (provider === 'openrouter') return settings.openrouter_model || 'openai/gpt-4o-mini';
  return '';
}

function getTimeout(settings) {
  return Number(settings.ai_json_timeout_ms || 12000);
}

function normalizeProvider(provider) {
  const value = String(provider || '').toLowerCase().replace('-', '_');
  if (['openai', 'gemini', 'gemini_cli', 'nvidia', 'openrouter', 'cloudinary'].includes(value)) return value;
  return '';
}

function ok(message) {
  return { ok: true, message };
}

function fail(message) {
  return { ok: false, message };
}

function formatError(error) {
  if (error?.name === 'AbortError') return 'Quá thời gian chờ khi kiểm tra API.';
  return error?.message || 'Không kiểm tra được kết nối API.';
}

module.exports = {
  checkProvider
};
