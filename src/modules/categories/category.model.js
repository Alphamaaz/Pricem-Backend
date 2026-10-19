import mongoose from 'mongoose';

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Category name is required'],
      trim: true,
      maxlength: [100, 'Category name cannot exceed 100 characters'],
    },
    slug: {
      type: String,
      required: [true, 'Category slug is required'],
      trim: true,
      lowercase: true,
      unique: true,
      index: true,
    },
    icon: {
      type: String,
      default: 'Package',
      trim: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    order: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

export const Category = mongoose.model('Category', categorySchema);

export const DEFAULT_CATEGORIES = [
  { name: 'Mobile Phones', slug: 'mobile-phones', icon: 'Smartphone', description: 'Smartphones, feature phones, cases, and mobile accessories', order: 1 },
  { name: 'Laptops & Desktops', slug: 'laptops-desktops', icon: 'Laptop', description: 'Laptops, desktop computers, monitors, parts, and computer accessories', order: 2 },
  { name: 'Kids & Toys', slug: 'kids-toys', icon: 'Baby', description: 'Toys, educational games, baby wear, gear, and nursery items', order: 3 },
  { name: 'Beauty & Skin Care', slug: 'beauty-skincare', icon: 'Sparkles', description: 'Skincare, cosmetics, hair care, fragrance, and personal hygiene', order: 4 },
  { name: 'Equipment & Tools', slug: 'equipment-tools', icon: 'Wrench', description: 'Power tools, hand tools, workshop equipment, generators, and hardware', order: 5 },
  { name: 'Electronics & Tech', slug: 'electronics', icon: 'Headphones', description: 'Audio gear, cameras, TV, smart devices, and consumer electronics', order: 6 },
  { name: 'Fashion & Apparel', slug: 'fashion', icon: 'Shirt', description: 'Clothing, footwear, bags, watches, and jewelry', order: 7 },
  { name: 'Home & Furniture', slug: 'home', icon: 'HomeIcon', description: 'Furniture, home decor, kitchen appliances, and living essentials', order: 8 },
  { name: 'Gaming & Consoles', slug: 'gaming', icon: 'Gamepad2', description: 'PlayStation, Xbox, Nintendo consoles, controllers, and game discs', order: 9 },
  { name: 'Books & Education', slug: 'books', icon: 'BookOpen', description: 'Textbooks, literature, professional guides, and stationery', order: 10 },
  { name: 'General Goods', slug: 'other', icon: 'Package', description: 'Miscellaneous products, general merchandise, and other items', order: 11 },
];
