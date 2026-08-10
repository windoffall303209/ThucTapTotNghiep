// D?ch v? provider check service ??ng g?i nghi?p v? ch?nh v? ph?i h?p c?c l?p d? li?u ho?c t?ch h?p b?n ngo?i.
const cloudinary = require('cloudinary').v2;
const { execFile } = require('child_process');
const http = require('http');
const https = require('https');
const SystemSetting = require('../models/SystemSetting');
const { assertAllowedProviderBaseUrl } = require('../utils/outboundUrlPolicy');

const CHECK_PROMPT = 'Trả lời đúng một từ: OK';
const CHECK_TIMEOUT_MS = 45000;
const MODELS_TIMEOUT_MS = 20000;

// H?m checkProvider d?ng ?? ki?m tra t?nh h?p l? v? c?c ?i?u ki?n an to?n; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function checkProvider(provider, input = {}) {
  const currentSettings = await SystemSetting.getSettings();
  const settings = mergeSettings(currentSettings, input);
  const normalizedProvider = normalizeProvider(provider);

  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (normalizedProvider === 'cloudinary') return checkCloudinary(settings);
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (normalizedProvider === 'gemini_cli') return checkGeminiCli(settings);
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (normalizedProvider === 'gemini') return checkGemini(settings);
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (['openai', 'nvidia', 'openrouter'].includes(normalizedProvider)) {
    return checkOpenAICompatible(settings, normalizedProvider);
  }

  return fail('Nguồn API không được hỗ trợ.');
}

// H?m mergeSettings d?ng ?? c?p nh?t tr?ng th?i ho?c d? li?u theo quy t?c nghi?p v?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function mergeSettings(currentSettings, input) {
  const merged = { ...currentSettings };
  Object.entries(input || {}).forEach(([key, value]) => {
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (typeof value !== 'string' || !(key in currentSettings)) return;
    const trimmedValue = value.trim();
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (trimmedValue) merged[key] = trimmedValue;
  });
  return merged;
}

// H?m checkOpenAICompatible d?ng ?? ki?m tra t?nh h?p l? v? c?c ?i?u ki?n an to?n; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function checkOpenAICompatible(settings, provider) {
  const apiKey = getApiKey(settings, provider);
  const baseUrl = assertAllowedProviderBaseUrl(getBaseUrl(settings, provider), provider);
  const model = getChatModel(settings, provider);

  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!apiKey) return fail('Chưa có API key để kiểm tra.');
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!baseUrl) return fail('Chưa có Base URL để kiểm tra.');
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!model) return fail('Chưa có model để kiểm tra.');

  const modelCheck = await checkModelsEndpoint({ baseUrl, apiKey, model, provider });
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (modelCheck.hardFailure) return fail(modelCheck.message);

  const chatCheck = await checkChatCompletion({ baseUrl, apiKey, model, provider });
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (chatCheck.ok) return chatCheck;

  const prefix = modelCheck.ok ? '' : `${modelCheck.message} `;
  return fail(`${prefix}${chatCheck.message}`.trim());
}

// H?m checkModelsEndpoint d?ng ?? ki?m tra t?nh h?p l? v? c?c ?i?u ki?n an to?n; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function checkModelsEndpoint({ baseUrl, apiKey, model, provider }) {
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    const response = await requestJson(`${baseUrl}/models`, {
      method: 'GET',
      headers: buildAuthHeaders(apiKey, provider),
      timeoutMs: MODELS_TIMEOUT_MS
    });

    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (response.statusCode === 401 || response.statusCode === 403) {
      return {
        ok: false,
        hardFailure: true,
        message: readJsonError(response.body, 'API key bị từ chối hoặc không có quyền truy cập.')
      };
    }

    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
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

    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (modelIds.length === 0) {
      return {
        ok: false,
        hardFailure: false,
        message: 'API key hợp lệ nhưng provider không trả danh sách model.'
      };
    }

    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
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

