import { Category, DEFAULT_CATEGORIES } from './category.model.js';
import Product from '../products/product.model.js';

function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

/**
 * Public: List active categories for navigation and filters.
 * Seeds default categories if collection is empty.
 */
export async function listCategories(_req, res, next) {
  try {
    let categories = await Category.find({ isActive: true }).sort({ order: 1, name: 1 });

    if (categories.length === 0) {
      try {
        await Category.insertMany(DEFAULT_CATEGORIES, { ordered: false });
        categories = await Category.find({ isActive: true }).sort({ order: 1, name: 1 });
      } catch (seedErr) {
        console.error('Category auto-seed notice:', seedErr.message);
        categories = await Category.find({ isActive: true }).sort({ order: 1, name: 1 });
      }
    }

    return res.json({ categories });
  } catch (error) {
    return next(error);
  }
}

/**
 * Admin: List all categories with product counts.
 */
export async function adminListCategories(_req, res, next) {
  try {
    let categories = await Category.find().sort({ order: 1, createdAt: -1 });

    if (categories.length === 0) {
      try {
        await Category.insertMany(DEFAULT_CATEGORIES, { ordered: false });
        categories = await Category.find().sort({ order: 1, createdAt: -1 });
      } catch (seedErr) {
        console.error('Category auto-seed notice:', seedErr.message);
        categories = await Category.find().sort({ order: 1, createdAt: -1 });
      }
    }

    // Count products per category
    const counts = await Product.aggregate([
      { $group: { _id: { $toLower: '$category' }, count: { $sum: 1 } } },
    ]);
    const countsMap = new Map(counts.map((c) => [c._id, c.count]));

    const categoriesWithCount = categories.map((cat) => {
      const obj = cat.toObject();
      const slugCount = countsMap.get(cat.slug) || 0;
      const nameCount = countsMap.get(cat.name.toLowerCase()) || 0;
      obj.productCount = Math.max(slugCount, nameCount);
      return obj;
    });

    return res.json({ categories: categoriesWithCount });
  } catch (error) {
    return next(error);
  }
}

/**
 * Admin: Create a new dynamic category.
 */
export async function createCategory(req, res, next) {
  try {
    const { name, icon, description, order, isActive } = req.body;
    let { slug } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Category name is required' });
    }

    slug = slug && slug.trim() ? slugify(slug) : slugify(name);

    const existing = await Category.findOne({ slug });
    if (existing) {
      return res.status(400).json({ message: `A category with slug '${slug}' already exists` });
    }

    const category = await Category.create({
      name: name.trim(),
      slug,
      icon: icon && icon.trim() ? icon.trim() : 'Package',
      description: description ? description.trim() : '',
      order: typeof order === 'number' ? order : 0,
      isActive: isActive !== undefined ? Boolean(isActive) : true,
    });

    return res.status(201).json({ message: 'Category created successfully', category });
  } catch (error) {
    return next(error);
  }
}

/**
 * Admin: Update an existing category.
 */
export async function updateCategory(req, res, next) {
  try {
    const { id } = req.params;
    const { name, icon, description, order, isActive, slug } = req.body;

    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    if (name && name.trim()) category.name = name.trim();
    if (icon !== undefined) category.icon = icon ? icon.trim() : 'Package';
    if (description !== undefined) category.description = description ? description.trim() : '';
    if (order !== undefined) category.order = Number(order) || 0;
    if (isActive !== undefined) category.isActive = Boolean(isActive);

    if (slug && slug.trim()) {
      const formattedSlug = slugify(slug);
      if (formattedSlug !== category.slug) {
        const existing = await Category.findOne({ slug: formattedSlug, _id: { $ne: id } });
        if (existing) {
          return res.status(400).json({ message: `A category with slug '${formattedSlug}' already exists` });
        }
        category.slug = formattedSlug;
      }
    }

    await category.save();

    return res.json({ message: 'Category updated successfully', category });
  } catch (error) {
    return next(error);
  }
}

/**
 * Admin: Delete a category.
 */
export async function deleteCategory(req, res, next) {
  try {
    const { id } = req.params;
    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    // Check if any products currently use this category
    const inUseCount = await Product.countDocuments({
      category: { $in: [category.slug, category.name, category.name.toLowerCase()] },
    });

    if (inUseCount > 0) {
      // Rather than deleting products, deactivate it so old listings keep their integrity
      category.isActive = false;
      await category.save();
      return res.json({
        message: `Category deactivated because ${inUseCount} product(s) are currently listed under it.`,
        category,
      });
    }

    await Category.findByIdAndDelete(id);
    return res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    return next(error);
  }
}
