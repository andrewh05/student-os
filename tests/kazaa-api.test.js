const { test, after } = require('node:test');
const assert = require('node:assert/strict');
process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');
const { encryptValue, signSession } = require('../crypto');
const sample = { id: 'example', first_name: encryptValue('Sample', 'students.first_name'), family_name: encryptValue('Student', 'students.family_name'), origin: encryptValue('Amshit', 'students.origin'), phone: 'must not be returned' };
let ranges = [];
require.cache[require.resolve('../db')] = { exports: {
  pool: {}, supabaseRequested: true, initDb: async () => {}, checkDbConnection: async () => ({}),
  supabase: { from: () => ({ select: fields => {
    assert.equal(fields, 'id, first_name, family_name, origin');
    return { order: () => ({ range: async (start,end) => {
      ranges.push([start,end]);
      return { data: Array.from({length: start === 0 ? 1000 : 1}, () => sample), error: null };
    } }) };
  } }) }
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
  assert.deepEqual(json.data[0], {id: 'example', firstName: 'Sample', familyName: 'Student', origin: 'Amshit'});
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
