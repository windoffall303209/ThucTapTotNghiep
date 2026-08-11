const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const sharp = require('sharp');

const {
  CONTENT_LIMITS,
  isPositiveInteger,
  normalizeSearchKeyword,
  validateSortOrder,
  validateTextLength
} = require('../utils/contentValidation');
const { normalizeGridLayout } = require('../utils/gridLayout');
const { optimizeUploadedImage } = require('../middleware/upload');
const { _test: providerTest } = require('../services/ProviderCheckService');

test('validation nội dung giới hạn độ dài, thứ tự và id dương ở phía server', () => {
  assert.equal(validateTextLength('a'.repeat(255), 'Tên chương', 255), null);
  assert.match(validateTextLength('a'.repeat(256), 'Tên chương', 255), /255/);
  assert.equal(validateSortOrder('1'), null);
  assert.equal(validateSortOrder(String(CONTENT_LIMITS.sortOrder)), null);
  assert.match(validateSortOrder('1.5'), /số nguyên/);
  assert.match(validateSortOrder('1000001'), /1\.000\.000/);
  assert.equal(isPositiveInteger('12'), true);
  assert.equal(isPositiveInteger('-1'), false);
  assert.equal(normalizeSearchKeyword(`  ${'x'.repeat(250)}  `).length, 200);
});

test('grid layout chặn dữ liệu phình và URL ảnh không an toàn', () => {
  const cells = Array.from({ length: 50 }, (_, index) => ({
    id: `cell-${index}`,
    row: 1,
    col: 1,
    type: 'image',
    image_url: index === 0 ? 'javascript:alert(1)' : 'https://images.example/test.png',
    text: 'x'.repeat(11_000),
    background: index === 1 ? '#abcdef' : 'url(evil)'
  }));
  const grid = normalizeGridLayout({ enabled: true, rows: 2, columns: 3, cells });

  assert.equal(grid.cells.length, 6);
  assert.equal(grid.cells[0].image_url, '');
  assert.equal(grid.cells[1].image_url, 'https://images.example/test.png');
  assert.equal(grid.cells[0].text.length, 10_000);
  assert.equal(grid.cells[0].background, '');
  assert.equal(grid.cells[1].background, '#abcdef');
});

test('ảnh tĩnh upload được xoay, thu nhỏ và chuyển sang WebP', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'optimized-upload-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, 'sample.upload');
  const source = await sharp({
    create: { width: 2400, height: 1200, channels: 3, background: '#336699' }
  }).jpeg({ quality: 95 }).toBuffer();
  await fs.writeFile(filePath, source);
  const file = { path: filePath, originalname: 'sample.jpg', size: (await fs.stat(filePath)).size };

  const result = await optimizeUploadedImage(file, { extension: 'jpg', mimeType: 'image/jpeg' });
  const metadata = await sharp(await fs.readFile(filePath)).metadata();

  assert.deepEqual(result, { extension: 'webp', mimeType: 'image/webp' });
  assert.equal(metadata.format, 'webp');
  assert.equal(metadata.width, 1920);
  assert.equal(metadata.height, 960);
  assert.equal(file.size, (await fs.stat(filePath)).size);
});

test('provider JSON reader dừng response vượt giới hạn thay vì giữ hết trong RAM', async (t) => {
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ payload: 'x'.repeat(1024) }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();

  await assert.rejects(
    providerTest.requestJson(`http://127.0.0.1:${port}`, { maxResponseBytes: 64 }),
    { code: 'PROVIDER_RESPONSE_TOO_LARGE' }
  );
  assert.equal(providerTest.MAX_PROVIDER_RESPONSE_BYTES, 2 * 1024 * 1024);
});
