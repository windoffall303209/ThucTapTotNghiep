// Bộ kiểm thử web security.test xác minh hành vi và các điều kiện biên quan trọng của hệ thống.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const fsPromises = require('fs/promises');
const os = require('os');
const path = require('path');

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-session-secret-long-enough-for-web-security';

const app = require('../app');
const { detectImageType } = require('../middleware/upload');
const {
  assertAllowedProviderBaseUrl,
  validateAllowedProviderOrigins
} = require('../utils/outboundUrlPolicy');
const { safeAdminReturnTo } = require('../utils/safeRedirect');
const { safeJsonForHtml } = require('../utils/safeJson');

test('JSON nhúng vào HTML không thể đóng thẻ script và vẫn đọc lại đúng dữ liệu', () => {
  const payload = {
    text: '</script><script>globalThis.compromised=true</script>',
    separators: '\u2028\u2029',
    html: '<img src=x onerror=alert(1)> &'
  };
  const serialized = safeJsonForHtml(payload);

  assert.equal(serialized.includes('<'), false);
  assert.equal(serialized.includes('>'), false);
  assert.equal(serialized.includes('&'), false);
  assert.equal(serialized.includes('\u2028'), false);
  assert.equal(serialized.includes('\u2029'), false);
  assert.deepEqual(JSON.parse(serialized), payload);

  const practiceView = fs.readFileSync(
    path.join(__dirname, '..', 'views', 'student', 'practice.ejs'),
    'utf8'
  );
  assert.match(practiceView, /safeJsonForHtml\(questions\)/);
  assert.doesNotMatch(practiceView, /<%-\s*JSON\.stringify\(/);
});

test('chuyển hướng quay lại chỉ chấp nhận đường dẫn nội bộ của admin', () => {
  assert.equal(
    safeAdminReturnTo('/admin/logs/ai?page=2#result', '/admin/logs/ai'),
    '/admin/logs/ai?page=2#result'
  );
  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (const unsafe of [
    'https://evil.example/steal',
    '//evil.example/steal',
    '/\\evil.example',
    '/student/dashboard',
    'javascript:alert(1)'
  ]) {
    assert.equal(safeAdminReturnTo(unsafe, '/admin/logs/ai'), '/admin/logs/ai');
  }
});

test('Base URL AI chỉ gửi khóa tới allowlist riêng của đúng provider', () => {
  assert.equal(
    assertAllowedProviderBaseUrl('https://api.openai.com/v1', 'openai', {}),
    'https://api.openai.com/v1'
  );
  assert.equal(
    assertAllowedProviderBaseUrl(
      'https://integrate.api.nvidia.com/v1',
      'nvidia',
      {}
    ),
    'https://integrate.api.nvidia.com/v1'
  );

  const providerAllowlists = {
    AI_ALLOWED_OPENAI_BASE_URL_ORIGINS: 'https://openai-gateway.example',
    AI_ALLOWED_NVIDIA_BASE_URL_ORIGINS: 'https://nvidia-gateway.example',
    AI_ALLOWED_OPENROUTER_BASE_URL_ORIGINS: 'https://router-gateway.example'
  };
  assert.equal(
    assertAllowedProviderBaseUrl(
      'https://openai-gateway.example/v1',
      'openai',
      providerAllowlists
    ),
    'https://openai-gateway.example/v1'
  );
  assert.doesNotThrow(() => validateAllowedProviderOrigins(providerAllowlists));

  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (const [url, provider] of [
    ['https://openai-gateway.example/v1', 'nvidia'],
    ['https://nvidia-gateway.example/v1', 'openai'],
    ['https://api.openai.com/v1', 'openrouter'],
    ['https://openrouter.ai/api/v1', 'openai']
  ]) {
    assert.throws(
      () => assertAllowedProviderBaseUrl(url, provider, providerAllowlists),
      { code: 'OUTBOUND_URL_NOT_ALLOWED' }
    );
  }

  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (const unsafe of [
    'http://127.0.0.1:8080/v1',
    'https://127.0.0.1/v1',
    'https://169.254.169.254/latest',
    'https://evil.example/v1',
    'https://user:pass@api.openai.com/v1',
    'https://api.openai.com/v1#fragment'
  ]) {
    assert.throws(
      () => assertAllowedProviderBaseUrl(unsafe, 'openai', {}),
      { code: 'OUTBOUND_URL_NOT_ALLOWED' }
    );
  }

  assert.throws(
    () => validateAllowedProviderOrigins({
      AI_ALLOWED_OPENAI_BASE_URL_ORIGINS:
        'http://gateway.example,https://valid.example/path'
    }),
    { code: 'OUTBOUND_URL_NOT_ALLOWED' }
  );
});

test('allowlist Base URL dùng chung legacy bị từ chối để tránh rò khóa chéo provider', () => {
  const legacyEnv = {
    AI_ALLOWED_BASE_URL_ORIGINS: 'https://shared-gateway.example'
  };
  assert.throws(
    () => assertAllowedProviderBaseUrl(
      'https://api.openai.com/v1',
      'openai',
      legacyEnv
    ),
    { code: 'OUTBOUND_URL_NOT_ALLOWED' }
  );
  assert.throws(
    () => validateAllowedProviderOrigins(legacyEnv),
    { code: 'OUTBOUND_URL_NOT_ALLOWED' }
  );
});

test('trình kiểm tra upload nhận dạng bằng magic bytes, không tin tên hoặc MIME khai báo', async (t) => {
  const directory = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'math-upload-test-'));
  t.after(() => fsPromises.rm(directory, { recursive: true, force: true }));

  const fakeJpeg = path.join(directory, 'evil.html');
  const realPngWithWrongName = path.join(directory, 'image.html');
  await fsPromises.writeFile(fakeJpeg, '<script>alert(1)</script>');
  await fsPromises.writeFile(
    realPngWithWrongName,
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])
  );

  assert.equal(await detectImageType(fakeJpeg), null);
  assert.deepEqual(await detectImageType(realPngWithWrongName), {
    extension: 'png',
    mimeType: 'image/png'
  });
});

