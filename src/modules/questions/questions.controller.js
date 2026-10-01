import mongoose from 'mongoose';
import Question from './question.model.js';
import Product from '../products/product.model.js';

function validObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

// GET /api/v1/questions/products/:productId
export async function listProductQuestions(req, res, next) {
  try {
    if (!validObjectId(req.params.productId)) {
      return res.status(400).json({ message: 'Invalid product id' });
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const filter = {
      product: req.params.productId,
      status: { $ne: 'hidden' },
    };

    const [questions, total] = await Promise.all([
      Question.find(filter)
        .populate('author', 'fullName')
        .populate('answeredBy', 'fullName storeName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Question.countDocuments(filter),
    ]);

    res.json({
      questions,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/questions/products/:productId
export async function askProductQuestion(req, res, next) {
  try {
    if (!validObjectId(req.params.productId)) {
      return res.status(400).json({ message: 'Invalid product id' });
    }

    const product = await Product.findOne({ _id: req.params.productId, status: 'active' });
    if (!product) {
      return res.status(404).json({ message: 'Product not found or inactive' });
    }

    if (product.seller.equals(req.user._id)) {
      return res.status(400).json({ message: 'You cannot ask a question on your own product' });
    }

    const question = await Question.create({
      product: product._id,
      seller: product.seller,
      author: req.user._id,
      question: req.body.question,
    });

    await question.populate('author', 'fullName');

    res.status(201).json({
      message: 'Question posted successfully. It will be visible to all users.',
      question,
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/questions/:id/answer
export async function answerQuestion(req, res, next) {
  try {
    if (!validObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid question id' });
    }

    const question = await Question.findById(req.params.id);
    if (!question) {
      return res.status(404).json({ message: 'Question not found' });
    }

    const isSeller = question.seller.equals(req.user._id);
    const isAdmin = req.user.roles.includes('admin');
    if (!isSeller && !isAdmin) {
      return res.status(403).json({ message: 'Only the listing seller can answer this question' });
    }

    question.answer = req.body.answer;
    question.answeredBy = req.user._id;
    question.answeredAt = new Date();
    question.status = 'answered';
    await question.save();

    await question.populate([
      { path: 'author', select: 'fullName' },
      { path: 'answeredBy', select: 'fullName' },
    ]);

    res.json({
      message: 'Answer published successfully',
      question,
    });
  } catch (err) {
    next(err);
  }
}
