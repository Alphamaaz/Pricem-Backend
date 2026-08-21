import 'dotenv/config';
import http from 'http';
import app from './src/app.js';
import connectDB from './src/config/db.js';
import initSocket from './src/config/socket.js';
import cron from 'node-cron';
import { releaseExpiredOfferReservations } from './src/modules/orders/orders.service.js';

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);
initSocket(server);

connectDB().then(() => {
  releaseExpiredOfferReservations().catch((error) => console.error('Offer reservation cleanup failed', error));
  cron.schedule('*/5 * * * *', () => {
    releaseExpiredOfferReservations().catch((error) => console.error('Offer reservation cleanup failed', error));
  });
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT} [${process.env.NODE_ENV}]`);
  });
});
