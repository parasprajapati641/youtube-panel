const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

dotenv.config();

const User = require('./models/User');
const Service = require('./models/Service');
const ApiProvider = require('./models/ApiProvider');
const Setting = require('./models/Setting');
const connectDB = require('./config/db');
const { syncSmmShibaServices, getOrUpdateSmmShibaProvider } = require('./services/syncService');

const seedDatabase = async () => {
  try {
    await connectDB();

    console.log('[Seed] Clearing existing collections...');
    await User.deleteMany({});
    await Service.deleteMany({});
    await ApiProvider.deleteMany({});
    await Setting.deleteMany({});

    console.log('[Seed] Seeding Primary SMMShiba Provider into Database...');
    const smmShibaProvider = await getOrUpdateSmmShibaProvider();
    console.log(`[Seed Success] Primary Provider created: ${smmShibaProvider.name} (${smmShibaProvider.apiUrl})`);

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

    console.log('[Seed] Creating Default Settings with 20% Profit Margin...');
    await Setting.create({
      providerApiKey: smmShibaProvider.apiKey,
      providerApiUrl: smmShibaProvider.apiUrl,
      siteName: 'YouTube & Social SMM Panel',
      defaultProfitMargin: 20,
      categoryMargins: {},
    });
    console.log('[Seed Success] Default Settings created.');

    console.log('[Seed] Synchronizing live service catalog from SMMShiba API v2...');
    const syncResult = await syncSmmShibaServices();
    if (syncResult.success) {
      console.log(`[Seed Success] Synced ${syncResult.totalFetched} services from SMMShiba API (${syncResult.addedCount} added, ${syncResult.updatedCount} updated).`);
    } else {
      console.warn(`[Seed Warning] Service sync encountered an issue: ${syncResult.error}`);
    }

    console.log('\n================================================');
    console.log(' SEED COMPLETED SUCCESSFULLY!');
    console.log('================================================');
    console.log(' PROVIDER INTEGRATION: SMMShiba API v2');
    console.log(`   Base URL: ${smmShibaProvider.apiUrl}`);
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