// H?m checkGemini d?ng ?? ki?m tra t?nh h?p l? v? c?c ?i?u ki?n an to?n; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function checkGemini(settings) {
  const apiKey = settings.gemini_api_key;
  const model = settings.gemini_model || 'gemini-1.5-flash';

  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!apiKey) return fail('Chưa có Gemini API key để kiểm tra.');
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!model) return fail('Chưa có Gemini model để kiểm tra.');

  const listCheck = await checkGeminiModels(apiKey, model);
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (listCheck.ok) return listCheck;
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (listCheck.hardFailure) return fail(listCheck.message);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);

  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
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

    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!response.ok) {
      return fail(await readProviderError(response, `Gemini trả về HTTP ${response.status}.`));
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.map((part) => part.text).join('');
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!content) return fail('Gemini API key hợp lệ nhưng model không trả về nội dung.');
    return ok(`Kết nối thành công với model "${model}".`);
  } catch (error) {
    return fail(formatError(error));
  } finally {
    clearTimeout(timeout);
  }
}

// H?m checkChatCompletion d?ng ?? ki?m tra t?nh h?p l? v? c?c ?i?u ki?n an to?n; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function checkChatCompletion({ baseUrl, apiKey, model, provider }) {
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
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

    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (response.statusCode === 401 || response.statusCode === 403) {
      return fail(readJsonError(response.body, 'API key bị từ chối hoặc không có quyền gọi chat completion.'));
    }

    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (response.statusCode < 200 || response.statusCode >= 300) {
      return fail(readJsonError(response.body, `Provider trả về HTTP ${response.statusCode} khi gọi chat completion.`));
    }

    const content = response.body?.choices?.[0]?.message?.content;
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!content) return fail('Provider nhận API key nhưng chat completion không trả về nội dung.');

    return ok(`Kết nối chat thành công với model "${model}".`);
  } catch (error) {
    return fail(formatError(error));
  }
}

// H?m checkGeminiModels d?ng ?? ki?m tra t?nh h?p l? v? c?c ?i?u ki?n an to?n; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function checkGeminiModels(apiKey, model) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MODELS_TIMEOUT_MS);
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
      signal: controller.signal,
      headers: { 'x-goog-api-key': apiKey }
    });
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (response.status === 401 || response.status === 403) {
      return { ok: false, hardFailure: true, message: 'Gemini API key bị từ chối hoặc không có quyền truy cập.' };
    }
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!response.ok) return { ok: false, hardFailure: false, message: `Không đọc được danh sách Gemini model, HTTP ${response.status}.` };
    const data = await response.json();
    const modelIds = (data.models || []).map((item) => String(item.name || '').replace(/^models\//, '')).filter(Boolean);
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
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

// H?m checkGeminiCli d?ng ?? ki?m tra t?nh h?p l? v? c?c ?i?u ki?n an to?n; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function checkGeminiCli(settings) {
  const model = settings.gemini_cli_model || 'gemini-2.5-flash-lite';
  const timeout = Number(settings.gemini_cli_timeout_ms || 120000);

  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    const output = await runGeminiCli(model, CHECK_PROMPT, timeout);
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!output) return fail('Gemini CLI chạy được nhưng không trả về nội dung.');
    return ok(`Gemini CLI hoạt động với model "${model}".`);
  } catch (error) {
    return fail(formatError(error));
  }
}

// H?m checkCloudinary d?ng ?? ki?m tra t?nh h?p l? v? c?c ?i?u ki?n an to?n; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function checkCloudinary(settings) {
  const cloudName = settings.cloudinary_cloud_name;
  const apiKey = settings.cloudinary_api_key;
  const apiSecret = settings.cloudinary_api_secret;

  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!cloudName || !apiKey || !apiSecret) {
    return fail('Cần đủ Cloud name, API key và API secret để kiểm tra.');
  }

  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
    await cloudinary.api.ping();
    return ok('Kết nối Cloudinary thành công.');
  } catch (error) {
    return fail(formatError(error));
  }
}

