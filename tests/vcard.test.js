const { test, after } = require('node:test');
const assert = require('node:assert/strict');
process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 5).toString('base64');
const { encryptValue, signSession } = require('../crypto');

const mockStudent = {
  id: '00000000-0000-0000-0000-000000000088',
  first_name: encryptValue('Jean-Luc', 'students.first_name'),
  father_name: encryptValue('Pierre', 'students.father_name'),
  family_name: encryptValue('Dupont, Jr.', 'students.family_name'),
  origin: encryptValue('Beirut', 'students.origin'),
  address: encryptValue('Achrafieh; Rue Monot', 'students.address'),
  school: encryptValue('Grand Lycée', 'students.school'),
  major: encryptValue('Informatics', 'students.major'),
  political_affiliation: encryptValue('Independent', 'students.political_affiliation'),
  status: encryptValue('New', 'students.status'),
  language: encryptValue('French', 'students.language'),
  campus: encryptValue('Fanar', 'students.campus'),
  phone: encryptValue('+961 70 999 888', 'students.phone'),
  email: encryptValue('jeanluc.dupont@example.com', 'students.email'),
  in_group: true,
  left_group: false,
  note: JSON.stringify({ text: 'Confidential admin note', assignedGroup: 'Grp A', section: 'mispce' }),
  kazaa: '',
  created_at: new Date().toISOString()
};

require.cache[require.resolve('../db')] = {
  exports: {
    pool: {},
    supabaseRequested: true,
    initDb: async () => {},
    checkDbConnection: async () => ({}),
    supabase: {
      from: (tableName) => {
        assert.equal(tableName, 'students');
        return {
          select: () => ({
            eq: (field, value) => ({
              maybeSingle: async () => ({
                data: mockStudent.id === value ? { ...mockStudent } : null,
                error: null
              })
            })
          })
        };
      }
    }
  }
};

const app = require('../server');
const server = app.listen(0, '127.0.0.1');
after(() => new Promise(resolve => server.close(resolve)));

const url = path => `http://127.0.0.1:${server.address().port}${path}`;

test('generateVCardString formats valid vCard 3.0 with CRLF and escaped characters', () => {
  const vcard = app.generateVCardString({
    firstName: 'Jean, Luc',
    fatherName: 'Pierre',
    familyName: 'Dupont; Jr.',
    phone: '+961 70 999 888',
    email: 'jeanluc@example.com',
    school: 'Grand Lycée',
    campus: 'Fanar',
    major: 'Informatics',
    section: 'mispce',
    address: 'Achrafieh, Rue 1; Apt 2',
    origin: 'Beirut',
    status: 'New',
    language: 'French',
    assignedGroup: 'Grp A',
    note: 'Great student\nHard working'
  });

  assert.ok(vcard.startsWith('BEGIN:VCARD\r\nVERSION:3.0\r\n'));
  assert.ok(vcard.endsWith('END:VCARD\r\n'));
  assert.ok(vcard.includes('FN:Jean\\, Luc Pierre Dupont\\; Jr.\r\n'));
  assert.ok(vcard.includes('N:Dupont\\; Jr.;Jean\\, Luc;Pierre;;\r\n'));
  assert.ok(vcard.includes('TEL;TYPE=CELL,VOICE:+961 70 999 888\r\n'));
  assert.ok(vcard.includes('EMAIL;TYPE=INTERNET,HOME:jeanluc@example.com\r\n'));
  assert.ok(vcard.includes('ORG:Grand Lycée - Fanar\r\n'));
  assert.ok(vcard.includes('TITLE:Informatics • MISPCE\r\n'));
  assert.ok(vcard.includes('ADR;TYPE=HOME:;;Achrafieh\\, Rue 1\\; Apt 2;Beirut;;;\r\n'));
  assert.ok(vcard.includes('NOTE:Status: New | Language: French | Origin: Beirut | Group: Grp A | Note: Great student\\nHard working\r\n'));
});

test('GET /api/students/:id/vcard rejects unauthenticated requests', async () => {
  const res = await fetch(url(`/api/students/${mockStudent.id}/vcard`));
  assert.equal(res.status, 401);
});

test('GET /api/students/:id/vcard returns text/vcard and inline disposition with Bearer token', async () => {
  const token = signSession({ id: 'admin-1', username: 'admin', role: 'admin', section: 'all' });
  const res = await fetch(url(`/api/students/${mockStudent.id}/vcard`), {
    headers: { Authorization: `Bearer ${token}` }
  });

  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'text/vcard; charset=utf-8');
  assert.ok(res.headers.get('content-disposition').includes('inline; filename='));
  assert.ok(res.headers.get('content-disposition').endsWith('.vcf"'));

  const text = await res.text();
  assert.ok(text.includes('BEGIN:VCARD'));
  assert.ok(text.includes('VERSION:3.0'));
  assert.ok(text.includes('FN:Jean-Luc Pierre Dupont'));
  assert.ok(text.includes('TEL;TYPE=CELL,VOICE:+961 70 999 888'));
  assert.ok(text.includes('EMAIL;TYPE=INTERNET,HOME:jeanluc.dupont@example.com'));
});

test('GET /api/students/:id/contact.vcf supports query token and download=1', async () => {
  const token = signSession({ id: 'admin-1', username: 'admin', role: 'admin', section: 'all' });
  const res = await fetch(url(`/api/students/${mockStudent.id}/contact.vcf?token=${encodeURIComponent(token)}&download=1`));

  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'text/vcard; charset=utf-8');
  assert.ok(res.headers.get('content-disposition').startsWith('attachment; filename='));

  const text = await res.text();
  assert.ok(text.includes('BEGIN:VCARD'));
  assert.ok(text.includes('END:VCARD'));
});

test('GET /api/students/:id/vcard excludes confidential notes for delegates', async () => {
  const token = signSession({ id: 'deleg-1', username: 'deleg', role: 'deleg', section: 'mispce' });
  const res = await fetch(url(`/api/students/${mockStudent.id}/vcard?token=${encodeURIComponent(token)}`));

  assert.equal(res.status, 200);
  const text = await res.text();
  assert.ok(text.includes('BEGIN:VCARD'));
  assert.ok(!text.includes('Confidential admin note'));
  assert.ok(!text.includes('Independent'));
});
