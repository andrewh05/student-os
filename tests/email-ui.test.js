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
  assert.match(controller, /onclick="sendStudentEmailAutomatically\('\$\{student\.id\}', this\)"/);
  assert.match(controller, /async function sendStudentEmailAutomatically\(studentId, button\)/);
  assert.match(controller, /automatic: true/);
  assert.match(controller, />\s*Send Email\s*<\/button>/);
});

test('email-config.html and email-config.js expose Send to All Students button, numbers dashboard, and logs table', () => {
  const html = fs.readFileSync(path.join(projectRoot, 'email-config.html'), 'utf8');

  // Verify Send to All Students button
  assert.match(html, /id="btnSendAllStudents"/);
  assert.match(html, /Send Email to All Students/);

  // Verify anti-restriction protection notice
  assert.match(html, /class="anti-restriction-callout"/);
  assert.match(html, /Anti-Restriction Safe Sending Active/);

  // Verify pre-flight audience metrics and execution numbers dashboard
  assert.match(html, /id="statTotalStudents"/);
  assert.match(html, /id="statValidEmails"/);
  assert.match(html, /id="numSentStudents"/);
  assert.match(html, /id="numFailedStudents"/);
  assert.match(html, /id="numSuccessRate"/);

  // Verify delivery logs table and export action
  assert.match(html, /id="deliveryLogsTable"/);
  assert.match(html, /id="btnExportCsv"/);

  // Verify email-config.js controller implementations
  const js = fs.readFileSync(path.join(projectRoot, 'email-config.js'), 'utf8');
  assert.match(js, /handleSendEmailToAllStudents/);
  assert.match(js, /exportLogsToCsv/);
  assert.match(js, /broadcastPaceSelect/);
  assert.match(js, /btnPauseBroadcast/);
  assert.match(js, /btnResumeBroadcast/);
  assert.match(js, /btnStopBroadcast/);
});