test('CSRF chặn request thiếu token/cross-site và CSP được bật', async (t) => {
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;

  const publicHome = await fetch(origin);
  assert.equal(publicHome.status, 200);
  assert.equal(publicHome.headers.get('cache-control'), 'private, no-store, max-age=0');

  const loginPage = await fetch(`${origin}/auth/login`);
  const html = await loginPage.text();
  const csrfToken = html.match(/name="_csrf" value="([^"]+)"/)?.[1];
  const sessionCookie = String(loginPage.headers.get('set-cookie') || '').split(';')[0];
  assert.ok(csrfToken);
  assert.ok(sessionCookie);
  const contentSecurityPolicy = loginPage.headers.get('content-security-policy') || '';
  assert.match(contentSecurityPolicy, /script-src 'self'/);
  assert.match(contentSecurityPolicy, /style-src 'self' 'unsafe-inline'/);
  assert.doesNotMatch(contentSecurityPolicy, /cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com/);
  assert.equal(
    loginPage.headers.get('permissions-policy'),
    'camera=(), geolocation=(), microphone=(), payment=(), usb=()'
  );
  assert.equal(loginPage.headers.get('cache-control'), 'private, no-store, max-age=0');

  for (const assetPath of [
    '/vendor/katex/katex.min.js',
    '/vendor/lucide/lucide.min.js',
    '/vendor/nunito/500.css'
  ]) {
    const assetResponse = await fetch(`${origin}${assetPath}`);
    assert.equal(assetResponse.status, 200, `${assetPath} phải được phục vụ nội bộ`);
  }

  const missingToken = await fetch(`${origin}/auth/login`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: sessionCookie
    },
    body: 'username=&password='
  });
  assert.equal(missingToken.status, 403);

  const crossSite = await fetch(`${origin}/auth/login`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: sessionCookie,
      Origin: 'https://evil.example'
    },
    body: new URLSearchParams({ _csrf: csrfToken, username: '', password: '' })
  });
  assert.equal(crossSite.status, 403);

  const opaqueLoopbackOrigin = await fetch(`${origin}/auth/login`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: sessionCookie,
      Origin: 'null'
    },
    body: new URLSearchParams({ _csrf: csrfToken, username: '', password: '' })
  });
  assert.equal(opaqueLoopbackOrigin.status, 302);

  const opaqueOriginMissingToken = await fetch(`${origin}/auth/login`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: sessionCookie,
      Origin: 'null'
    },
    body: new URLSearchParams({ username: '', password: '' })
  });
  assert.equal(opaqueOriginMissingToken.status, 403);

  const valid = await fetch(`${origin}/auth/login`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: sessionCookie
    },
    body: new URLSearchParams({ _csrf: csrfToken, username: '', password: '' })
  });
  assert.equal(valid.status, 302);

  const expiredAdminFetch = await fetch(`${origin}/admin/questions/1/edit`, {
    redirect: 'manual',
    headers: { 'X-Requested-With': 'fetch' }
  });
  assert.equal(expiredAdminFetch.status, 401);
  assert.equal(expiredAdminFetch.headers.get('x-auth-redirect'), '/auth/admin/login');
  assert.equal((await expiredAdminFetch.json()).code, 'SESSION_EXPIRED');

  const missingApi = await fetch(`${origin}/api/not-a-real-endpoint`, {
    headers: { Accept: 'application/json' }
  });
  assert.equal(missingApi.status, 404);
  assert.equal((await missingApi.json()).code, 'NOT_FOUND');
});

test('mọi form POST render phía server đều mang CSRF token', () => {
  const viewsRoot = path.join(__dirname, '..', 'views');
  const files = listFiles(viewsRoot, '.ejs');
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    const forms = source.match(/<form\b[\s\S]*?<\/form>/gi) || [];
    for (const form of forms) {
      if (!/\bmethod\s*=\s*["']post["']/i.test(form)) continue;
      assert.match(form, /name\s*=\s*["']_csrf["']/i, `${file} thiếu CSRF token`);
    }
  }
});

function listFiles(directory, extension) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    return entry.isDirectory()
      ? listFiles(absolutePath, extension)
      : absolutePath.endsWith(extension) ? [absolutePath] : [];
  });
}
