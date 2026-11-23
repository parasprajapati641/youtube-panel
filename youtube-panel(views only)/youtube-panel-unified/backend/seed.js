/**
 * Local seed – NO third-party SMM
 * Uses MONGO_URI from .env (jo tame set karyu hoy e)
 * Run: node seed.js
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('./models/User');
const Service = require('./models/Service');

const seed = async () => {
  try {
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!uri) {
      console.error('[Seed] MONGO_URI missing in .env');
      process.exit(1);
    }

    console.log('[Seed] Connecting...', uri.replace(/:[^:@/]+@/, ':****@'));
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 15000,
    });
    console.log('[Seed] Connected DB name:', mongoose.connection.name);

    // ----- Admin -----
    const adminHash = await bcrypt.hash('Admin@12345', 10);
    const admin = await User.findOneAndUpdate(
      { username: 'admin' },
      {
        $set: {
          email: 'admin@smm.com',
          password: adminHash,
          role: 'super_admin',
          balance: 999999,
          isUnlimited: true,
          status: 'active',
        },
        $setOnInsert: { username: 'admin' },
      },
      { upsert: true, new: true }
    );
    console.log('[Seed] Super Admin OK:', admin.username, admin.email);

    // ----- Test user -----
    const testHash = await bcrypt.hash('Test@12345', 10);
    const test = await User.findOneAndUpdate(
      { username: 'testuser' },
      {
        $set: {
          email: 'test@local.com',
          password: testHash,
          role: 'user',
          balance: 10000,
          isUnlimited: true,
          status: 'active',
        },
        $setOnInsert: { username: 'testuser' },
      },
      { upsert: true, new: true }
    );
    console.log('[Seed] Test user OK:', test.username);

    // ----- Local bot services -----
    const services = [
      {
        name: 'YouTube Likes (Local Bot)',
        category: 'YouTube Likes',
        ratePer1000: 1,
        minQuantity: 1,
        maxQuantity: 50,
        status: 'active',
        speed: 'Local Playwright bot',
        description: 'Quantity = bots (1–50)',
        providerServiceId: 'local-like',
      },
      {
        name: 'YouTube Comments (Local Bot)',
        category: 'YouTube Comments',
        ratePer1000: 2,
        minQuantity: 1,
        maxQuantity: 50,
        status: 'active',
        speed: 'Local Playwright bot',
        description: 'Comments via local bot',
        providerServiceId: 'local-comment',
      },
      {
        name: 'YouTube Subscribers (Local Bot)',
        category: 'YouTube Subscribers',
        ratePer1000: 3,
        minQuantity: 1,
        maxQuantity: 50,
        status: 'active',
        speed: 'Local Playwright bot',
        description: 'Subscribe via local bot',
        providerServiceId: 'local-subscribe',
      },
    ];

    for (const s of services) {
      await Service.findOneAndUpdate({ name: s.name }, { $set: s }, { upsert: true });
      console.log('[Seed] Service:', s.name);
    }

    const userCount = await User.countDocuments();
    console.log('\n========================================');
    console.log(' SEED OK | users in DB =', userCount);
    console.log('----------------------------------------');
    console.log(' ADMIN : admin  /  Admin@12345');
    console.log(' TEST  : testuser  /  Test@12345');
    console.log('========================================\n');

    await mongoose.disconnect();
    process.exit(0);
  } catch (e) {
    console.error('[Seed Error]', e.message);
    process.exit(1);
  }
};

seed();
