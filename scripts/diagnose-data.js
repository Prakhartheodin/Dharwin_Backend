import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });

const MONGO_URL = process.env.MONGODB_URL || process.env.MONGO_URI || process.env.DATABASE_URL;
if (!MONGO_URL) {
  console.error('No MongoDB URL found in env. Set MONGODB_URL.');
  process.exit(1);
}

// ── Minimal inline schemas (read-only, no hooks) ────────────────────────────
const roleSchema = new mongoose.Schema({ name: String }, { strict: false });
const userSchema = new mongoose.Schema(
  { name: String, email: String, adminId: mongoose.Schema.Types.ObjectId, roleIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Role' }], status: String },
  { strict: false }
);
const studentSchema = new mongoose.Schema({ user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, skills: [String] }, { strict: false });
const employeeSchema = new mongoose.Schema(
  { fullName: String, adminId: mongoose.Schema.Types.ObjectId, isActive: Boolean, department: String, designation: String },
  { strict: false }
);
const jobSchema = new mongoose.Schema(
  { title: String, status: String, jobOrigin: String, jobType: String, location: String, skillTags: [String], createdBy: mongoose.Schema.Types.ObjectId },
  { strict: false }
);

const Role = mongoose.models.Role || mongoose.model('Role', roleSchema);
const User = mongoose.models.User || mongoose.model('User', userSchema);
const Student = mongoose.models.Student || mongoose.model('Student', studentSchema);
const Employee = mongoose.models.Employee || mongoose.model('Employee', employeeSchema);
const Job = mongoose.models.Job || mongoose.model('Job', jobSchema);

// ── Helpers ─────────────────────────────────────────────────────────────────
function hr(label) {
  console.log('\n' + '─'.repeat(60));
  console.log(`  ${label}`);
  console.log('─'.repeat(60));
}

function pct(n, total) {
  return total ? ` (${((n / total) * 100).toFixed(1)}%)` : '';
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  await mongoose.connect(MONGO_URL);
  console.log('Connected to MongoDB');

  // ── ROLES ──────────────────────────────────────────────────────────────────
  hr('ALL ROLES');
  const roles = await Role.find({}, { name: 1 }).lean();
  const roleById = Object.fromEntries(roles.map((r) => [String(r._id), r.name]));
  console.table(roles.map((r) => ({ _id: String(r._id), name: r.name })));

  // ── USERS ──────────────────────────────────────────────────────────────────
  hr('ALL USERS WITH ROLES');
  const users = await User.find({}, { name: 1, email: 1, adminId: 1, roleIds: 1, status: 1 }).lean();
  const summary = { admins: 0, subUsers: 0, noAdminId: 0 };
  const roleCounts = {};

  const userRows = users.map((u) => {
    const roleNames = (u.roleIds ?? []).map((id) => roleById[String(id)] ?? String(id)).join(', ') || '—';
    (u.roleIds ?? []).forEach((id) => {
      const n = roleById[String(id)] ?? String(id);
      roleCounts[n] = (roleCounts[n] ?? 0) + 1;
    });
    if (!u.adminId) summary.admins++;
    else summary.subUsers++;
    if (!u.adminId) summary.noAdminId++;
    return {
      _id: String(u._id),
      name: u.name ?? '—',
      email: u.email ?? '—',
      adminId: u.adminId ? String(u.adminId) : 'IS_ADMIN',
      status: u.status ?? '—',
      roles: roleNames,
    };
  });
  console.table(userRows);

  console.log(`\nTotal users: ${users.length}`);
  console.log(`  Admins (no adminId): ${summary.admins}`);
  console.log(`  Sub-users (has adminId): ${summary.subUsers}`);
  console.log('\nUsers per role:');
  console.table(Object.entries(roleCounts).map(([role, count]) => ({ role, count })));

  // ── STUDENTS ───────────────────────────────────────────────────────────────
  hr('STUDENTS — adminId resolution analysis');
  const students = await Student.find({}, { user: 1, skills: 1 }).lean();
  const studentUserIds = [...new Set(students.map((s) => String(s.user)))];
  const linkedUsers = await User.find({ _id: { $in: studentUserIds } }, { adminId: 1, name: 1 }).lean();
  const linkedMap = Object.fromEntries(linkedUsers.map((u) => [String(u._id), u]));

  let eligible = 0;
  let orphaned = 0;
  const studentRows = students.map((s) => {
    const u = linkedMap[String(s.user)];
    const hasAdminId = !!u?.adminId;
    if (hasAdminId) eligible++; else orphaned++;
    return {
      studentId: String(s._id),
      userId: String(s.user),
      userName: u?.name ?? 'NOT FOUND',
      adminId: u?.adminId ? String(u.adminId) : (u ? 'IS_ADMIN/null' : 'USER_MISSING'),
      embeddable: hasAdminId ? 'YES' : 'NO',
      skills: (s.skills ?? []).join(', ') || '—',
    };
  });
  console.table(studentRows);
  console.log(`\nTotal students: ${students.length}${pct(students.length, students.length)}`);
  console.log(`  Eligible for embedding: ${eligible}${pct(eligible, students.length)}`);
  console.log(`  Orphaned (user is admin or missing): ${orphaned}${pct(orphaned, students.length)}`);

  // ── EMPLOYEES ──────────────────────────────────────────────────────────────
  hr('EMPLOYEES — grouped by adminId');
  const employees = await Employee.find(
    {},
    { fullName: 1, adminId: 1, isActive: 1, department: 1, designation: 1 }
  ).lean();

  const byAdmin = {};
  employees.forEach((e) => {
    const key = e.adminId ? String(e.adminId) : 'NO_ADMIN_ID';
    if (!byAdmin[key]) byAdmin[key] = { adminId: key, total: 0, active: 0, inactive: 0 };
    byAdmin[key].total++;
    if (e.isActive) byAdmin[key].active++; else byAdmin[key].inactive++;
  });
  console.table(Object.values(byAdmin));
  console.log(`\nTotal employees: ${employees.length}`);
  console.log(`  With adminId: ${employees.filter((e) => e.adminId).length}`);
  console.log(`  Without adminId: ${employees.filter((e) => !e.adminId).length}`);

  // Sample 10 employees
  console.log('\nSample employees (first 10):');
  console.table(
    employees.slice(0, 10).map((e) => ({
      _id: String(e._id),
      fullName: e.fullName ?? '—',
      adminId: e.adminId ? String(e.adminId) : 'MISSING',
      isActive: e.isActive,
      department: e.department ?? '—',
      designation: e.designation ?? '—',
    }))
  );

  // ── JOBS ───────────────────────────────────────────────────────────────────
  hr('JOBS — status / origin / type');
  const jobs = await Job.find(
    {},
    { title: 1, status: 1, jobOrigin: 1, jobType: 1, location: 1, skillTags: 1, createdBy: 1 }
  ).lean();

  // Distribution tables
  const statusDist = {};
  const originDist = {};
  const typeDist = {};
  jobs.forEach((j) => {
    statusDist[j.status ?? 'null'] = (statusDist[j.status ?? 'null'] ?? 0) + 1;
    originDist[j.jobOrigin ?? 'null'] = (originDist[j.jobOrigin ?? 'null'] ?? 0) + 1;
    typeDist[j.jobType ?? 'null'] = (typeDist[j.jobType ?? 'null'] ?? 0) + 1;
  });
  console.log('\nBy status:');
  console.table(Object.entries(statusDist).map(([v, c]) => ({ status: v, count: c })));
  console.log('\nBy jobOrigin:');
  console.table(Object.entries(originDist).map(([v, c]) => ({ jobOrigin: v, count: c })));
  console.log('\nBy jobType:');
  console.table(Object.entries(typeDist).map(([v, c]) => ({ jobType: v, count: c })));

  console.log('\nAll jobs:');
  console.table(
    jobs.map((j) => ({
      _id: String(j._id),
      title: (j.title ?? '—').slice(0, 40),
      status: j.status ?? '—',
      jobOrigin: j.jobOrigin ?? '—',
      jobType: j.jobType ?? '—',
      location: (j.location ?? '—').slice(0, 20),
      skills: (j.skillTags ?? []).slice(0, 3).join(', ') || '—',
      createdBy: j.createdBy ? String(j.createdBy) : 'MISSING',
    }))
  );
  console.log(`\nTotal jobs: ${jobs.length}`);

  await mongoose.disconnect();
  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
