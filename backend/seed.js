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
      {
        name: 'YouTube Likes [FineSMM Service #4351 - 100% Real Human - Non Drop - Lifetime Refill]',
        category: 'YouTube Likes',
        ratePer1000: 1.50,
        minQuantity: 50,
        maxQuantity: 100000,
        status: 'active',
        speed: 'Instant 1k/Min delivery',
        description: '100% Lifetime Guaranteed Non-Drop Services. Real human YouTube likes with lifetime refill button (FineSMM ID 4351).',
        providerId: provider1._id,
        providerServiceId: '4351',
      },
      {
        name: 'YouTube Views [FineSMM Service #3287 - Real Human Engagement - 0% Drop Guaranteed]',
        category: 'YouTube Views',
        ratePer1000: 1.85,
        minQuantity: 100,
        maxQuantity: 1000000,
        status: 'active',
        speed: 'Speed: 5k/Day (Start: 0-15 Min)',
        description: '100% Lifetime Guaranteed Non-Drop Services. High retention real human engagement views (FineSMM ID 3287).',
        providerId: provider1._id,
        providerServiceId: '3287',
      },
      {
        name: 'YouTube Subscribers [FineSMM Service #4035 - Real HQ Accounts - 0% Drop Guaranteed]',
        category: 'YouTube Subscribers',
        ratePer1000: 18.50,
        minQuantity: 100,
        maxQuantity: 10000,
        status: 'active',
        speed: 'Speed: 500-2000/Day (Organic)',
        description: '100% Lifetime Guaranteed Non-Drop Services. High quality real human channel subscribers (FineSMM ID 4035).',
        providerId: provider1._id,
        providerServiceId: '4035',
      },
      {
        name: 'YouTube Views Lifetime Refill [FineSMM Service #3306 - 100% Real Engagement - Non Drop]',
        category: 'YouTube Views',
        ratePer1000: 2.10,
        minQuantity: 100,
        maxQuantity: 200000,
        status: 'active',
        speed: 'Speed: 15k/Day (Start: 0-1 Hour)',
        description: '100% Lifetime Guaranteed Non-Drop Services. Real engagement views with lifetime auto-refill button (FineSMM ID 3306).',
        providerId: provider1._id,
        providerServiceId: '3306',
      },
      {
        name: 'Instagram Likes [JAP Service #4176 - Real Engagement - 100% Non Drop Guaranteed]',
        category: 'Instagram Likes',
        ratePer1000: 0.80,
        minQuantity: 50,
        maxQuantity: 15000,
        status: 'active',
        speed: 'Instant (10k/Hour)',
        description: '100% Lifetime Guaranteed Non-Drop Services. Real Instagram post and reel likes (JAP ID 4176).',
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
        description: '100% Lifetime Guaranteed Non-Drop Services. High quality real profile followers (JAP ID 5951).',
        providerId: provider3._id,
        providerServiceId: '5951',
      },
    ];

    console.log('[Seed] Inserting Verified 100% Non-Drop SMM Services...');
    const insertedServices = await Service.insertMany(initialServices);
    console.log(`[Seed Success] Inserted ${insertedServices.length} SMM Services with verified Zero-Drop Service IDs (4351, 3287, 4035, 3306, 4176, 5951).`);

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
    console.log(' GUARANTEED 0% DROP SERVICE MAPPINGS:');
    console.log('   YouTube Likes:       ID 4351 (1k/Min | Lifetime Refill | 0% Drop)');
    console.log('   YouTube Views:       ID 3287 (Real Engagement | 30d Refill | 0% Drop)');
    console.log('   YouTube Subscribers: ID 4035 (HQ Real Accounts | 0% Drop)');
    console.log('   YouTube Views (LT):  ID 3306 (Lifetime Refill | Real Engagement)');
    console.log('   Instagram Likes:     ID 4176 (Non Drop Exclusive | 90d Refill)');
    console.log('   Instagram Followers: ID 5951 (Super Quality USA | 0% Drop)');
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
