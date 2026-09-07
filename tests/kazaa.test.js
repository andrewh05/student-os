const { test } = require('node:test');
const assert = require('node:assert/strict');
const { classifyOrigins } = require('../kazaa');
const completion = results => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ results }) } }] }));

test('orders suggestions by input, sends only origins, and leaves uncertain places unassigned', async () => {
  const result = await classifyOrigins(['Amshit', 'Unknown village'], 'test-key', async (url, options) => {
    assert.equal(url, 'https://api.groq.com/openai/v1/chat/completions');
    const request = JSON.parse(options.body);
    assert.deepEqual(JSON.parse(request.messages[1].content), [{ index: 0, origin: 'Amshit' }, { index: 1, origin: 'Unknown village' }]);
    return completion([{ index: 1, district: 'Matn', confident: false }, { index: 0, district: 'Jbeil', confident: true }]);
  });
  assert.deepEqual(result, [{ district: 'Jbeil' }, { district: null }]);
});

test('rejects invented districts, duplicated indices and missing results', async () => {
  for (const results of [
    [{index: 0, district: 'Made up', confident: true}],
    [{index: 0, district: 'Jbeil', confident: true}, {index: 0, district: 'Jbeil', confident: true}],
    []
  ]) {
    await assert.rejects(classifyOrigins(['Amshit'], 'test-key', async () => completion(results)));
  }
});

test('reports missing credentials, malformed output, timeouts and rate limits', async () => {
  await assert.rejects(classifyOrigins(['Amshit'], ''), /not configured/);
  await assert.rejects(classifyOrigins(['Amshit'], 'test', async () => new Response('{}')), /invalid response/);
  await assert.rejects(classifyOrigins(['Amshit'], 'test', async () => new Response('', { status: 429 })), /rate limit/);
  await assert.rejects(classifyOrigins(['Amshit'], 'test', async () => { throw new DOMException('Timed out', 'TimeoutError'); }), { name: 'TimeoutError' });
});
