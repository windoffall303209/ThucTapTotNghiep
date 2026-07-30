const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.AUTH_RATE_LIMIT = '3';

const app = require('../app');

test('giới hạn đăng nhập đếm cả các phản hồi redirect khi sai thông tin', async (t) => {
  const server = app.listen(0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();

  const statuses = [];
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`http://127.0.0.1:${port}/auth/login`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'username=&password='
    });
    statuses.push(response.status);
  }

  assert.deepEqual(statuses, [302, 302, 302, 429]);
});
