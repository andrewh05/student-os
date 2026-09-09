const { test } = require('node:test');
const assert = require('node:assert/strict');
process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 5).toString('base64');
const { encryptValue, decryptValue, signSession, verifySession } = require('../crypto');

test('session token serializes and verifies academic section correctly', () => {
  const mispceToken = signSession({ userId: 'u1', username: 'mispce_deleg', role: 'deleg', section: 'mispce' });
  const mispceSession = verifySession(mispceToken);
  assert.equal(mispceSession.section, 'mispce');
  assert.equal(mispceSession.role, 'deleg');

  const csvtToken = signSession({ userId: 'u2', username: 'csvt_admin', role: 'admin', section: 'csvt' });
  const csvtSession = verifySession(csvtToken);
  assert.equal(csvtSession.section, 'csvt');
  assert.equal(csvtSession.role, 'admin');

  const superToken = signSession({ userId: 'u3', username: 'superadmin', role: 'superadmin', section: 'all' });
  const superSession = verifySession(superToken);
  assert.equal(superSession.section, 'all');
  assert.equal(superSession.role, 'superadmin');
});

test('delegates and admins have sections preserved in user full_name encryption payload', () => {
  const parseFullNamePayload = (value) => {
    if (!value) return { fullName: '', section: 'mispce' };
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && typeof parsed.name === 'string') {
        return { fullName: parsed.name, section: (parsed.section || 'mispce').toLowerCase() };
      }
    } catch {}
    return { fullName: value, section: 'mispce' };
  };

  const buildFullNamePayload = (name, section) => JSON.stringify({ name: (name || '').trim(), section: (section || 'mispce').toLowerCase() });

  const raw = buildFullNamePayload('Sami Khoury', 'csvt');
  const encrypted = encryptValue(raw, 'users.full_name');
  const decrypted = decryptValue(encrypted, 'users.full_name');
  const parsed = parseFullNamePayload(decrypted);

  assert.equal(parsed.fullName, 'Sami Khoury');
  assert.equal(parsed.section, 'csvt');
});

test('student section and notes are safely packed and unpacked in note payload', () => {
  const parseStudentNotePayload = (value) => {
    if (!value) return { text: '', assignedGroup: '', section: '' };
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object') {
        return {
          text: typeof parsed.text === 'string' ? parsed.text : '',
          assignedGroup: typeof parsed.assignedGroup === 'string' ? parsed.assignedGroup : '',
          section: typeof parsed.section === 'string' ? parsed.section.toLowerCase() : ''
        };
      }
    } catch {}
    return { text: value, assignedGroup: '', section: '' };
  };

  const buildStudentNotePayload = (text, assignedGroup, section) => JSON.stringify({
    text: (text || '').trim(),
    assignedGroup: (assignedGroup || '').trim(),
    section: (section || '').trim().toLowerCase()
  });

  const rawPayload = buildStudentNotePayload('Excellent profile', 'Grp A,B', 'mispce');
  const encrypted = encryptValue(rawPayload, 'students.note');
  const decrypted = decryptValue(encrypted, 'students.note');
  const unpacked = parseStudentNotePayload(decrypted);

  assert.equal(unpacked.text, 'Excellent profile');
  assert.equal(unpacked.assignedGroup, 'Grp A,B');
  assert.equal(unpacked.section, 'mispce');
});
