// Bộ kiểm thử image lifecycle.test xác minh hành vi và các điều kiện biên quan trọng của hệ thống.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsPromises = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  buildReferenceQuery,
  collectImageDescriptors,
  deleteStoredImagesIfUnreferenced,
  differenceImageDescriptors,
  isStoredImageReferenced,
  resolveLocalImagePath
} = require('../services/ImageStorageService');
const {
  cleanupRequestUploads,
  cleanupRequestUploadsWithRetry,
  commitRequestUploads
} = require('../middleware/upload');

test('thu thập và so sánh descriptor ảnh ở mọi vùng nội dung', () => {
  const local = {
    url: '/uploads/images/1711111111111-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png',
    storage_provider: 'local',
    public_id: null,
    cloud_name: null
  };
  const cloud = {
    url: 'https://res.cloudinary.com/demo/image/upload/v1/question.png',
    storage_provider: 'cloudinary',
    public_id: 'math-revision/questions/question',
    cloud_name: 'demo'
  };
  const before = {
    content: { images: [local] },
    choices: [{ images: [cloud, local] }]
  };
  const after = {
    explanation: { images: [{ ...cloud, url: 'https://cdn.example/new-url.png' }] }
  };

  assert.deepEqual(collectImageDescriptors(before), [local, cloud]);
  assert.deepEqual(differenceImageDescriptors(before, after), [local]);
});

test('truy vấn tham chiếu bao phủ câu hỏi, lý thuyết và snapshot phiên làm bài', async () => {
  const image = {
    url: '/uploads/images/name_with_percent%.png',
    storage_provider: 'local'
  };
  const referenceQuery = buildReferenceQuery(image);
  assert.match(referenceQuery.sql, /QuestionBank/);
  assert.match(referenceQuery.sql, /Lessons/);
  assert.match(referenceQuery.sql, /PracticeSessionQuestions/);
  assert.equal(referenceQuery.params.length, 5);
  assert(referenceQuery.params.every((value) => value === '/uploads/images/name\\_with\\_percent\\%.png'));
  const lockingQuery = buildReferenceQuery(image, { lock: true });
  assert.equal((lockingQuery.sql.match(/FOR SHARE/g) || []).length, 3);

  let receivedQuery = null;
  const referenced = await isStoredImageReferenced(image, {
    query: async (sql, params) => {
      receivedQuery = { sql, params };
      return [{ is_referenced: 1 }];
    }
  });
  assert.equal(referenced, true);
  assert.deepEqual(receivedQuery, referenceQuery);
});

test('chỉ ánh xạ URL ảnh local an toàn vào đúng thư mục quản lý', () => {
  const root = path.join(os.tmpdir(), 'managed-image-root');
  const safe = resolveLocalImagePath({
    url: '/uploads/images/1711111111111-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.webp',
    storage_provider: 'local'
  }, root);
  assert.equal(
    safe,
    path.join(root, '1711111111111-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.webp')
  );

  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (const unsafe of [
    '/uploads/images/../secret.png',
    '/uploads/images/%2e%2e%2fsecret.png',
    '/uploads/images/safe.png?download=1',
    'https://attacker.example/uploads/images/safe.png',
    '/other/safe.png'
  ]) {
    assert.equal(resolveLocalImagePath({ url: unsafe, storage_provider: 'local' }, root), null);
  }
});

test('chỉ xóa ảnh local không còn tham chiếu và giữ lại khi kiểm tra thất bại', async (t) => {
  const root = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'image-lifecycle-'));
  t.after(() => fsPromises.rm(root, { recursive: true, force: true }));
  const removableName = '1711111111111-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png';
  const retainedName = '1711111111112-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.png';
  await fsPromises.writeFile(path.join(root, removableName), 'remove');
  await fsPromises.writeFile(path.join(root, retainedName), 'retain');

  const deleted = await deleteStoredImagesIfUnreferenced(
    [{ url: `/uploads/images/${removableName}`, storage_provider: 'local' }],
    {
      publicImageDir: root,
      isReferenced: async () => false,
      logger: { warn() {} }
    }
  );
  assert.equal(deleted[0].deleted, true);
  assert.equal(fs.existsSync(path.join(root, removableName)), false);

  const retained = await deleteStoredImagesIfUnreferenced(
    [{ url: `/uploads/images/${retainedName}`, storage_provider: 'local' }],
    {
      publicImageDir: root,
      isReferenced: async () => {
        throw new Error('database unavailable');
      },
      logger: { warn() {} }
    }
  );
  assert.equal(retained[0].reason, 'reference_check_failed');
  assert.equal(fs.existsSync(path.join(root, retainedName)), true);
});

