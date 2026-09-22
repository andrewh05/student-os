const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');

test('dashboard pages include the email modal and student cards expose a send-email action', () => {
  for (const page of ['dashboard.html', 'index.html']) {
    const html = fs.readFileSync(path.join(projectRoot, page), 'utf8');
    assert.match(html, /id="emailInviteModal"/);
  }

  const controller = fs.readFileSync(path.join(projectRoot, 'script.js'), 'utf8');
  assert.match(controller, /class="btn-action email-invite-card-btn"/);
  assert.match(controller, /onclick="openEmailModalForStudent\('\$\{student\.id\}'\)"/);
  assert.match(controller, />\s*Send Email\s*<\/button>/);
});
