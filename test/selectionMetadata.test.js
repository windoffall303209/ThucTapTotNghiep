const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { normalizeSelectionAudit } = require('../models/PracticeSession');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('metadata lựa chọn đề chỉ nhận phiên bản, seed và object hợp lệ', () => {
  assert.deepEqual(normalizeSelectionAudit({
    version: 'balanced-v2',
    seed: 'A1B2C3D4E5F60708',
    metadata: { requested: 20 }
  }), {
    version: 'balanced-v2',
    seed: 'a1b2c3d4e5f60708',
    metadata: { requested: 20 }
  });
  assert.deepEqual(normalizeSelectionAudit({ seed: 'khong-hop-le', metadata: [] }), {
    version: null,
    seed: null,
    metadata: {}
  });
});

test('schema và migration có đủ metadata, mặc định migration chỉ preflight', () => {
  const schema = read('database/database_schema.sql');
  const migration = read('scripts/apply_selection_metadata.js');
  const packageJson = JSON.parse(read('package.json'));

  assert.match(schema, /selection_version VARCHAR\(32\) NULL/);
  assert.match(schema, /selection_seed CHAR\(16\) NULL/);
  assert.match(schema, /selection_metadata JSON NULL/);
  assert.match(migration, /if \(!args\.includes\(APPLY_FLAG\)\)/);
  assert.match(migration, /ALTER TABLE PracticeSessions ADD COLUMN/);
  assert.equal(
    packageJson.scripts['db:selection-metadata'],
    'node scripts/apply_selection_metadata.js'
  );
});
