const { test, after } = require('node:test');
const assert = require('node:assert/strict');
process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 2).toString('base64');
const { encryptValue, decryptValue, hashPassword, signSession } = require('../crypto');

const mockUsers = [
  {
    id: 'superadmin-1',
    username: encryptValue('superadmin', 'users.username'),
    password: hashPassword('superadminpass123'),
    full_name: encryptValue('Super Admin', 'users.full_name'),
    role: encryptValue('superadmin', 'users.role'),
    approved: true
  },
  {
    id: 'admin-1',
    username: encryptValue('admin', 'users.username'),
    password: hashPassword('adminpassword123'),
    full_name: encryptValue('Admin User', 'users.full_name'),
    role: encryptValue('admin', 'users.role'),
    approved: true
  },
  {
    id: 'pending-1',
    username: encryptValue('pendinguser', 'users.username'),
    password: hashPassword('pendingpass123'),
    full_name: encryptValue('Pending User', 'users.full_name'),
    role: encryptValue('deleg', 'users.role'),
    approved: false
  }
];

let insertedRecords = [];

require.cache[require.resolve('../db')] = {
  exports: {
    pool: {},
    supabaseRequested: true,
    initDb: async () => {},
    checkDbConnection: async () => ({}),
    supabase: {
      from: (tableName) => {
        assert.equal(tableName, 'users');
        return {
          select: (fields) => ({
            eq: (col, val) => ({
              order: async () => ({ data: mockUsers.filter(u => !u.approved), error: null }),
              maybeSingle: async () => {
                const found = mockUsers.find(u => u.id === val);
                return { data: found || null, error: null };
              }
            }),
            order: async () => ({ data: mockUsers, error: null }),
            then: (resolve) => resolve({ data: mockUsers, error: null })
          }),
          insert: (payload) => {
            insertedRecords.push(payload);
            return {
              select: () => ({
                single: async () => ({
                  data: {
                    id: 'new-id',
                    username: payload.username,
                    full_name: payload.full_name,
                    role: payload.role,
                    approved: payload.approved
                  },
                  error: null
                })
              })
            };
          },
          update: (payload) => ({
            eq: (col, val) => ({
              select: () => ({
                maybeSingle: async () => ({ data: { id: val }, error: null })
              })
            })
          }),
          delete: () => ({
            eq: (col, val) => ({
              select: () => ({
                maybeSingle: async () => ({ data: { id: val }, error: null })
              })
            })
          })
        };
      }
    }
  }
};

const server = require('../server').listen(0, '127.0.0.1');
after(() => new Promise(resolve => server.close(resolve)));

const adminHeaders = {
  Authorization: `Bearer ${signSession({ id: 'admin-1', role: 'admin' })}`,
  'Content-Type': 'application/json'
};

const superadminHeaders = {
  Authorization: `Bearer ${signSession({ id: 'superadmin-1', role: 'superadmin' })}`,
  'Content-Type': 'application/json'
};

const url = path => `http://127.0.0.1:${server.address().port}${path}`;

test('unauthenticated or non-admin user creation always sets approved: false and role: deleg', async () => {
  insertedRecords = [];
  const res = await fetch(url('/api/users'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fullName: 'New Person',
      username: 'newperson',
      password: 'password123',
      role: 'admin',
      approved: true
    })
  });

  assert.equal(res.status, 201);
  const json = await res.json();
  assert.equal(json.success, true);
  assert.equal(json.data.approved, false);
  assert.equal(json.data.role, 'deleg');
  assert.match(json.message, /waiting for administrator approval/i);

  const lastInserted = insertedRecords[insertedRecords.length - 1];
  assert.equal(lastInserted.approved, false);
  assert.equal(decryptValue(lastInserted.role, 'users.role'), 'deleg');
});

test('admin can create a pre-approved deleg or admin user account directly', async () => {
  insertedRecords = [];
  const res = await fetch(url('/api/users'), {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      fullName: 'Approved Deleg',
      username: 'approveddeleg',
      password: 'password123',
      role: 'deleg',
      approved: true
    })
  });

  assert.equal(res.status, 201);
  const json = await res.json();
  assert.equal(json.success, true);
  assert.equal(json.data.approved, true);
  assert.equal(json.data.role, 'deleg');
  assert.match(json.message, /created successfully/i);

  const lastInserted = insertedRecords[insertedRecords.length - 1];
  assert.equal(lastInserted.approved, true);
  assert.equal(decryptValue(lastInserted.role, 'users.role'), 'deleg');
});

test('admin cannot grant the superadmin role', async () => {
  const res = await fetch(url('/api/users'), {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      fullName: 'Attempted Superadmin',
      username: 'attemptsuper',
      password: 'password123',
      role: 'superadmin',
      approved: true
    })
  });

  assert.equal(res.status, 403);
  const json = await res.json();
  assert.equal(json.success, false);
  assert.match(json.error, /only superadministrators can grant the superadmin role/i);
});

test('superadmin can create a pre-approved superadmin account directly', async () => {
  insertedRecords = [];
  const res = await fetch(url('/api/users'), {
    method: 'POST',
    headers: superadminHeaders,
    body: JSON.stringify({
      fullName: 'New Super Admin',
      username: 'newsuperadmin',
      password: 'password123',
      role: 'superadmin',
      approved: true
    })
  });

  assert.equal(res.status, 201);
  const json = await res.json();
  assert.equal(json.success, true);
  assert.equal(json.data.approved, true);
  assert.equal(json.data.role, 'superadmin');

  const lastInserted = insertedRecords[insertedRecords.length - 1];
  assert.equal(lastInserted.approved, true);
  assert.equal(decryptValue(lastInserted.role, 'users.role'), 'superadmin');
});

test('admin cannot delete a superadmin account', async () => {
  const res = await fetch(url('/api/users/superadmin-1'), {
    method: 'DELETE',
    headers: adminHeaders
  });

  assert.equal(res.status, 403);
  const json = await res.json();
  assert.equal(json.success, false);
  assert.match(json.error, /only superadministrators can delete a superadministrator account/i);
});

test('login is blocked for unapproved user with HTTP 403', async () => {
  const res = await fetch(url('/api/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'pendinguser',
      password: 'pendingpass123'
    })
  });

  assert.equal(res.status, 403);
  const json = await res.json();
  assert.equal(json.success, false);
  assert.match(json.error, /waiting for administrator approval/i);
});

test('login succeeds for approved user and returns correct role', async () => {
  const res = await fetch(url('/api/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'admin',
      password: 'adminpassword123'
    })
  });

  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.success, true);
  assert.ok(json.token);
  assert.equal(json.user.role, 'admin');
});
