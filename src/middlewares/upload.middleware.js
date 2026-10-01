import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const productUploadDir = path.join(__dirname, '../../public/uploads/products');
const orderEvidenceUploadDir = path.join(__dirname, '../../public/uploads/order-evidence');

fs.mkdirSync(productUploadDir, { recursive: true });
fs.mkdirSync(orderEvidenceUploadDir, { recursive: true });

const imageMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);
const mediaMimeTypes = new Set([...imageMimeTypes, 'video/mp4']);
const MAX_FILE_SIZE = 15 * 1024 * 1024;
// The cover counts toward the product's combined maximum of eight media files.
const MAX_PRODUCT_MEDIA = 8;
const MAX_GALLERY_MEDIA = MAX_PRODUCT_MEDIA - 1;
const MAX_EVIDENCE_FILES = 10;

const productFormFields = [
  'title',
  'category',
  'price',
  'minPrice',
  'stock',
  'condition',
  'description',
  'deliveryMode',
  'estimatedDeliveryDays',
  'deliveryDetails',
  'variants',
  'coverImage',
  'images',
  'retainedMediaUrls',
  'retainedImageUrls',
];

const productImageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, productUploadDir);
  },
  filename: (_req, file, cb) => {
    const originalExt = path.extname(file.originalname).toLowerCase();
    const extensionByMimeType = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/gif': '.gif',
      'video/mp4': '.mp4',
    };
    const ext = extensionByMimeType[file.mimetype] || originalExt;
    const safeName = path.basename(file.originalname, originalExt)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'product';

    cb(null, `${Date.now()}-${safeName}${ext}`);
  },
});

const productImageUploader = multer({
  storage: productImageStorage,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: MAX_PRODUCT_MEDIA,
  },
  fileFilter: (_req, file, cb) => {
    if (file.fieldname === 'coverImage' && !imageMimeTypes.has(file.mimetype)) {
      return cb(new Error('The cover must be a JPEG, PNG, WebP, or GIF image'));
    }
    if (file.fieldname !== 'coverImage' && !mediaMimeTypes.has(file.mimetype)) {
      return cb(new Error('Listing media must be a JPEG, PNG, WebP, GIF, or MP4 file'));
    }

    cb(null, true);
  },
});

function getUploadErrorMessage(err) {
  if (err instanceof multer.MulterError) {
    const messages = {
      LIMIT_FILE_SIZE: 'Each photo or video must be 15 MB or smaller',
      LIMIT_FILE_COUNT: `A listing can contain at most ${MAX_PRODUCT_MEDIA} media files including its cover`,
      LIMIT_UNEXPECTED_FILE: `Unexpected file field '${err.field}'. Use 'coverImage' for the main image and 'media' for gallery photos/videos`,
      LIMIT_PART_COUNT: 'Too many form-data parts were sent',
      LIMIT_FIELD_KEY: 'A form-data field name is too long',
      LIMIT_FIELD_VALUE: 'A form-data field value is too long',
      LIMIT_FIELD_COUNT: 'Too many form-data fields were sent',
    };

    return messages[err.code] || err.message || 'Image upload failed';
  }

  if (err.message?.toLowerCase().includes('field name missing')) {
    return `One multipart form-data row has an empty field name. In Insomnia, check the left column for a blank name. Allowed field names are: ${productFormFields.join(', ')}`;
  }

  return err.message || 'Image upload failed';
}

export function uploadProductImages(req, res, next) {
  productImageUploader.fields([
    { name: 'coverImage', maxCount: 1 },
    { name: 'media', maxCount: MAX_GALLERY_MEDIA },
    // Temporary compatibility with older web clients.
    { name: 'images', maxCount: MAX_GALLERY_MEDIA },
  ])(req, res, (err) => {
    if (err) return res.status(422).json({ message: getUploadErrorMessage(err) });

    const files = Object.values(req.files || {}).flat();
    try {
      if (files.length > MAX_PRODUCT_MEDIA) throw new Error(`A listing can contain at most ${MAX_PRODUCT_MEDIA} media files including its cover`);
      for (const file of files) validateUploadedFile(file);
      return next();
    } catch (validationError) {
      for (const file of files) fs.rmSync(file.path, { force: true });
      return res.status(422).json({ message: validationError.message });
    }
  });
}