test('chỉ xóa Cloudinary object thuộc đúng folder và đúng cloud account', async () => {
  const destroyed = [];
  const cloudinaryClient = {
    // Hàm config dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
    config() {},
    uploader: {
      // Hàm destroy dùng để xóa hoặc giải phóng tài nguyên theo điều kiện an toàn; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
      async destroy(publicId) {
        destroyed.push(publicId);
      }
    }
  };
  const dependencies = {
    isReferenced: async () => false,
    getSettings: async () => ({
      cloudinary_cloud_name: 'current-cloud',
      cloudinary_api_key: 'key',
      cloudinary_api_secret: 'secret'
    }),
    cloudinaryClient,
    logger: { warn() {} }
  };

  const results = await deleteStoredImagesIfUnreferenced([
    {
      url: 'https://res.cloudinary.com/current-cloud/image/upload/v1/logo.png',
      storage_provider: 'cloudinary',
      public_id: 'unrelated/backups/logo',
      cloud_name: 'current-cloud'
    },
    {
      url: 'https://res.cloudinary.com/old-cloud/image/upload/v1/photo.png',
      storage_provider: 'cloudinary',
      public_id: 'math-revision/questions/photo',
      cloud_name: 'old-cloud'
    },
    {
      url: 'https://res.cloudinary.com/current-cloud/image/upload/v1/photo.png',
      storage_provider: 'cloudinary',
      public_id: 'math-revision/questions/photo',
      cloud_name: 'current-cloud'
    }
  ], dependencies);

  assert.deepEqual(results.map((result) => result.reason || result.provider), [
    'unmanaged_image',
    'cloudinary_account_mismatch',
    'cloudinary'
  ]);
  assert.deepEqual(destroyed, ['math-revision/questions/photo']);
});

test('commit upload chỉ giữ file đã thực sự được đưa vào payload', async (t) => {
  const root = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'upload-commit-'));
  t.after(() => fsPromises.rm(root, { recursive: true, force: true }));
  const usedPath = path.join(root, 'used.png');
  const unusedPath = path.join(root, 'unused.png');
  await Promise.all([
    fsPromises.writeFile(usedPath, 'used'),
    fsPromises.writeFile(unusedPath, 'unused')
  ]);

  const req = {
    files: {
      question_images: [
        { path: usedPath, readyToCommit: true },
        { path: unusedPath }
      ]
    }
  };
  commitRequestUploads(req);
  await cleanupRequestUploads(req);
  await cleanupRequestUploads(req);

  assert.equal(fs.existsSync(usedPath), true);
  assert.equal(fs.existsSync(unusedPath), false);
});

test('cleanup retry lỗi tạm thời và không xóa Cloudinary đã commit', async () => {
  let unlinkAttempts = 0;
  const retryFile = { path: 'temporary.png' };
  await cleanupRequestUploadsWithRetry(
    { files: [retryFile] },
    {
      attempts: 2,
      retryDelayMs: 0,
      unlink: async () => {
        unlinkAttempts += 1;
        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
        if (unlinkAttempts === 1) {
          const error = new Error('busy');
          error.code = 'EBUSY';
          throw error;
        }
      }
    }
  );
  assert.equal(unlinkAttempts, 2);
  assert.equal(retryFile.uploadCleanupComplete, true);

  let destroyAttempts = 0;
  let pendingLocalAttempts = 0;
  const committedCloudFile = {
    path: 'leftover-local.png',
    cloudinaryPublicId: 'math-revision/questions/committed',
    cloudinaryLocalCleanupPending: true,
    uploadCommitted: true
  };
  await cleanupRequestUploads(
    { files: [committedCloudFile] },
    {
      destroyCloudinary: async () => {
        destroyAttempts += 1;
      },
      unlink: async () => {
        pendingLocalAttempts += 1;
      }
    }
  );
  assert.equal(destroyAttempts, 0);
  assert.equal(pendingLocalAttempts, 1);
  assert.equal(committedCloudFile.uploadCleanupComplete, true);
});

test('controller dọn ảnh khi thay nội dung nhưng giữ ảnh của câu hỏi lưu trữ mềm', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'controllers', 'AdminController.js'),
    'utf8'
  );
  assert.match(source, /differenceImageDescriptors\(question, payload\)/);
  assert.match(source, /differenceImageDescriptors\(lesson\.theory_cards, savedCards\)/);
  assert.match(source, /deleteStoredImagesIfUnreferenced\(deletion\.theoryCards\)/);
  const theoryBuilder = source.slice(
    source.indexOf('async function buildSingleTheoryCard'),
    source.indexOf('function hasTheoryCardContent')
  );
  assert.match(theoryBuilder, /existingCard\?\.images/);
  assert.doesNotMatch(theoryBuilder, /body\.existing_images/);
  assert.match(source, /cloud_name:\s*storedImage\.cloud_name/);
  assert.doesNotMatch(
    source.slice(source.indexOf('async function deleteQuestion'), source.indexOf('async function duplicateQuestion')),
    /deleteStoredImagesIfUnreferenced/
  );
});
