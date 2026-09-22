const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');

test('dashboard pages expose the group email trigger wired by the controller', () => {
  for (const page of ['dashboard.html', 'index.html']) {
    const html = fs.readFileSync(path.join(projectRoot, page), 'utf8');
    const triggerMatches = html.match(/id="openGroupEmailModalBtn"/g) || [];

    assert.equal(triggerMatches.length, 1, `${page} should contain one group email trigger`);
    assert.match(html, />\s*Send Group Email\s*<\/button>/);
    assert.match(html, /id="emailInviteModal"/);
  }

  const controller = fs.readFileSync(path.join(projectRoot, 'script.js'), 'utf8');
  assert.match(controller, /querySelector\('#openGroupEmailModalBtn'\)/);
  assert.match(controller, /triggerBtn\.addEventListener\('click', openGroupEmailModal\)/);
});
