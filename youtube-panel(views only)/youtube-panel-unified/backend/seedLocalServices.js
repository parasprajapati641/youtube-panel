/**
 * Seed 3 services that map to local Playwright bot:
 * YouTube Likes / Comments / Subscribers
 * Run: node seedLocalServices.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Service = require('./models/Service');

const services = [
  {
    name: 'YouTube Likes',
    category: 'YouTube Likes',
    ratePer1000: 1,
    minQuantity: 1,
    maxQuantity: 50,
    status: 'active',
    speed: 'Local bot – uses registered accounts',
    description: 'Likes via your Playwright bot. Quantity = number of bots (max 50).',
    providerServiceId: 'local-like',
  },
  {
    name: 'YouTube Views',
    category: 'YouTube Views',
    ratePer1000: 0.5,
    minQuantity: 1,
    maxQuantity: 50,
    status: 'active',
    speed: 'Local bot – extended watch time',
    description:
      'Views via local bot (long watch, no like). Quantity = bots. Duration: VIEW_WATCH_TIME_MIN/MAX in .env (default 180–360s).',
    providerServiceId: 'local-view',
  },
  {
    name: 'YouTube Watch Hours',
    category: 'YouTube Watch Hours',
    ratePer1000: 5,
    minQuantity: 1,
    maxQuantity: 20,
    status: 'active',
    speed: 'Local bot – 80–90% of video length',
    description:
      'Watch hours via local bot. Each bot watches 80–90% of the video length (WATCH_HOUR_PCT_MIN/MAX). Quantity = bots.',
    providerServiceId: 'local-watch-hour',
  },
  {
    name: 'YouTube Comments',
    category: 'YouTube Comments',
    ratePer1000: 2,
    minQuantity: 1,
    maxQuantity: 50,
    status: 'active',
    speed: 'Local bot',
    description: 'Comments via local bot. Quantity = bots. Optional custom comments on order.',
    providerServiceId: 'local-comment',
  },
  {
    name: 'YouTube Subscribers',
    category: 'YouTube Subscribers',
    ratePer1000: 3,
    minQuantity: 1,
    maxQuantity: 50,
    status: 'active',
    speed: 'Local bot',
    description: 'Subscribe via local bot. Link = channel or video URL. Quantity = bots.',
    providerServiceId: 'local-subscribe',
  },
];

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  for (const s of services) {
    const existing = await Service.findOne({ name: s.name });
    if (existing) {
      await Service.updateOne({ _id: existing._id }, s);
      console.log('Updated:', s.name);
    } else {
      await Service.create(s);
      console.log('Created:', s.name);
    }
  }
  console.log('Done. Deactivate old third-party services from Admin if needed.');
  process.exit(0);
}
run().catch((e) => {
  console.error(e);
  process.exit(1);
});
