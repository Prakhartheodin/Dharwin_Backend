/* eslint-disable no-console -- manual CLI smoke script */
import { createActivityLog } from './services/activityLog.service.js';
import mongoose from 'mongoose';
import ActivityLog from './models/activityLog.model.js';

// Mock ActivityLog model
const mockCreate = async (entry) => {
  console.log('--- Activity Log Entry Created ---');
  console.log(JSON.stringify(entry, null, 2));
  return entry;
};

// We need to bypass the real Mongoose model for this test
// This is a bit hacky but works for a quick logic check
ActivityLog.create = mockCreate;

async function test() {
  const reqWithXClientIp = {
    get: (name) => {
      const headers = {
        'x-client-ip': '203.0.113.55',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      };
      return headers[name.toLowerCase()];
    },
    ip: '10.0.0.1',
    method: 'POST',
    originalUrl: '/v1/test',
  };

  console.log('Testing: x-client-ip stored separately from server ip, geo prefers client...');
  await createActivityLog(
    new mongoose.Types.ObjectId(),
    'test.action',
    'TestEntity',
    'entity-123',
    { foo: 'bar' },
    reqWithXClientIp
  );

  const reqNoClientIp = {
    get: (name) => {
      if (name.toLowerCase() === 'user-agent') return 'Mozilla/5.0';
      return null;
    },
    ip: '10.0.0.5',
    method: 'GET',
    originalUrl: '/v1/test-fallback',
  };

  console.log('\nTesting server ip only (no x-client-ip)...');
  await createActivityLog(
    new mongoose.Types.ObjectId(),
    'test.fallback',
    'TestEntity',
    'entity-456',
    {},
    reqNoClientIp
  );
}

test().then(() => console.log('\nTest finished.'));
