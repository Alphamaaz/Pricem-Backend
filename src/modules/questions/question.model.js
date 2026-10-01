import mongoose from 'mongoose';

const questionSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
    index: true,
  },
  seller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  question: {
    type: String,
    required: true,
    trim: true,
    minlength: 3,
    maxlength: 500,
  },
  answer: {
    type: String,
    trim: true,
    maxlength: 1000,
    default: null,
  },
  answeredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  answeredAt: {
    type: Date,
    default: null,
  },
  status: {
    type: String,
    enum: ['unanswered', 'answered', 'hidden'],
    default: 'unanswered',
    index: true,
  },
}, { timestamps: true });

questionSchema.index({ product: 1, createdAt: -1 });

const Question = mongoose.model('Question', questionSchema);
export default Question;
