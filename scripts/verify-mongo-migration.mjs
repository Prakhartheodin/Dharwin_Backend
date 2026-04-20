/**
 * Verify Atlas → local migration: per-collection document counts + extras on target.
 *
 *   npm run mongo:verify-migration
 *
 * Set MONGO_SOURCE_URI for Atlas, or rely on MONGODB_URL in .env when it contains mongodb+srv.
 * MONGO_TARGET_URI defaults to mongodb://127.0.0.1:27017
 * MONGO_DB_NAME defaults to name parsed from source URI, else uat-dharwin
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

const TARGET_URI = (process.env.MONGO_TARGET_URI || 'mongodb://127.0.0.1:27017').trim();

function pickSourceUri() {
  const explicit = (process.env.MONGO_SOURCE_URI || '').trim();
  if (explicit) return explicit;
  const m = (process.env.MONGODB_URL || '').trim();
  if (m.includes('mongodb+srv')) return m;
  return '';
}

function mask(u) {
  return u.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@');
}

async function collectionNames(db) {
  const cols = await db.listCollections({ type: 'collection' }).toArray();
  return cols.map((c) => c.name).filter((n) => !n.startsWith('system.'));
}

async function main() {
  const SOURCE_URI = pickSourceUri();
  if (!SOURCE_URI) {
    console.error(
      'No Atlas source URI. Set MONGO_SOURCE_URI, or set MONGODB_URL in .env to your mongodb+srv Atlas URL.'
    );
    process.exit(1);
  }

  const DB_NAME = (
    process.env.MONGO_DB_NAME ||
    dbNameFromMongoUri(SOURCE_URI) ||
    'uat-dharwin'
  ).trim();

  const src = new MongoClient(SOURCE_URI);
  const dst = new MongoClient(TARGET_URI);
  await src.connect();
  await dst.connect();

  const sdb = src.db(DB_NAME);
  const ddb = dst.db(DB_NAME);

  const [sourceNames, targetNames] = await Promise.all([collectionNames(sdb), collectionNames(ddb)]);
  const sourceSet = new Set(sourceNames);
  const targetSet = new Set(targetNames);
  const onlyOnTarget = targetNames.filter((n) => !sourceSet.has(n)).sort();
  const onlyOnSource = sourceNames.filter((n) => !targetSet.has(n)).sort();
  const names = sourceNames.sort();

  const rows = [];
  let sumSource = 0;
  let sumTarget = 0;

  for (const name of names) {
    const [sc, dc] = await Promise.all([
      sdb.collection(name).countDocuments({}),
      ddb.collection(name).countDocuments({}),
    ]);
    sumSource += sc;
    sumTarget += dc;
    rows.push({ name, source: sc, target: dc, ok: sc === dc });
  }

  const onlyOnSourceCounts = [];
  for (const n of onlyOnSource) {
    onlyOnSourceCounts.push({ name: n, count: await sdb.collection(n).countDocuments({}) });
  }

  await src.close();
  await dst.close();

  const bad = rows.filter((r) => !r.ok);

  console.log(`Source: ${mask(SOURCE_URI)}  db=${DB_NAME}`);
  console.log(`Target: ${TARGET_URI}  db=${DB_NAME}`);
  console.log(`Collections on source: ${names.length}`);
  console.log(`Collections on target: ${targetNames.length}`);
  console.log(`Total documents (source): ${sumSource}`);
  console.log(`Total documents (target): ${sumTarget}`);
  console.log(`Per-collection match: ${rows.length - bad.length}  Mismatch: ${bad.length}\n`);

  const onlyOnSourceNonEmpty = onlyOnSourceCounts.filter((x) => x.count > 0);
  if (onlyOnSourceNonEmpty.length) {
    console.log('Collections listed on Atlas but not on local (non-empty — investigate):');
    for (const { name: n, count: c } of onlyOnSourceNonEmpty) {
      console.log(`  ${n} (${c} docs on Atlas)`);
    }
    console.log('');
  } else if (onlyOnSourceCounts.length) {
    console.log(
      `Note: ${onlyOnSourceCounts.length} empty collection(s) appear in Atlas listCollections but not on local; ` +
        'MongoDB often omits empty namespaces locally — document totals still compared per name.\n'
    );
  }

  if (onlyOnTarget.length) {
    console.log('Collections present only on local (not on Atlas):');
    for (const n of onlyOnTarget) {
      console.log(`  ${n}`);
    }
    console.log('');
  }

  if (bad.length) {
    console.log('Mismatches (Atlas → local count):');
    for (const r of bad) {
      console.log(`  ${r.name}: ${r.source} → ${r.target}`);
    }
    process.exit(1);
  }

  if (sumSource !== sumTarget) {
    console.error(`Total document counts differ (${sumSource} vs ${sumTarget}).`);
    process.exit(1);
  }

  console.log('OK: all source collections match local document counts; totals match.');
  if (onlyOnTarget.length === 0) {
    console.log('OK: no extra collections on local.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
