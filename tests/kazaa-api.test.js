const { test, after } = require('node:test');
const assert = require('node:assert/strict');
process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');
const { encryptValue, signSession } = require('../crypto');
const sample = { id: 'example', first_name: encryptValue('Sample', 'students.first_name'), family_name: encryptValue('Student', 'students.family_name'), origin: encryptValue('Amshit', 'students.origin'), kazaa: '', phone: 'must not be returned' };
let ranges = [];
let updateCalls = [];
require.cache[require.resolve('../db')] = { exports: {
  pool: {}, supabaseRequested: true, initDb: async () => {}, checkDbConnection: async () => ({}),
  supabase: { from: () => ({
    select: fields => {
      assert.equal(fields, 'id, first_name, family_name, origin, kazaa');
      return { order: () => ({ range: async (start,end) => {
        ranges.push([start,end]);
        return { data: Array.from({length: start === 0 ? 1000 : 1}, () => sample), error: null };
      } }) };
    },
    update: payload => ({
      eq: (col, val) => {
        updateCalls.push({ col, val, payload });
        return {
          select: () => ({ maybeSingle: async () => ({ data: { id: val }, error: null }) }),
          then: resolve => resolve({ error: null })
        };
      }
    })
  }) }
} };
const server = require('../server').listen(0, '127.0.0.1');
after(() => new Promise(resolve => server.close(resolve)));
const headers = { Authorization: `Bearer ${signSession({ id: 'test', role: 'admin' })}`, 'Content-Type': 'application/json' };
const url = path => `http://127.0.0.1:${server.address().port}${path}`;

test('kazaa report requires a session, paginates and returns only necessary fields', async () => {
  let response = await fetch(url('/api/kazaa'));
  assert.equal(response.status, 401);
  response = await fetch(url('/api/kazaa'), { headers });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const json = await response.json();
  assert.equal(json.data.length, 1001);
  assert.deepEqual(json.data[0], {id: 'example', firstName: 'Sample', familyName: 'Student', origin: 'Amshit', kazaa: ''});
  assert.deepEqual(ranges, [[0,999],[1000,1999]]);
});

test('classification rejects unauthenticated and oversized requests before calling Groq', async () => {
  let response = await fetch(url('/api/kazaa/classify'), {method:'POST'});
  assert.equal(response.status, 401);
  for (const origins of [[], Array(31).fill('Amshit'), ['x'.repeat(301)], [''], [null]]) {
    response = await fetch(url('/api/kazaa/classify'), {method:'POST', headers, body:JSON.stringify({origins})});
    assert.equal(response.status, 400);
  }
});

test('classification rejects non-admin users with 403 Forbidden', async () => {
  const userHeaders = { Authorization: `Bearer ${signSession({ id: 'user1', role: 'user' })}`, 'Content-Type': 'application/json' };
  const response = await fetch(url('/api/kazaa/classify'), {
    method: 'POST',
    headers: userHeaders,
    body: JSON.stringify({ origins: ['Amshit'] })
  });
  assert.equal(response.status, 403);
  const json = await response.json();
  assert.equal(json.success, false);
  assert.equal(json.error, 'Administrator approval required');
});

test('PATCH /api/students/:id/kazaa updates district with session check and validation', async () => {
  const validUuid = '12345678-1234-1234-1234-123456789abc';
  let response = await fetch(url(`/api/students/${validUuid}/kazaa`), { method: 'PATCH' });
  assert.equal(response.status, 401);

  response = await fetch(url('/api/students/invalid-uuid/kazaa'), {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ kazaa: 'Jbeil' })
  });
  assert.equal(response.status, 400);

  response = await fetch(url(`/api/students/${validUuid}/kazaa`), {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ kazaa: 'FakeDistrict' })
  });
  assert.equal(response.status, 400);

  response = await fetch(url(`/api/students/${validUuid}/kazaa`), {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ kazaa: 'Jbeil' })
  });
  assert.equal(response.status, 200);
  const json = await response.json();
  assert.equal(json.success, true);
  assert.equal(json.data.kazaa, 'Jbeil');
});

test('POST /api/kazaa/batch saves multiple assignments', async () => {
  const validUuid1 = '12345678-1234-1234-1234-123456789abc';
  const validUuid2 = '87654321-4321-4321-4321-cba987654321';
  let response = await fetch(url('/api/kazaa/batch'), { method: 'POST' });
  assert.equal(response.status, 401);

  response = await fetch(url('/api/kazaa/batch'), {
    method: 'POST',
    headers,
    body: JSON.stringify({ assignments: [{ id: validUuid1, district: 'Jbeil' }, { id: validUuid2, district: 'Batroun' }] })
  });
  assert.equal(response.status, 200);
  const json = await response.json();
  assert.equal(json.success, true);
  assert.equal(json.count, 2);
});
