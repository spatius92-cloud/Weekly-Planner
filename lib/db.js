// --- storage abstraction ---------------------------------------------------
// Locally (and anywhere without Redis configured) we read/write the JSON file
// in ./data so `npm run dev` keeps working with zero setup.
//
// On Vercel, the filesystem is read-only and ephemeral, so once a Redis store
// is connected (Vercel Storage → Upstash for Redis, which sets KV_REST_API_URL
// / KV_REST_API_TOKEN automatically) we persist the same JSON blob under a
// single key there instead.

const fs = require('fs/promises');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');
const REDIS_KEY = 'weekly-planner:db';

const DEFAULT_DB = { members: [], tasks: [] };

const hasRedis = Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

let redisClient = null;
function getRedis() {
  if (!redisClient) {
    const { Redis } = require('@upstash/redis');
    redisClient = Redis.fromEnv();
  }
  return redisClient;
}

async function readDB() {
  if (hasRedis) {
    const db = await getRedis().get(REDIS_KEY);
    return db || DEFAULT_DB;
  }
  try {
    const raw = await fs.readFile(DB_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return DEFAULT_DB;
    throw err;
  }
}

// Writes are serialized through a promise chain so concurrent requests never
// clobber each other's changes.
let writeQueue = Promise.resolve();

function writeDB(db) {
  writeQueue = writeQueue.then(() =>
    hasRedis ? getRedis().set(REDIS_KEY, db) : fs.writeFile(DB_PATH, JSON.stringify(db, null, 2))
  );
  return writeQueue;
}

module.exports = { readDB, writeDB, hasRedis };
