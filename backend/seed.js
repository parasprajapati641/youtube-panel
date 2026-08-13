const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

dotenv.config();

const User = require('./models/User');
const Service = require('./models/Service');
const ApiProvider = require('./models/ApiProvider');
const Setting = require('./models/Setting');
const connectDB = require('./config/db');

const seedDatabase = async () => {
  try {
    await connectDB();

    console.log('[Seed] Clearing existing collections...');
    await User.deleteMany({});
    await Service.deleteMany({});
    await ApiProvider.deleteMany({});
    await Setting.deleteMany({});

    console.log('[Seed] Seeding Active SMM API Providers into Database...');
    const provider1 = await ApiProvider.create({
      name: 'FineSMM',
      apiUrl: 'https://finesmmpanel.com/api/v2',
      apiKey: 'ba984cfb277e7e9158a93473b6f26bfb',
      balance: 50.00,
      status: 'active',
    });

    const provider2 = await ApiProvider.create({
      name: 'PrimeSMM',
      apiUrl: 'https://primesmm.com/api/v2',
      apiKey: '$2y$10$Lb90YHhsyi2RDayFUejGOuxZkszsypxp0PcLKUzlUOn2zWKRIc8Qu',
      balance: 100.00,
      status: 'active',
    });

    const provider3 = await ApiProvider.create({
      name: 'JAP',
      apiUrl: 'https://justanotherpanel.com/api/v2',
      apiKey: '6c134c9a46b830985f89770961c0535d',
      balance: 150.00,
      status: 'active',
    });

    console.log(`[Seed Success] Created 3 API Providers: ${provider1.name}, ${provider2.name}, ${provider3.name}`);

    console.log('[Seed] Creating Super Admin Account...');
    const adminPasswordHash = await bcrypt.hash('Admin@12345', 10);
    const adminUser = await User.create({
      username: 'admin',
      email: 'admin@smm.com',
      password: adminPasswordHash,
      role: 'admin',
      balance: 999999,
      isUnlimited: true,
      status: 'active',
    });
    console.log(`[Seed Success] Super Admin created: admin@smm.com / Admin@12345 (isUnlimited: ${adminUser.isUnlimited})`);

    console.log('[Seed] Creating Demo Standard User Account...');
    const userPasswordHash = await bcrypt.hash('userpassword123', 10);
    const demoUser = await User.create({
      username: 'demo_user',
      email: 'user@smmpanel.com',
      password: userPasswordHash,
      role: 'user',
      balance: 50.00,
      isUnlimited: false,
      status: 'active',
    });
    console.log(`[Seed Success] Demo User created: demo_user / userpassword123 (Balance: $${demoUser.balance})`);

    const initialServices = [
      // 1. YouTube Likes (3 Tiers)
      {
        name: 'YouTube Likes [Simple - Standard Quality | Basic Speed]',
        category: 'YouTube Likes',
        ratePer1000: 0.85,
        minQuantity: 50,
        maxQuantity: 50000,
        status: 'active',
        speed: 'Speed: 1k-3k/Day (Start: 0-1 Hour)',
        description: 'Standard tier YouTube video likes from active accounts. Quick start. (Rate: $0.85 / ₹70 per 1k)',
        providerId: provider1._id,
        providerServiceId: '4350',
      },
      {
        name: 'YouTube Likes [Standard - High Quality | Fast Delivery]',
        category: 'YouTube Likes',
        ratePer1000: 1.25,
        minQuantity: 50,
        maxQuantity: 75000,
        status: 'active',
        speed: 'Speed: 5k-10k/Day (Start: 0-15 Min)',
        description: 'High Quality fast delivery real YouTube likes with 30-day refill guarantee. (Rate: $1.25 / ₹100 per 1k)',
        providerId: provider1._id,
        providerServiceId: '4351',
      },
      {
        name: 'YouTube Likes [Premium - 100% Non-Drop Lifetime Guaranteed]',
        category: 'YouTube Likes',
        ratePer1000: 1.80,
        minQuantity: 50,
        maxQuantity: 100000,
        status: 'active',
        speed: 'Instant 1k/Min delivery (0% Drop Guaranteed)',
        description: '100% Lifetime Guaranteed Non-Drop Services. Real human YouTube likes with lifetime refill button (FineSMM ID 4352). (Rate: $1.80 / ₹150 per 1k)',
        providerId: provider1._id,
        providerServiceId: '4352',
      },

      // 2. YouTube Views (3 Tiers)
      {
        name: 'YouTube Views [Simple - Basic Retention | Fast Start]',
        category: 'YouTube Views',
        ratePer1000: 1.20,
        minQuantity: 100,
        maxQuantity: 500000,
        status: 'active',
        speed: 'Speed: 2k-5k/Day (Start: 0-30 Min)',
        description: 'Basic retention real views suitable for all video lengths. (Rate: $1.20 / ₹99 per 1k)',
        providerId: provider1._id,
        providerServiceId: '3286',
      },
      {
        name: 'YouTube Views [Standard - High Retention | 30d Refill]',
        category: 'YouTube Views',
        ratePer1000: 1.85,
        minQuantity: 100,
        maxQuantity: 1000000,
        status: 'active',
        speed: 'Speed: 5k-15k/Day (Start: 0-15 Min)',
        description: 'High retention real human engagement views with 30-day refill guarantee (FineSMM ID 3287). (Rate: $1.85 / ₹150 per 1k)',
        providerId: provider1._id,
        providerServiceId: '3287',
      },
      {
        name: 'YouTube Views [Premium - 100% Non-Drop Lifetime Guaranteed]',
        category: 'YouTube Views',
        ratePer1000: 2.50,
        minQuantity: 100,
        maxQuantity: 2000000,
        status: 'active',
        speed: 'Speed: 15k-50k/Day (Instant Delivery)',
        description: '100% Lifetime Guaranteed Non-Drop Services. High retention real engagement views with lifetime auto-refill button (FineSMM ID 3306). (Rate: $2.50 / ₹200 per 1k)',
        providerId: provider1._id,
        providerServiceId: '3306',
      },

      // 3. YouTube Subscribers (3 Tiers)
      {
        name: 'YouTube Subscribers [Simple - Standard Accounts]',
        category: 'YouTube Subscribers',
        ratePer1000: 12.00,
        minQuantity: 50,
        maxQuantity: 5000,
        status: 'active',
        speed: 'Speed: 100-300/Day (Organic Drip)',
        description: 'Standard channel subscribers for fast milestone growth. (Rate: $12.00 / ₹990 per 1k)',
        providerId: provider1._id,
        providerServiceId: '4034',
      },
      {
        name: 'YouTube Subscribers [Standard - High Quality Real Accounts]',
        category: 'YouTube Subscribers',
        ratePer1000: 18.50,
        minQuantity: 50,
        maxQuantity: 10000,
        status: 'active',
        speed: 'Speed: 500-2000/Day (Organic)',
        description: 'High quality real human channel subscribers with 60-day refill guarantee (FineSMM ID 4035). (Rate: $18.50 / ₹1500 per 1k)',
        providerId: provider1._id,
        providerServiceId: '4035',
      },
      {
        name: 'YouTube Subscribers [Premium - 100% Non-Drop Lifetime Guaranteed]',
        category: 'YouTube Subscribers',
        ratePer1000: 25.00,
        minQuantity: 50,
        maxQuantity: 20000,
        status: 'active',
        speed: 'Speed: 1000-3000/Day (Super Fast Real)',
        description: '100% Lifetime Guaranteed Non-Drop Services. Premium real human channel subscribers with lifetime refill button. (Rate: $25.00 / ₹2050 per 1k)',
        providerId: provider1._id,
        providerServiceId: '4036',
      },

      // 4. YouTube Comments (3 Tiers)
      {
        name: 'YouTube Comments [Simple - Random Positive Comments]',
        category: 'YouTube Comments',
        ratePer1000: 8.00,
        minQuantity: 10,
        maxQuantity: 1000,
        status: 'active',
        speed: 'Speed: 50-200/Day (Start: 0-1 Hour)',
        description: 'Standard random positive comments from active accounts. (Rate: $8.00 / ₹650 per 1k)',
        providerId: provider1._id,
        providerServiceId: '5010',
      },
      {
        name: 'YouTube Comments [Standard - Custom Video Relevant]',
        category: 'YouTube Comments',
        ratePer1000: 14.00,
        minQuantity: 10,
        maxQuantity: 2500,
        status: 'active',
        speed: 'Speed: 200-500/Day (Fast Start)',
        description: 'Custom video-relevant high quality comments from real active profiles. (Rate: $14.00 / ₹1150 per 1k)',
        providerId: provider1._id,
        providerServiceId: '5011',
      },
      {
        name: 'YouTube Comments [Premium - 100% Non-Drop Lifetime Guaranteed]',
        category: 'YouTube Comments',
        ratePer1000: 20.00,
        minQuantity: 10,
        maxQuantity: 5000,
        status: 'active',
        speed: 'Speed: 500-1000/Day (Instant Delivery)',
        description: '100% Lifetime Guaranteed Non-Drop Services. Premium real user custom video comments with zero drop lifetime refill guarantee. (Rate: $20.00 / ₹1650 per 1k)',
        providerId: provider1._id,
        providerServiceId: '5012',
      },

      // 5. YouTube Watch Time (3 Tiers)
      {
        name: 'YouTube Watch Time [Simple - Standard 15+ Min Video]',
        category: 'YouTube Watch Time',
        ratePer1000: 15.00,
        minQuantity: 100,
        maxQuantity: 4000,
        status: 'active',
        speed: 'Speed: 200-500 Hours/Day',
        description: 'Standard watch hours suitable for 15+ minute long videos. (Rate: $15.00 / ₹1230 per 1000 hrs)',
        providerId: provider3._id,
        providerServiceId: '6001',
      },
      {
        name: 'YouTube Watch Time [Standard - High Retention Fast]',
        category: 'YouTube Watch Time',
        ratePer1000: 22.00,
        minQuantity: 100,
        maxQuantity: 4000,
        status: 'active',
        speed: 'Speed: 500-1000 Hours/Day',
        description: 'High retention watch hours for channel monetization (30+ minute video required). (Rate: $22.00 / ₹1800 per 1000 hrs)',
        providerId: provider3._id,
        providerServiceId: '6002',
      },
      {
        name: 'YouTube Watch Time [Premium - 100% Non-Drop Lifetime Guaranteed]',
        category: 'YouTube Watch Time',
        ratePer1000: 30.00,
        minQuantity: 100,
        maxQuantity: 4000,
        status: 'active',
        speed: 'Speed: 1000-2000 Hours/Day (Fast Monetization)',
        description: '100% Lifetime Guaranteed Non-Drop Services. Safe monetization watch hours guaranteed non-drop with lifetime refill guarantee. (Rate: $30.00 / ₹2460 per 1000 hrs)',
        providerId: provider3._id,
        providerServiceId: '6003',
      },

      // Additional Social Services
      {
        name: 'Instagram Likes [JAP Service #4176 - Real Engagement - 100% Non Drop]',
        category: 'Instagram Likes',
        ratePer1000: 0.80,
        minQuantity: 50,
        maxQuantity: 15000,
        status: 'active',
        speed: 'Instant (10k/Hour)',
        description: '100% Lifetime Guaranteed Non-Drop Services. Real Instagram post and reel likes (JAP ID 4176). (Rate: $0.80 / ₹65 per 1k)',
        providerId: provider3._id,
        providerServiceId: '4176',
      },
      {
        name: 'Instagram Followers [JAP Service #5951 - Real USA Super Quality - 100% Non Drop]',
        category: 'Instagram Followers',
        ratePer1000: 4.50,
        minQuantity: 50,
        maxQuantity: 100000,
        status: 'active',
        speed: 'Speed: 5k/Day',
        description: '100% Lifetime Guaranteed Non-Drop Services. High quality real profile followers (JAP ID 5951). (Rate: $4.50 / ₹370 per 1k)',
        providerId: provider3._id,
        providerServiceId: '5951',
      },
    ];

    console.log('[Seed] Inserting Verified 100% Non-Drop 3-Tier SMM Services...');
    const insertedServices = await Service.insertMany(initialServices);
    console.log(`[Seed Success] Inserted ${insertedServices.length} Tiered SMM Services across 5 Core YouTube Categories + Instagram.`);

    console.log('[Seed] Creating Default Settings...');
    await Setting.create({
      providerApiKey: provider1.apiKey,
      providerApiUrl: provider1.apiUrl,
      siteName: 'YouTube & Social Multi-Provider SMM Panel',
    });
    console.log('[Seed Success] Default Settings created.');

    console.log('\n================================================');
    console.log(' SEED COMPLETED SUCCESSFULLY!');
    console.log('================================================');
    console.log(' 5 CORE YOUTUBE CATEGORIES & 3 QUALITY TIERS CREATED:');
    console.log('   1. YouTube Likes:       Simple ($0.85), Standard ($1.25), Premium ($1.80)');
    console.log('   2. YouTube Views:       Simple ($1.20), Standard ($1.85), Premium ($2.50)');
    console.log('   3. YouTube Subscribers: Simple ($12.00), Standard ($18.50), Premium ($25.00)');
    console.log('   4. YouTube Comments:    Simple ($8.00), Standard ($14.00), Premium ($20.00)');
    console.log('   5. YouTube Watch Time:  Simple ($15.00), Standard ($22.00), Premium ($30.00)');
    console.log('------------------------------------------------');
    console.log(' ADMIN CREDENTIALS:');
    console.log('   Email/Login: admin@smm.com (or username: admin)');
    console.log('   Password:    Admin@12345');
    console.log('================================================\n');

    process.exit(0);
  } catch (error) {
    console.error('[Seed Error]', error);
    process.exit(1);
  }
};

seedDatabase();
