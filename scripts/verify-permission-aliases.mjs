/**
 * Quick sanity checks for permission alias wiring (run: node scripts/verify-permission-aliases.mjs).
 * Does not start the HTTP server.
 */
import assert from 'assert';
import { getGrantingPermissions } from '../src/config/permissions.js';

assert(
  getGrantingPermissions('modules.read').includes('evaluation.read'),
  'modules.read should grant evaluation.read (training evaluation vs curriculum API)'
);
assert(
  getGrantingPermissions('emails.read').includes('emails.read'),
  'emails.read alias entry should exist'
);
assert(
  getGrantingPermissions('files-storage.read').includes('files-storage.read'),
  'files-storage.read alias entry should exist'
);
assert(
  getGrantingPermissions('uploads.document').includes('candidates.manage'),
  'uploads.document should include candidates.manage'
);

console.log('verify-permission-aliases: OK');
