import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../modules/users/user.model.js';

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);

  const email = process.env.ADMIN_EMAIL || 'admin@pricem.com';
  const existing = await User.findOne({ email });

  if (existing) {
    console.log('Admin already exists:', email);
  } else {
    await User.create({
      fullName: 'Admin',
      email,
      contactNumber: '0000000000',
      password: process.env.ADMIN_PASSWORD || 'changeme123',
      roles: ['buyer', 'admin'],
      activeRole: 'admin',
      emailVerified: true,
    });
    console.log('Admin created:', email);
  }

  await mongoose.disconnect();
}

seed().catch((err) => { console.error(err); process.exit(1); });