function hasImageSignature(buffer, mimeType) {
  if (mimeType === 'image/jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimeType === 'image/png') return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimeType === 'image/gif') return ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii'));
  if (mimeType === 'image/webp') return buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  return false;
}

function getMp4DurationSeconds(buffer) {
  if (buffer.subarray(4, 8).toString('ascii') !== 'ftyp') return null;
  const marker = buffer.indexOf(Buffer.from('mvhd'));
  if (marker < 0 || marker + 32 > buffer.length) return null;

  const version = buffer[marker + 4];
  const timescaleOffset = version === 1 ? marker + 24 : marker + 16;
  const durationOffset = version === 1 ? marker + 28 : marker + 20;
  if (durationOffset + (version === 1 ? 8 : 4) > buffer.length) return null;

  const timescale = buffer.readUInt32BE(timescaleOffset);
  if (!timescale) return null;
  const duration = version === 1
    ? Number(buffer.readBigUInt64BE(durationOffset))
    : buffer.readUInt32BE(durationOffset);
  return duration / timescale;
}

function validateUploadedFile(file) {
  const buffer = fs.readFileSync(file.path);
  if (imageMimeTypes.has(file.mimetype)) {
    if (!hasImageSignature(buffer, file.mimetype)) throw new Error(`'${file.originalname}' is not a valid image file`);
    return;
  }

  const durationSeconds = getMp4DurationSeconds(buffer);
  if (durationSeconds === null) throw new Error(`'${file.originalname}' is not a valid MP4 video`);
  if (durationSeconds > 20.05) throw new Error(`'${file.originalname}' is longer than the 20-second video limit`);
  file.durationSeconds = Math.round(durationSeconds * 100) / 100;
}

export function attachUploadedProductImages(req, _res, next) {
  const coverImage = req.files?.coverImage?.[0];
  const media = [...(req.files?.media || []), ...(req.files?.images || [])];

  if (coverImage) {
    req.body.coverImage = {
      url: `/uploads/products/${coverImage.filename}`,
      publicId: coverImage.filename,
      alt: req.body.title,
    };
  }

  if (media.length > 0) {
    req.body.media = media.map((file) => ({
      type: file.mimetype === 'video/mp4' ? 'video' : 'image',
      url: `/uploads/products/${file.filename}`,
      publicId: file.filename,
      alt: req.body.title,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      ...(file.durationSeconds !== undefined ? { durationSeconds: file.durationSeconds } : {}),
    }));
  }

  next();
}

const evidenceUploader = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, orderEvidenceUploadDir),
    filename: (_req, file, cb) => {
      const ext = file.mimetype === 'image/png' ? '.png' : file.mimetype === 'image/webp' ? '.webp' : '.jpg';
      cb(null, `${Date.now()}-${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_EVIDENCE_FILES },
  fileFilter: (_req, file, cb) => {
    if (!imageMimeTypes.has(file.mimetype)) return cb(new Error('Evidence must be a JPEG, PNG, WebP, or GIF image'));
    cb(null, true);
  },
});

export function uploadOrderEvidence(req, res, next) {
  evidenceUploader.array('evidence', MAX_EVIDENCE_FILES)(req, res, (err) => {
    if (err) return res.status(422).json({ message: getUploadErrorMessage(err) });
    try {
      for (const file of req.files || []) validateUploadedFile(file);
      req.body.evidenceUrls = (req.files || []).map((file) => `/uploads/order-evidence/${file.filename}`);
      next();
    } catch (validationError) {
      for (const file of req.files || []) fs.rmSync(file.path, { force: true });
      res.status(422).json({ message: validationError.message });
    }
  });
}
