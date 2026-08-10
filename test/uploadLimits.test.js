// B? ki?m th? upload limits.test x?c minh h?nh vi v? c?c ?i?u ki?n bi?n quan tr?ng c?a h? th?ng.
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const http = require('node:http');
const test = require('node:test');
const express = require('express');
const {
  MAX_MULTIPART_FIELD_SIZE_BYTES,
  MAX_MULTIPART_FIELDS,
  limitMultipartRequest,
  questionImageUpload
} = require('../middleware/upload');

test('multipart vượt Content-Length bị từ chối trước khi Multer chạy', async () => {
  const req = createRequest({
    'content-type': 'multipart/form-data; boundary=test',
    'content-length': '101'
  });
  let uploadStarted = false;
  const middleware = limitMultipartRequest((request, response, next) => {
    uploadStarted = true;
    next();
  }, 100);

  const error = await invokeMiddleware(middleware, req);

  assert.equal(uploadStarted, false);
  assert.equal(req.resumed, true);
  assert.equal(error?.code, 'UPLOAD_REQUEST_TOO_LARGE');
  assert.equal(error?.status, 413);
});

test('multipart chunked bị dừng theo tổng byte stream và chuyển lỗi qua Multer để cleanup', async () => {
  const req = createRequest({
    'content-type': 'multipart/form-data; boundary=test'
  });
  let uploadStarted = false;
  // H?m uploadMiddleware d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  const uploadMiddleware = (request, response, next) => {
    uploadStarted = true;
    request.once('error', next);
    request.once('end', () => next());
  };
  const resultPromise = invokeMiddleware(limitMultipartRequest(uploadMiddleware, 10), req);

  req.emit('data', Buffer.alloc(6));
  req.emit('data', Buffer.alloc(5));
  const error = await resultPromise;

  assert.equal(uploadStarted, true);
  assert.equal(error?.code, 'UPLOAD_REQUEST_TOO_LARGE');
  assert.equal(error?.status, 413);
});

test('multipart trong giới hạn đi qua bình thường', async () => {
  const req = createRequest({
    'content-type': 'multipart/form-data; boundary=test'
  });
  // H?m uploadMiddleware d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  const uploadMiddleware = (request, response, next) => {
    request.once('error', next);
    request.once('end', () => next());
  };
  const resultPromise = invokeMiddleware(limitMultipartRequest(uploadMiddleware, 10), req);

  req.emit('data', Buffer.alloc(4));
  req.emit('data', Buffer.alloc(6));
  req.emit('end');

  assert.equal(await resultPromise, undefined);
});

test('giới hạn field vẫn đủ form quản trị thực tế và chặn request phình bất thường', async (t) => {
  const app = express();
  app.post('/upload', questionImageUpload.any(), (req, res) => {
    res.json({ fieldCount: Object.keys(req.body || {}).length });
  });
  app.use((error, req, res, next) => {
    res.status(error.status || 400).json({ code: error.code });
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  const endpoint = `http://127.0.0.1:${address.port}/upload`;

  const compatibleForm = new FormData();
  // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
  for (let index = 0; index < 96; index += 1) {
    compatibleForm.append(`field_${index}`, 'x');
  }
  const accepted = await fetch(endpoint, { method: 'POST', body: compatibleForm });
  assert.equal(accepted.status, 200);
  assert.deepEqual(await accepted.json(), { fieldCount: 96 });

  const oversizedForm = new FormData();
  // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
  for (let index = 0; index <= MAX_MULTIPART_FIELDS; index += 1) {
    oversizedForm.append(`field_${index}`, 'x');
  }
  const rejected = await fetch(endpoint, { method: 'POST', body: oversizedForm });
  assert.equal(rejected.status, 400);
  assert.deepEqual(await rejected.json(), { code: 'LIMIT_FIELD_COUNT' });

  const oversizedFieldForm = new FormData();
  oversizedFieldForm.append('content_text', 'x'.repeat(MAX_MULTIPART_FIELD_SIZE_BYTES + 1));
  const oversizedField = await fetch(endpoint, { method: 'POST', body: oversizedFieldForm });
  assert.equal(oversizedField.status, 400);
  assert.deepEqual(await oversizedField.json(), { code: 'LIMIT_FIELD_VALUE' });
});

// H?m createRequest d?ng ?? t?o b?n ghi ho?c t?i nguy?n m?i sau khi ki?m tra ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function createRequest(headers) {
  const req = new EventEmitter();
  req.headers = headers;
  req.get = (name) => headers[String(name).toLowerCase()];
  req.resume = () => {
    req.resumed = true;
  };
  return req;
}

// H?m invokeMiddleware d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function invokeMiddleware(middleware, req) {
  return new Promise((resolve) => {
    middleware(req, {}, (error) => resolve(error));
  });
}
