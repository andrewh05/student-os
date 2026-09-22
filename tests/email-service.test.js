const test = require('node:test');
const assert = require('node:assert/strict');
const { renderEmailTemplate, sendInviteEmail, getMailerStatus, escapeHtml } = require('../emailService');

test('renderEmailTemplate generates beautiful HTML and plain text with personalized student data', () => {
  const student = {
    firstName: 'Carla',
    fatherName: 'Joseph',
    familyName: 'Khoury',
    major: 'Informatics',
    section: 'mispce',
    assignedGroup: 'Grp A',
    campus: 'Fanar',
    language: 'French',
    status: 'New',
    email: 'carla.khoury@example.com'
  };

  const rendered = renderEmailTemplate({
    student,
    groupName: 'ULFS2 Informatics Grp A WhatsApp',
    joinUrl: 'https://chat.whatsapp.com/TESTINVITE123',
    customMessage: 'Welcome to Section MISPCE! First day of classes is Monday.',
    senderName: 'Informatics Delegation'
  });

  // Verify subject
  assert.ok(rendered.subject.includes('Carla') || rendered.subject.includes('ULFS2'));
  assert.ok(rendered.subject.includes('Grp A') || rendered.subject.includes('Informatics'));

  // Verify HTML contents
  assert.ok(rendered.html.includes('Carla Joseph Khoury'));
  assert.ok(rendered.html.includes('Informatics'));
  assert.ok(rendered.html.includes('MISPCE'));
  assert.ok(rendered.html.includes('Grp A'));
  assert.ok(rendered.html.includes('Fanar'));
  assert.ok(rendered.html.includes('https://chat.whatsapp.com/TESTINVITE123'));
  assert.ok(rendered.html.includes('Welcome to Section MISPCE!'));
  assert.ok(rendered.html.includes('Informatics Delegation'));
  assert.ok(rendered.html.includes('<!DOCTYPE html>'));

  // Verify Plain Text contents
  assert.ok(rendered.text.includes('Carla Joseph Khoury'));
  assert.ok(rendered.text.includes('https://chat.whatsapp.com/TESTINVITE123'));
  assert.ok(rendered.text.includes('Welcome to Section MISPCE!'));
});

test('renderEmailTemplate escapes special characters to prevent HTML injection', () => {
  const student = {
    firstName: '<script>alert(1)</script>',
    familyName: 'O"Connor & Son',
    major: '<b>Hacked</b>'
  };

  const rendered = renderEmailTemplate({
    student,
    customMessage: '<img src=x onerror=alert(1)>'
  });

  assert.ok(!rendered.html.includes('<script>alert(1)</script>'));
  assert.ok(rendered.html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(rendered.html.includes('O&quot;Connor &amp; Son'));
  assert.ok(!rendered.html.includes('<img src=x onerror=alert(1)>'));
  assert.ok(rendered.html.includes('&lt;img src=x onerror=alert(1)&gt;'));
});

test('sendInviteEmail succeeds in test/mock mode without requiring real SMTP credentials', async () => {
  process.env.NODE_ENV = 'test';
  const student = {
    firstName: 'Tad',
    familyName: 'Tester',
    email: 'tester@example.com'
  };

  const result = await sendInviteEmail({
    to: 'tester@example.com',
    student,
    joinUrl: 'https://chat.whatsapp.com/TESTLINK'
  });

  assert.equal(result.success, true);
  assert.equal(result.recipient, 'tester@example.com');
  assert.ok(result.messageId);
});

test('getMailerStatus accurately reports configuration status', () => {
  const status = getMailerStatus();
  assert.ok(typeof status.configured === 'boolean');
  assert.ok(typeof status.testMode === 'boolean');
  assert.ok(status.from);
});

test('isValidEmail accurately validates email addresses', () => {
  const { isValidEmail } = require('../emailService');
  assert.equal(isValidEmail('student@example.com'), true);
  assert.equal(isValidEmail('carla.khoury@gmail.com'), true);
  assert.equal(isValidEmail('nour_haddad+test@sub.domain.edu'), true);

  assert.equal(isValidEmail(''), false);
  assert.equal(isValidEmail('not-an-email'), false);
  assert.equal(isValidEmail('user@'), false);
  assert.equal(isValidEmail('@example.com'), false);
  assert.equal(isValidEmail('user@domain'), false);
  assert.equal(isValidEmail(null), false);
  assert.equal(isValidEmail(undefined), false);
});

test('sendInviteEmail rejects invalid emails and logs delivery accurately', async () => {
  const { sendInviteEmail, isValidEmail, getEmailLogs, getEmailLogStats, clearEmailLogs } = require('../emailService');
  clearEmailLogs();

  // Rejects invalid email
  await assert.rejects(
    async () => {
      await sendInviteEmail({
        to: 'invalid-email',
        student: { firstName: 'Bad', familyName: 'Email' }
      });
    },
    /Invalid recipient email address/
  );

  // Successfully sends and records into logs
  const result = await sendInviteEmail({
    to: 'valid.student@example.com',
    student: {
      id: 'student-log-test-01',
      firstName: 'Rami',
      familyName: 'Sarkis',
      major: 'Informatics',
      section: 'mispce',
      assignedGroup: 'Grp A'
    },
    joinUrl: 'https://chat.whatsapp.com/TEST_LOG'
  });

  assert.equal(result.success, true);

  const logsResult = getEmailLogs({ limit: 10 });
  assert.ok(logsResult.total >= 1);
  const sentLog = logsResult.logs.find(l => l.email === 'valid.student@example.com');
  assert.ok(sentLog);
  assert.equal(sentLog.status, 'sent');
  assert.equal(sentLog.studentName, 'Rami Sarkis');

  const stats = getEmailLogStats();
  assert.ok(stats.sent >= 1);
  assert.ok(stats.total >= 1);
});

