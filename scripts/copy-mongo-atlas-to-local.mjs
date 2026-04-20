/**
 * Copy one database from Atlas (or any MongoDB) to local.
 *
 * Usage (PowerShell, from uat.dharwin.backend):
 *   $env:MONGO_SOURCE_URI="mongodb+srv://USER:PASS@cluster.../your-db"
 *   $env:MONGO_TARGET_URI="mongodb://127.0.0.1:27017"
 *   $env:MONGO_DB_NAME="your-db"
 *   npm run mongo:copy-atlas-to-local
 *
 * If MONGO_DB_NAME is omitted, the DB name is taken from MONGO_SOURCE_URI (path after host),
 * else from MONGODB_URL in .env when it is mongodb+srv.
 *
 * Set MONGO_COPY_DRY_RUN=1 to only list collections and counts.
 */
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

/** @param {string} uri */
function dbNameFromMongoUri(uri) {
  if (!uri || typeof uri !== 'string') return '';
  const noQuery = uri.split('?')[0];
  const afterProtocol = noQuery.replace(/^mongodb(\+srv)?:\/\//, '');
  const slash = afterProtocol.indexOf('/');
  if (slash === -1) return '';
  const name = afterProtocol.slice(slash + 1).split('/')[0].trim();
  return name || '';
}

const explicitSource = (process.env.MONGO_SOURCE_URI || '').trim();
const envMongo = (process.env.MONGODB_URL || '').trim();
const SOURCE_URI = explicitSource || (envMongo.includes('mongodb+srv') ? envMongo : '');

const TARGET_URI = (process.env.MONGO_TARGET_URI || 'mongodb://127.0.0.1:27017').trim();
const DB_NAME = (
  process.env.MONGO_DB_NAME ||
  dbNameFromMongoUri(explicitSource || envMongo) ||
  'uat-dharwin'
).trim();

const BATCH = Math.max(100, Math.min(5000, Number(process.env.MONGO_COPY_BATCH) || 1000));
const DRY = process.env.MONGO_COPY_DRY_RUN === '1' || process.env.MONGO_COPY_DRY_RUN === 'true';

function assertNoSameHostDanger() {
  try {
    const s = new URL(SOURCE_URI.replace(/^mongodb\+srv:/, 'https:'));
    const t = new URL(TARGET_URI.replace(/^mongodb(\+srv)?:/, 'http:'));
    const sp = s.port || (s.protocol === 'https:' ? '443' : '');
    const tp = t.port || (t.protocol === 'http:' ? '80' : '');
    if (s.hostname === t.hostname && sp === tp) {
      throw new Error('Source and target URIs resolve to the same host:port. Refusing to run.');
    }
  } catch (e) {
    if (e && e.message && e.message.startsWith('Source and target')) throw e;
  }
}

async function copyCollection(sourceDb, targetDb, name) {
  const src = sourceDb.collection(name);
  const dst = targetDb.collection(name);

  const count = await src.estimatedDocumentCount();
  if (count === 0) {
    await dst.deleteMany({});
    return { inserted: 0 };
  }

  await dst.deleteMany({});

  let inserted = 0;
  const cursor = src.find({}, { batchSize: BATCH });
  let batch = [];

  for await (const doc of cursor) {
    batch.push(doc);
    if (batch.length >= BATCH) {
      await dst.insertMany(batch, { ordered: false });
      inserted += batch.length;
      batch = [];
    }
  }
  if (batch.length) {
    await dst.insertMany(batch, { ordered: false });
    inserted += batch.length;
  }

  const indexes = await src.indexes();
  for (const spec of indexes) {
    const { key, v, ns, ...options } = spec;
    if (!key || Object.keys(key).length === 0) continue;
    if (Object.keys(key).length === 1 && key._id === 1) continue;
    try {
      await dst.createIndex(key, options);
    } catch (e) {
      if (e && e.codeName === 'IndexOptionsConflict') continue;
      if (e && e.codeName === 'IndexAlreadyExists') continue;
      throw e;
    }
  }

  return { inserted };
}

async function main() {
  if (!SOURCE_URI) {
    console.error(
      'Missing source URI. Set MONGO_SOURCE_URI, or set MONGODB_URL in .env to a mongodb+srv Atlas URL.'
    );
    process.exit(1);
  }

  assertNoSameHostDanger();

  const sourceClient = new MongoClient(SOURCE_URI);
  const targetClient = new MongoClient(TARGET_URI);

  await sourceClient.connect();
  await targetClient.connect();

  const sourceDb = sourceClient.db(DB_NAME);
  const targetDb = targetClient.db(DB_NAME);

  const cols = await sourceDb.listCollections({ type: 'collection' }).toArray();
  const names = cols.map((c) => c.name).filter((n) => !n.startsWith('system.'));

  console.log(`Source: ${maskUri(SOURCE_URI)}  db=${DB_NAME}`);
  console.log(`Target: ${maskUri(TARGET_URI)}  db=${DB_NAME}`);
  console.log(`Collections: ${names.length}${DRY ? ' (dry run)' : ''}\n`);

  for (const name of names) {
    const n = await sourceDb.collection(name).estimatedDocumentCount();
    if (DRY) {
      console.log(`  ${name}: ~${n} documents`);
      continue;
    }
    process.stdout.write(`  ${name}: copying...`);
    const { inserted } = await copyCollection(sourceDb, targetDb, name);
    console.log(` ${inserted} documents, indexes synced`);
  }

  await sourceClient.close();
  await targetClient.close();

  if (DRY) {
    console.log('\nDry run only. Unset MONGO_COPY_DRY_RUN to copy.');
  } else {
    console.log(`\nDone. Point local MONGODB_URL at ${TARGET_URI.replace(/\/$/, '')}/${DB_NAME}`);
  }
}

function maskUri(uri) {
  return uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
