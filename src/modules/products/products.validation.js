import { z } from 'zod';

const imageUrlSchema = z.string().trim().refine((value) => {
  if (value.startsWith('/uploads/')) return true;

  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}, 'Image URL must be a valid URL or local upload path');

const imageSchema = z.object({
  url: imageUrlSchema,
  publicId: z.string().trim().optional(),
  alt: z.string().trim().optional(),
});

const mediaSchema = z.object({
  type: z.enum(['image', 'video']),
  url: imageUrlSchema,
  publicId: z.string().trim().optional(),
  alt: z.string().trim().optional(),
  mimeType: z.string().trim().min(1),
  sizeBytes: z.coerce.number().int().min(0).max(15 * 1024 * 1024),
  durationSeconds: z.coerce.number().min(0).max(20).optional(),
}).superRefine((media, ctx) => {
  if (media.type === 'video' && media.durationSeconds === undefined) {
    ctx.addIssue({ code: 'custom', path: ['durationSeconds'], message: 'Video duration is required' });
  }
});

const booleanQuerySchema = z.preprocess((value) => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}, z.boolean());

const variantOptionSchema = z.object({
  value: z.string().trim().min(1, 'Variant option value is required'),
  price: z.coerce.number().min(0, 'Variant option price cannot be negative'),
  minPrice: z.coerce.number().min(0, 'Variant option minimum price cannot be negative').optional(),
  stock: z.coerce.number().int().min(0, 'Variant option stock cannot be negative').default(0),
  sku: z.string().trim().optional(),
}).refine((data) => data.minPrice === undefined || data.minPrice <= data.price, {
  message: 'Variant option minimum price cannot be greater than option price',
  path: ['minPrice'],
});

const variantSchema = z.object({
  name: z.string().trim().min(1, 'Variant name is required'),
  options: z.array(variantOptionSchema).min(1, 'A variant must have at least one option'),
});

const variantsSchema = z.preprocess((value) => {
  if (typeof value !== 'string') return value;
  if (!value.trim()) return undefined;

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}, z.array(variantSchema).max(5, 'A product can have at most 5 variant groups').optional());

const retainedUrlsSchema = z.preprocess((value) => {
  if (typeof value !== 'string') return value;

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}, z.array(imageUrlSchema).max(7).optional());

const productFieldsSchema = z.object({
  title: z.string().trim().min(1, 'Listing title is required'),
  category: z.string().trim().toLowerCase().min(1, 'Category is required'),
  price: z.coerce.number().min(0, 'Price cannot be negative').optional(),
  minPrice: z.coerce.number().min(0, 'Minimum price cannot be negative').optional(),
  stock: z.coerce.number().int().min(0, 'Stock cannot be negative').optional(),
  condition: z.enum(['new', 'used'], { message: 'Condition must be new or used' }),
  brand: z.string().trim().max(100).optional(),
  warranty: z.string().trim().max(100).optional(),
  negotiable: z.preprocess((v) => v === 'true' || v === true, z.boolean()).optional(),
  contactPhone: z.string().trim().max(30).optional(),
  state: z.string().trim().max(100).optional(),
  city: z.string().trim().max(100).optional(),
  addressNote: z.string().trim().max(250).optional(),
  description: z.string().trim().min(1, 'Description is required'),
  variants: variantsSchema,
  coverImage: imageSchema,
  images: z.array(imageSchema).optional(),
  media: z.array(mediaSchema).max(7, 'Add at most 7 gallery files; the cover makes 8 total').optional(),
  retainedMediaUrls: retainedUrlsSchema,
  retainedImageUrls: retainedUrlsSchema,
  deliveryMode: z.enum(['seller_included', 'buyer_pays_externally']),
  estimatedDeliveryDays: z.string().trim().max(100).optional(),
  deliveryDetails: z.string().trim().max(500).optional(),
});

export const createProductSchema = productFieldsSchema.superRefine((data, ctx) => {
  const hasVariants = Array.isArray(data.variants) && data.variants.length > 0;

  if (!hasVariants && data.price === undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['price'],
      message: 'Price is required when product has no variants',
    });
  }

  if (!hasVariants && data.stock === undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['stock'],
      message: 'Stock is required when product has no variants',
    });
  }
}).refine((data) => {
  const hasVariants = Array.isArray(data.variants) && data.variants.length > 0;
  return hasVariants || data.price === undefined || data.minPrice === undefined || data.minPrice <= data.price;
}, {
  message: 'Minimum price cannot be greater than price',
  path: ['minPrice'],
});

export const updateProductSchema = productFieldsSchema.partial().extend({
  status: z.enum(['active', 'inactive', 'sold']).optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: 'At least one field is required',
}).refine((data) => (
  data.price === undefined ||
  data.minPrice === undefined ||
  data.minPrice <= data.price
), {
  message: 'Minimum price cannot be greater than listing price',
  path: ['minPrice'],
});

export const listProductsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  category: z.string().trim().toLowerCase().optional(),
  condition: z.enum(['new', 'used']).optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  search: z.string().trim().optional(),
  storeSlug: z.string().trim().toLowerCase().optional(),
  inStock: booleanQuerySchema.optional(),
  state: z.string().trim().optional(),
  negotiable: booleanQuerySchema.optional(),
  sort: z.enum(['featured', 'newest', 'price_asc', 'price_desc', 'popular', 'rating']).default('featured'),
}).refine((data) => (
  data.minPrice === undefined ||
  data.maxPrice === undefined ||
  data.minPrice <= data.maxPrice
), {
  message: 'minPrice cannot be greater than maxPrice',
  path: ['minPrice'],
});
