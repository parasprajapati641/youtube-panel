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
        name: 'YouTube Likes [FineSMM Service #4351 - Non Drop - Lifetime Refill]',
        category: 'YouTube Likes',
        ratePer1000: 1.50,
        minQuantity: 50,
        maxQuantity: 100000,
        status: 'active',
        speed: 'Instant 1k/Min delivery',
        description: 'Fast non-drop YouTube likes. Tested and verified on FineSMM (Service ID 4351).',
        providerId: provider1._id,
        providerServiceId: '4351',
      },
      {
        name: 'YouTube Views [FineSMM Service #3287 - 30 Days Auto Refill]',
        category: 'YouTube Views',
        ratePer1000: 1.85,
        minQuantity: 100,
        maxQuantity: 1000000,
        status: 'active',
        speed: 'Speed: 5k/Day (Start: 0-15 Min)',
        description: 'High retention organic YouTube views. Tested and verified on FineSMM (Service ID 3287).',
        providerId: provider1._id,
        providerServiceId: '3287',
      },
      {
        name: 'YouTube Subscribers [FineSMM Service #4035 - HQ Accounts 0% Drop]',
        category: 'YouTube Subscribers',
        ratePer1000: 18.50,
        minQuantity: 100,
        maxQuantity: 10000,
        status: 'active',
        speed: 'Speed: 500-2000/Day (Organic)',
        description: 'HQ non-drop channel subscribers. Tested and verified on FineSMM (Service ID 4035).',
        providerId: provider1._id,
        providerServiceId: '4035',
      },
      {
        name: 'YouTube Watch Hours [PrimeSMM 4000h Package]',
        category: 'YouTube Watch Hours',
        ratePer1000: 24.00,
        minQuantity: 500,
        maxQuantity: 4000,
        status: 'active',
        speed: 'Delivery: 48 Hours',
        description: 'Watch hours booster package routed dynamically via PrimeSMM API.',
        providerId: provider2._id,
        providerServiceId: '401',
      },
      {
        name: 'Instagram Organic Likes [JAP Instant Delivery]',
        category: 'Instagram Likes',
        ratePer1000: 0.80,
        minQuantity: 100,
        maxQuantity: 50000,
        status: 'active',
        speed: 'Instant (10k/Hour)',
        description: 'Super fast Instagram post and reel likes routed dynamically via JAP API.',
        providerId: provider3._id,
        providerServiceId: '501',
      },
      {
        name: 'Instagram Followers [JAP Real Profiles]',
        category: 'Instagram Followers',
        ratePer1000: 4.50,
        minQuantity: 100,
        maxQuantity: 25000,
        status: 'active',
        speed: 'Speed: 2k/Day',
        description: 'High quality Instagram followers routed dynamically via JAP API.',
        providerId: provider3._id,
        providerServiceId: '502',
      },
    ];

    console.log('[Seed] Inserting Verified SMM Services...');
    const insertedServices = await Service.insertMany(initialServices);
    console.log(`[Seed Success] Inserted ${insertedServices.length} SMM Services with verified FineSMM Service IDs (4351, 3287, 4035).`);

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
    console.log(' DYNAMIC SMM PROVIDERS LOADED:');
    console.log(`   1. ${provider1.name}: ${provider1.apiUrl}`);
    console.log(`   2. ${provider2.name}: ${provider2.apiUrl}`);
    console.log(`   3. ${provider3.name}: ${provider3.apiUrl}`);
    console.log('------------------------------------------------');
    console.log(' VERIFIED FINESMM SERVICE IDS:');
    console.log('   YouTube Likes:       ID 4351 (Min: 50)');
    console.log('   YouTube Views:       ID 3287 (Min: 100)');
    console.log('   YouTube Subscribers: ID 4035 (Min: 100)');
    console.log('------------------------------------------------');
    console.log(' ADMIN CREDENTIALS:');
    console.log('   Email/Login: admin@smm.com (or username: admin)');
    console.log('   Password:    Admin@12345');
    console.log('   Role:        admin (isUnlimited: true, balance: $999,999)');
    console.log('================================================\n');

    process.exit(0);
  } catch (error) {
    console.error('[Seed Error]', error);
    process.exit(1);
  }
};

seedDatabase();
