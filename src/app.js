import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import { rateLimit } from 'express-rate-limit';

const app = express();

// Behind Hostinger's Nginx reverse proxy — needed so express-rate-limit and
// req.ip read the real client IP from X-Forwarded-For instead of the proxy's.
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Security & parsing
// crossOriginResourcePolicy relaxed so the web app (different origin) can load product images
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// CLIENT_URL may be a comma-separated list (e.g. production Vercel domain +
// a preview deployment URL) — supports one env var covering a few origins.
const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    // Allow non-browser requests (curl, server-to-server) with no Origin header.
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Global rate limit
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
}));

// Static files
app.use(express.static('public'));

// Health check
app.get('/api/v1/health', (_req, res) => res.json({ status: 'ok' }));

// API routes
import authRoutes from './modules/auth/auth.routes.js';
import usersRoutes from './modules/users/users.routes.js';
import adminRoutes from './modules/admin/admin.routes.js';
import productsRoutes from './modules/products/products.routes.js';
import cartRoutes from './modules/cart/cart.routes.js';
import wishlistRoutes from './modules/wishlist/wishlist.routes.js';
import offersRoutes from './modules/offers/offers.routes.js';
import ordersRoutes from './modules/orders/orders.routes.js';
// import chatRoutes from './modules/chat/chat.routes.js';
// import paymentsRoutes from './modules/payments/payments.routes.js';

app.use('/api/v1/auth',  authRoutes);
app.use('/api/v1/users', usersRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/products', productsRoutes);
app.use('/api/v1/cart', cartRoutes);
app.use('/api/v1/wishlist', wishlistRoutes);
app.use('/api/v1/offers', offersRoutes);
app.use('/api/v1/orders', ordersRoutes);
// app.use('/api/v1/chat',     chatRoutes);
// app.use('/api/v1/payments', paymentsRoutes);

// 404
app.use((_req, res) => res.status(404).json({ message: 'Route not found' }));

// Global error handler
app.use((err, _req, res, _next) => {
  console.error(err);

  if (err.name === 'ValidationError') {
    return res.status(422).json({
      message: 'Please fix the highlighted fields and try again',
      errors: Object.entries(err.errors).map(([field, error]) => ({
        field,
        message: error.message,
      })),
    });
  }

  if (err.name === 'CastError') {
    return res.status(400).json({ message: `Invalid ${err.path}: ${err.value}` });
  }

  if (err.code === 11000) {
    const fields = Object.keys(err.keyValue || {});
    return res.status(409).json({
      message: fields.length
        ? `${fields.join(', ')} already exists`
        : 'Duplicate value already exists',
    });
  }

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Request body contains invalid JSON' });
  }

  const status = err.status || err.statusCode || 500;
  const message = status >= 500
    ? 'Something went wrong on the server'
    : err.message || 'Request failed';

  res.status(status).json({ message });
});

export default app;