// H?m buildAuthHeaders d?ng ?? x?y d?ng k?t qu? t? c?c ngu?n d? li?u v? quy t?c li?n quan; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function buildAuthHeaders(apiKey, provider) {
  return {
    Authorization: `Bearer ${apiKey}`,
    ...(provider === 'openrouter' ? {
      'HTTP-Referer': 'http://localhost:3000',
      'X-Title': 'Toán Bổ Trợ Tiểu học'
    } : {})
  };
}

// H?m runGeminiCli d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function runGeminiCli(model, prompt, timeout) {
  return new Promise((resolve, reject) => {
    const child = execFile('gemini', ['-m', model, prompt], { timeout }, (error, stdout, stderr) => {
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (error) return reject(error);
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (stderr && !stdout) return reject(new Error(stderr));
      return resolve(stdout.trim());
    });
    child.stdin?.end();
  });
}

// H?m requestJson d?ng ?? x? l? y?u c?u, ?i?u ph?i c?c b??c nghi?p v? v? ph?n h?i l?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
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
          // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
          if (settled) return;
          settled = true;
          clearTimeout(hardTimer);
          let parsed = null;
          // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
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
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (settled) return;
      settled = true;
      request.destroy(new Error('Quá thời gian chờ khi kiểm tra API.'));
      reject(new Error('Quá thời gian chờ khi kiểm tra API.'));
    }, timeoutMs);

    request.on('timeout', () => {
      request.destroy(new Error('Quá thời gian chờ khi kiểm tra API.'));
    });
    request.on('error', (error) => {
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (settled) return;
      settled = true;
      clearTimeout(hardTimer);
      reject(error);
    });
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (body) request.write(body);
    request.end();
  });
}

// H?m readProviderError d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function readProviderError(response, fallback) {
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    const data = await response.json();
    return data.error?.message || data.message || fallback;
  } catch (error) {
    return fallback;
  }
}

// H?m readJsonError d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function readJsonError(data, fallback) {
  return data?.error?.message || data?.message || data?.raw || fallback;
}

// H?m getApiKey d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function getApiKey(settings, provider) {
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (provider === 'openai') return settings.openai_api_key;
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (provider === 'nvidia') return settings.nvidia_nim_api_key;
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (provider === 'openrouter') return settings.openrouter_api_key;
  return '';
}

// H?m getBaseUrl d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function getBaseUrl(settings, provider) {
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (provider === 'openai') return settings.openai_base_url || 'https://api.openai.com/v1';
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (provider === 'nvidia') return settings.nvidia_nim_base_url || 'https://integrate.api.nvidia.com/v1';
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (provider === 'openrouter') return settings.openrouter_base_url || 'https://openrouter.ai/api/v1';
  return '';
}

// H?m getChatModel d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function getChatModel(settings, provider) {
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (provider === 'openai') return settings.openai_model || 'gpt-4o-mini';
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (provider === 'nvidia') return settings.nvidia_nim_model || 'meta/llama-3.3-70b-instruct';
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (provider === 'openrouter') return settings.openrouter_model || 'openai/gpt-4o-mini';
  return '';
}

// H?m getTimeout d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function getTimeout(settings) {
  return Number(settings.ai_json_timeout_ms || 12000);
}

// H?m normalizeProvider d?ng ?? chu?n h?a v? l?m s?ch d? li?u ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function normalizeProvider(provider) {
  const value = String(provider || '').toLowerCase().replace('-', '_');
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (['openai', 'gemini', 'gemini_cli', 'nvidia', 'openrouter', 'cloudinary'].includes(value)) return value;
  return '';
}

// H?m ok d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function ok(message) {
  return { ok: true, message };
}

// H?m fail d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function fail(message) {
  return { ok: false, message };
}

// H?m formatError d?ng ?? chuy?n ??i d? li?u sang ??nh d?ng ph? h?p; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function formatError(error) {
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (error?.name === 'AbortError') return 'Quá thời gian chờ khi kiểm tra API.';
  return error?.message || 'Không kiểm tra được kết nối API.';
}

module.exports = {
  checkProvider
};
