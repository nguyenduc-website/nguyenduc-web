'use strict';
const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { z } = require('zod');
const { randomBytes } = require('crypto');
const { requireAuth, requireCsrf, requireRole } = require('../middleware/auth');
const { requireAntibot } = require('../middleware/antibot');
const { validate } = require('../middleware/validate');
const { uploadLimiter } = require('../middleware/security');
const mediaSvc = require('../services/media.service');
const ranking = require('../services/ranking.service');
const { audit } = require('../services/audit.service');

const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_IMAGE = new Set(['image/jpeg','image/png','image/webp','image/gif']);
const ALLOWED_FILE = new Set([
  'application/zip','application/x-zip-compressed','application/pdf',
  'application/octet-stream','text/plain',
  'application/x-rar-compressed','application/vnd.rar',
  'application/x-7z-compressed',
]);
const MAX_IMG = 5 * 1024 * 1024;
const MAX_FILE = 200 * 1024 * 1024;

const storage = multer.diskStorage({
  destination: (_req, _f, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '').slice(0, 8);
    cb(null, randomBytes(16).toString('hex') + ext);
  },
});

function fileFilter(_req, file, cb) {
  const isImage = file.fieldname === 'image';
  const allowed = isImage ? ALLOWED_IMAGE : ALLOWED_FILE;
  if (!allowed.has(file.mimetype)) {
    return cb(Object.assign(new Error('Định dạng không được phép'), { status: 400, code: 'BAD_MIME' }));
  }
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE, files: 2 },
});

const fields = upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'file', maxCount: 1 },
]);

// Public list
router.get('/list', (req, res) => {
  const pkg = ['FREE','BASIC','PREMIUM'].includes(req.query.package) ? req.query.package : 'FREE';
  const limit = Math.min(parseInt(req.query.limit || '50', 10), 100);
  const offset = Math.max(parseInt(req.query.offset || '0', 10), 0);
  res.json({ success: true, data: mediaSvc.listByPackage(pkg, limit, offset) });
});

// Download / access
router.get('/:id/access', requireAuth, requireAntibot, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ success: false, error: { code: 'BAD_ID', message: 'ID không hợp lệ' } });
  const r = mediaSvc.hasAccess(req.user, id);
  if (!r.ok) {
    return res.status(403).json({ success: false, error: { code: r.reason, message: 'Không đủ quyền truy cập' } });
  }
  mediaSvc.incrementDownload(id);
  ranking.touch(req.user.id, 1, 1);
  audit(req, 'media.access', 'media', id);
  const m = r.media;
  const url = m.file_url || (m.file_path ? `/media/file/${id}` : null);
  res.json({ success: true, data: { url, name: m.name, version: m.version } });
});

router.get('/file/:id', requireAuth, requireAntibot, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const r = mediaSvc.hasAccess(req.user, id);
  if (!r.ok) return res.status(403).json({ success: false, error: { code: r.reason, message: 'Không đủ quyền' } });
  const m = r.media;
  if (!m.file_path) return res.status(404).json({ success: false, error: { code: 'NO_FILE', message: 'Không có file' } });
  const abs = path.resolve(m.file_path);
  const allowed = path.resolve(process.cwd(), 'uploads');
  if (!abs.startsWith(allowed)) return res.status(403).end();
  res.download(abs, m.name);
});

// Create (ADMIN/MODERATOR)
const createSchema = z.object({
  name: z.string().min(1).max(120),
  version: z.string().min(1).max(20).default('1.0'),
  package: z.enum(['FREE','BASIC','PREMIUM']),
  description: z.string().max(2000).optional().default(''),
  price: z.coerce.number().int().min(0).max(100_000_000).default(0),
  imageUrl: z.string().url().max(500).optional().or(z.literal('')),
  fileUrl: z.string().url().max(500).optional().or(z.literal('')),
});

router.post('/create',
  requireRole('ADMIN','MODERATOR'),
  requireCsrf,
  requireAntibot,
  uploadLimiter,
  fields,
  (req, res, next) => {
    try {
      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } });
      }
      const data = parsed.data;
      const imageFile = req.files?.image?.[0];
      const fileFile = req.files?.file?.[0];

      const imagePath = imageFile ? imageFile.path : null;
      const imageUrl = data.imageUrl || null;
      const filePath = fileFile ? fileFile.path : null;
      const fileUrl = data.fileUrl || null;

      if (!imagePath && !imageUrl) {
        if (imageFile) mediaSvc.safeUnlink(imageFile.path);
        if (fileFile) mediaSvc.safeUnlink(fileFile.path);
        return res.status(400).json({ success: false, error: { code: 'NO_IMAGE', message: 'Cần ảnh hoặc URL ảnh' } });
      }
      if (!filePath && !fileUrl) {
        if (imageFile) mediaSvc.safeUnlink(imageFile.path);
        if (fileFile) mediaSvc.safeUnlink(fileFile.path);
        return res.status(400).json({ success: false, error: { code: 'NO_FILE', message: 'Cần file hoặc URL file' } });
      }

      const id = mediaSvc.create({
        name: data.name,
        version: data.version,
        package: data.package,
        description: data.description,
        price: data.price,
        imagePath, imageUrl, filePath, fileUrl,
      }, req.user.id);
      audit(req, 'media.create', 'media', id, { name: data.name, package: data.package });
      res.status(201).json({ success: true, data: { id }, message: 'Đã tạo Media' });
    } catch (e) { next(e); }
  }
);

// Rating cho media
router.post('/:id/rate',
  requireAuth, requireCsrf, requireAntibot,
  (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      const rating = parseInt(req.body?.rating, 10);
      const comment = typeof req.body?.comment === 'string' ? req.body.comment.slice(0, 500) : null;
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return res.status(400).json({ success: false, error: { code: 'BAD_RATING', message: 'Rating 1-5' } });
      }
      const ratingSvc = require('../services/rating.service');
      ratingSvc.upsert(req.user.id, 'media', id, rating, comment);
      res.json({ success: true, message: 'Đã đánh giá' });
    } catch (e) { next(e); }
  }
);

module.exports = router;