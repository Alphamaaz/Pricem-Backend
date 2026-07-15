import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const productUploadDir = path.join(__dirname, '../../public/uploads/products');

fs.mkdirSync(productUploadDir, { recursive: true });

const imageMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const productFormFields = [
  'title',
  'category',
  'price',
  'minPrice',
  'stock',
  'condition',
  'description',
  'deliveryCost',
  'deliveryOption',
  'estimatedDeliveryDays',
  'variants',
  'coverImage',
  'images',
];

const productImageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, productUploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = path.basename(file.originalname, ext)
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
    fileSize: 5 * 1024 * 1024,
    files: 11,
  },
  fileFilter: (_req, file, cb) => {
    if (!imageMimeTypes.has(file.mimetype)) {
      return cb(new Error('Only image files are allowed'));
    }

    cb(null, true);
  },
});

function getUploadErrorMessage(err) {
  if (err instanceof multer.MulterError) {
    const messages = {
      LIMIT_FILE_SIZE: 'Each image must be 5MB or smaller',
      LIMIT_FILE_COUNT: 'You can upload 1 cover image and up to 10 product images',
      LIMIT_UNEXPECTED_FILE: `Unexpected file field '${err.field}'. Use 'coverImage' for the main image and 'images' for gallery images`,
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
    { name: 'images', maxCount: 10 },
  ])(req, res, (err) => {
    if (!err) return next();

    return res.status(422).json({ message: getUploadErrorMessage(err) });
  });
}

export function attachUploadedProductImages(req, _res, next) {
  const coverImage = req.files?.coverImage?.[0];
  const images = req.files?.images || [];

  if (coverImage) {
    req.body.coverImage = {
      url: `/uploads/products/${coverImage.filename}`,
      publicId: coverImage.filename,
      alt: req.body.title,
    };
  }

  if (images.length > 0) {
    req.body.images = images.map((file) => ({
      url: `/uploads/products/${file.filename}`,
      publicId: file.filename,
      alt: req.body.title,
    }));
  }

  next();
}
