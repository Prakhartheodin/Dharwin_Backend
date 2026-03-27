/**
 * Seed script: Creates the Recruiter role if it does not exist.
 * The ATS Recruiters page lists only users whose roleIds include this role
 * (GET /users?role=recruiter → Role.name === "Recruiter", status active).
 *
 * Run: npm run seed:recruiter-role
 * Requires: .env with MONGODB_URL
 *
 * After seeding, assign this role in Settings → Users/Roles or via admin recruiter registration.
 * You may edit permissions on the role in the admin UI without re-running this script.
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Role from '../src/models/role.model.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const MONGODB_URL = process.env.MONGODB_URL;
if (!MONGODB_URL) {
  console.error('MONGODB_URL is required. Set it in .env');
  process.exit(1);
}

/** Default ATS permissions for recruiters; adjust in app Settings → Roles if needed. */
const RECRUITER_ROLE = {
  name: 'Recruiter',
  permissions: [
    'ats.recruiters:view,create,edit,delete',
    'ats.candidates:view,create,edit,delete',
    'ats.jobs:view,create,edit,delete',
    'ats.interviews:view,create,edit,delete',
    'ats.my-profile:view,create,edit,delete',
    'ats.analytics:view',
    'communication.meetings:view,create,edit,delete',
    'communication.chats:view,create,edit,delete',
    'communication.calling:view,create,edit,delete',
    'communication.emails:view,create,edit,delete',
  ],
  status: 'active',
};

async function run() {
  await mongoose.connect(MONGODB_URL);
  console.log('Connected to MongoDB');

  const existing = await Role.findOne({ name: RECRUITER_ROLE.name });
  if (existing) {
    console.log(`Recruiter role already exists (id: ${existing._id}, status: ${existing.status}).`);
    if (existing.status !== 'active') {
      existing.status = 'active';
      await existing.save();
      console.log('Set status to active.');
    }
    await mongoose.disconnect();
    process.exit(0);
    return;
  }

  const role = await Role.create(RECRUITER_ROLE);
  console.log(`Created Recruiter role (id: ${role._id}) with ${RECRUITER_ROLE.permissions.length} permission entries.`);
  console.log('Assign this role to users who should appear on ATS → Recruiters.');

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
