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
      // 1. YouTube Likes (FineSMM ID 4351 - Natural Steady Slow Delivery ~3k-5k/Hour | ~₹126/1k, ~₹6.30 for 50 likes)
      {
        name: 'YouTube Likes [Wholesale Low-Cost | Natural Steady Pacing | Non-Drop Auto-Refill]',
        category: 'YouTube Likes',
        ratePer1000: 1.50,
        minQuantity: 50,
        maxQuantity: 10000,
        status: 'active',
        speed: 'Speed: 3k-5k/Hour Natural Pacing (Start: 0-15 Min)',
        description: 'Real high quality YouTube likes with natural steady pacing (~3k-5k/hour, 50-100 likes delivered over minutes) and 30-day auto-refill non-drop support for organic algorithm boosting (FineSMM ID 4351 - Rate: ~₹126 / ~$1.50 per 1k, ~₹6.30 for 50 likes).',
        providerId: provider1._id,
        providerServiceId: '4351',
      },
      {
        name: 'YouTube Likes [Standard - Natural Slow Viral Booster | Active Profiles | Non-Drop Auto-Refill]',
        category: 'YouTube Likes',
        ratePer1000: 1.50,
        minQuantity: 50,
        maxQuantity: 10000,
        status: 'active',
        speed: 'Speed: 3k-5k/Hour Steady Drip (Start: 0-15 Min)',
        description: 'Active YouTube video likes from real profiles with natural steady delivery (~3k-5k/hour, ~10k over 2-3 hrs) registering naturally on analytics with 30-day auto-refill (FineSMM ID 4351 - Rate: ~₹126 / ~$1.50 per 1k, ~₹6.30 for 50 likes).',
        providerId: provider1._id,
        providerServiceId: '4351',
      },
      {
        name: 'YouTube Likes [Premium - Natural Drip Algorithm Booster | 100% Real Non-Drop HQ]',
        category: 'YouTube Likes',
        ratePer1000: 1.50,
        minQuantity: 50,
        maxQuantity: 10000,
        status: 'active',
        speed: 'Speed: 3k-5k/Hour Natural Pacing (Start: 0-15 Min | 30d Auto-Refill)',
        description: '100% Real HQ non-drop YouTube likes with steady drip delivery (~3k-5k/hour natural pacing) for safe algorithm rank boosting (FineSMM ID 4351 - Rate: ~₹126 / ~$1.50 per 1k, ~₹6.30 for 50 likes).',
        providerId: provider1._id,
        providerServiceId: '4351',
      },


      // 2. YouTube Views (High Retention AdWords / Suggested Views for Long Videos & Shorts Algorithm Booster)
      {
        name: 'YouTube Views [Wholesale - Google AdWords High-Retention Views | 70%+ Watch Time | Shorts & Long Videos]',
        category: 'YouTube Views',
        ratePer1000: 0.40,
        minQuantity: 1000000,
        maxQuantity: 50000000,
        status: 'active',
        speed: 'Speed: 300k-600k/Day (Superfast)',
        description: 'Cheapest wholesale Google AdWords high-retention views (70%+ watch time retention for Long Videos & Shorts discovery). (FineSMM ID 4217 - Provider Rate: ₹30 / ~$0.36 per 1k)',
        providerId: provider1._id,
        providerServiceId: '4217',
      },
      {
        name: 'YouTube Views [Simple - High Retention AdWords Suggested Views | 70%+ Retention | 30d Refill]',
        category: 'YouTube Views',
        ratePer1000: 1.20,
        minQuantity: 100,
        maxQuantity: 550000,
        status: 'active',
        speed: 'Speed: 150k/Day (Start: 0-30 Min)',
        description: 'High retention suggested views + free likes targeting 70%+ watch time retention for YouTube algorithm discovery on Long Videos & Shorts (JAP ID 8072 - Provider Rate: $0.86 / ~₹70 per 1k).',
        providerId: provider3._id,
        providerServiceId: '8072',
      },
      {
        name: 'YouTube Views [Standard - Fast Non-Drop Suggested Views | 70%+ Retention | Lifetime Refill]',
        category: 'YouTube Views',
        ratePer1000: 1.90,
        minQuantity: 100,
        maxQuantity: 10000000,
        status: 'active',
        speed: 'Speed: 10k-20k/Day (Start: 0-15 Min)',
        description: 'Fast non-drop real human views with 70%+ watch time retention for YouTube algorithm recommendations & lifetime refill (FineSMM ID 4215).',
        providerId: provider1._id,
        providerServiceId: '4215',
      },
      {
        name: 'YouTube Views [Premium - High Retention Algorithm Booster | 70%+ Retention | Non-Drop]',
        category: 'YouTube Views',
        ratePer1000: 2.50,
        minQuantity: 100,
        maxQuantity: 1000000,
        status: 'active',
        speed: 'Speed: 15k-50k/Day (Instant Start)',
        description: '100% Lifetime Guaranteed Non-Drop real high-retention views (70%+ watch time retention) for boosting Long Videos & Shorts algorithm ranking (FineSMM ID 3306).',
        providerId: provider1._id,
        providerServiceId: '3306',
      },

      // 3. YouTube Subscribers (Cheapest Refill Active Provider IDs)
      {
        name: 'YouTube Subscribers [Wholesale Low-Cost | Min 5 | 30d Refill]',
        category: 'YouTube Subscribers',
        ratePer1000: 15.00,
        minQuantity: 5,
        maxQuantity: 100000,
        status: 'active',
        speed: 'Speed: Up to 100/Day (Organic Drip)',
        description: 'Cheapest real channel subscribers with 30-day refill guarantee (JAP ID 3519 - Provider Rate: $12.50 / ~₹1000 per 1k).',
        providerId: provider3._id,
        providerServiceId: '3519',
      },
      {
        name: 'YouTube Subscribers [Standard - Auto Refill 90 Days]',
        category: 'YouTube Subscribers',
        ratePer1000: 18.50,
        minQuantity: 100,
        maxQuantity: 1000000,
        status: 'active',
        speed: 'Speed: Up to 300/Day (Organic)',
        description: 'High quality channel subscribers with 90-day auto refill guarantee (JAP ID 6176 - Provider Rate: $15.11 per 1k).',
        providerId: provider3._id,
        providerServiceId: '6176',
      },
      {
        name: 'YouTube Subscribers [Premium - VIP HQ Accounts | Non Drop]',
        category: 'YouTube Subscribers',
        ratePer1000: 39.50,
        minQuantity: 100,
        maxQuantity: 100000,
        status: 'active',
        speed: 'Speed: 500-800/Day (Safe Organic)',
        description: 'VIP High Quality channel subscribers (FineSMM ID 4038).',
        providerId: provider1._id,
        providerServiceId: '4038',
      },

      // 4. YouTube Comments (FineSMM Service IDs 4172 & 4171 - High Quality Random/Generic Non-Drop Comments)
      {
        name: 'YouTube Comments [Wholesale Low-Cost | High Quality Random Positive Comments]',
        category: 'YouTube Comments',
        ratePer1000: 5.00,
        minQuantity: 10,
        maxQuantity: 5000,
        status: 'active',
        speed: 'Speed: 5k/Day (Start: 0-1 Hour)',
        description: 'High Quality random positive generic non-drop video comments (FineSMM ID 4172 - Rate: ₹365 / ~$4.45 per 1k).',
        providerId: provider1._id,
        providerServiceId: '4172',
      },
      {
        name: 'YouTube Comments [Standard - Indian Positive Non-Drop Comments | 30d Refill]',
        category: 'YouTube Comments',
        ratePer1000: 6.50,
        minQuantity: 10,
        maxQuantity: 5000,
        status: 'active',
        speed: 'Speed: 100-500/Day (Start: 0-1 Hour)',
        description: 'High Quality Indian relevant positive non-drop comments with 30D Refill (FineSMM ID 4172 - Rate: ₹365 / ~$4.45 per 1k).',
        providerId: provider1._id,
        providerServiceId: '4172',
      },
      {
        name: 'YouTube Comments [Premium - USA Non-Drop High Quality Positive Comments]',
        category: 'YouTube Comments',
        ratePer1000: 9.50,
        minQuantity: 10,
        maxQuantity: 5000,
        status: 'active',
        speed: 'Speed: 200-500/Day (Fast Start)',
        description: 'Ultra High Quality USA non-drop generic positive comments (FineSMM ID 4171 - Rate: ₹685 / ~$8.35 per 1k).',
        providerId: provider1._id,
        providerServiceId: '4171',
      },

      // 5. YouTube Watch Time (High-Yield Long-Video Watch Time with Refill Guarantee)
      {
        name: 'YouTube Watch Time [Wholesale Low-Cost | High-Yield Long-Video Watch Time | 30d Refill]',
        category: 'YouTube Watch Time',
        ratePer1000: 20.00,
        minQuantity: 100,
        maxQuantity: 20000,
        status: 'active',
        speed: 'Speed: 20k Hours/Day (Start: 12-24 Hrs)',
        description: 'High-Yield Long-Video watch hours for monetization with 30-day refill guarantee (JAP ID 3389 - Provider Rate: $16.25 per 1000 hrs).',
        providerId: provider3._id,
        providerServiceId: '3389',
      },
      {
        name: 'YouTube Watch Time [Premium - High-Yield Long-Video Watch Time | Refill Guarantee]',
        category: 'YouTube Watch Time',
        ratePer1000: 55.00,
        minQuantity: 4000,
        maxQuantity: 4000,
        status: 'active',
        speed: 'Speed: 200-500 Hours/Day',
        description: 'High-Yield Long-Video monetization watch hours with refill guarantee suitable for any video length (FineSMM ID 2399).',
        providerId: provider1._id,
        providerServiceId: '2399',
      },

      // 6. Additional Low-Cost Wholesale Social Services (< $0.40 / 1k)
      {
        name: 'Instagram Likes [Wholesale Low-Cost | Under $0.40/1k]',
        category: 'Instagram Likes',
        ratePer1000: 0.35,
        minQuantity: 100,
        maxQuantity: 1000000,
        status: 'active',
        speed: 'Instant (10k/Hour)',
        description: 'Wholesale Instagram likes (FineSMM ID 4365 - Provider Rate: ₹10.75 / ~$0.13 per 1k).',
        providerId: provider1._id,
        providerServiceId: '4365',
      },
      {
        name: 'Instagram Video Views [Ultra Wholesale Low-Cost | Under $0.40/1k]',
        category: 'Instagram Views',
        ratePer1000: 0.10,
        minQuantity: 100,
        maxQuantity: 10000000,
        status: 'active',
        speed: 'Superfast Delivery',
        description: 'Ultra cheap Instagram Video & Reel views (FineSMM ID 2495 - Provider Rate: ₹0.50 / ~$0.006 per 1k).',
        providerId: provider1._id,
        providerServiceId: '2495',
      },
      {
        name: 'Twitter Video Views [Wholesale Low-Cost | Under $0.40/1k]',
        category: 'Twitter Views',
        ratePer1000: 0.20,
        minQuantity: 100,
        maxQuantity: 50000000,
        status: 'active',
        speed: 'Speed: 500M/day (Ultrafast)',
        description: 'Wholesale Twitter Video views (FineSMM ID 3382 - Provider Rate: ₹5.00 / ~$0.06 per 1k).',
        providerId: provider1._id,
        providerServiceId: '3382',
      },
    ];

    console.log('[Seed] Inserting Verified 100% Non-Drop 3-Tier SMM Services...');
    const insertedServices = await Service.insertMany(initialServices);
    console.log(`[Seed Success] Inserted ${insertedServices.length} Tiered SMM Services across 5 Core YouTube Categories + Instagram.`);

    console.log('[Seed Critical Check] Hardcoding ALL YouTube Likes services in MongoDB Atlas to FineSMM ID 4351 (Natural Steady Delivery ~3k-5k/hr)...');
    const updateLikesResult = await Service.updateMany(
      { category: 'YouTube Likes' },
      {
        $set: {
          providerServiceId: '4351',
          ratePer1000: 1.50,
          speed: 'Speed: 3k-5k/Hour Natural Pacing (Start: 0-15 Min)',
        },
      }
    );
    console.log(`[Seed Success] Hardcoded ${updateLikesResult.modifiedCount || updateLikesResult.matchedCount} YouTube Likes services to FineSMM ID 4351.`);

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
    console.log('   1. YouTube Likes:       Wholesale ($1.50 / ~₹126 - ID 4351), Standard ($1.50 / ~₹126 - ID 4351), Premium ($1.50 / ~₹126 - ID 4351) [3k-5k/hr Natural Pacing]');
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
