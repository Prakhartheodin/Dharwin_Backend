/* eslint-disable no-console */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env'), override: true });

const MONGODB_URL = process.env.MONGODB_URL;
if (!MONGODB_URL) {
  console.error('MONGODB_URL not set');
  process.exit(1);
}

const EMP_ROLE_IDS = [
  '69eefaba9453cde8e5984dad', // Candidate
  '69b043afb3813420fa1a53af', // Employee
];

const ADMIN_ID = '6981ad6ede000311e0a4a389';

async function run() {
  try {
    await mongoose.connect(MONGODB_URL);

    const users = mongoose.connection.db.collection('users');
    const empRoleOids = EMP_ROLE_IDS.map(id => new mongoose.Types.ObjectId(id));
    const adminOid = new mongoose.Types.ObjectId(ADMIN_ID);

    const total = await users.countDocuments({ roleIds: { $in: empRoleOids } });
    console.log(`\nTotal users with Employee/Candidate role: ${total}`);

    const withAdminId = await users.countDocuments({
      roleIds: { $in: empRoleOids },
      adminId: adminOid,
    });
    console.log(`  with adminId=${ADMIN_ID}: ${withAdminId}`);

    const noAdminId = await users.countDocuments({
      roleIds: { $in: empRoleOids },
      adminId: { $exists: false },
    });
    console.log(`  with NO adminId field: ${noAdminId}`);

    const nullAdminId = await users.countDocuments({
      roleIds: { $in: empRoleOids },
      adminId: null,
    });
    console.log(`  with adminId=null: ${nullAdminId}`);

    const distinctAdminIds = await users.distinct('adminId', {
      roleIds: { $in: empRoleOids },
    });
    console.log(
      `  distinct adminId values (${distinctAdminIds.length}):`,
      distinctAdminIds.map(String)
    );

    const sample = await users
      .find({ roleIds: { $in: empRoleOids } })
      .project({ name: 1, email: 1, adminId: 1, status: 1 })
      .limit(5)
      .toArray();

    console.log('\nSample employee users:');
    sample.forEach(u =>
      console.log(`  name=${u.name} adminId=${u.adminId} status=${u.status}`)
    );

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await mongoose.disconnect();
  }
}

run();