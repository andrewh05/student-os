const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');
const { encryptValue, decryptValue, signSession, verifySession } = require('../crypto');

let mockStudents = [];
const mockUsers = [
  {
    id: 'user-andrew',
    username: encryptValue('andrew', 'users.username'),
    full_name: encryptValue('Andrew Haddad', 'users.full_name'),
    role: encryptValue('superadmin', 'users.role'),
    approved: true
  },
  {
    id: 'user-other-super',
    username: encryptValue('other_super', 'users.username'),
    full_name: encryptValue('Other Super', 'users.full_name'),
    role: encryptValue('superadmin', 'users.role'),
    approved: true
  },
  {
    id: 'user-deleg',
    username: encryptValue('deleg_mispce', 'users.username'),
    full_name: encryptValue('Deleg User', 'users.full_name'),
    role: encryptValue('deleg', 'users.role'),
    approved: true
  }
];

require.cache[require.resolve('../db')] = {
  exports: {
    pool: {},
    supabaseRequested: true,
    initDb: async () => {},
    checkDbConnection: async () => ({}),
    getUserById: async (id) => {
      const u = mockUsers.find(item => item.id === id);
      if (!u) return null;
      return {
        id: u.id,
        username: decryptValue(u.username, 'users.username'),
        fullName: decryptValue(u.full_name, 'users.full_name'),
        role: decryptValue(u.role, 'users.role')
      };
    },
    supabase: {
      from: (tableName) => {
        if (tableName === 'users') {
          return {
            select: () => ({
              eq: (field, value) => ({
                maybeSingle: async () => {
                  const found = mockUsers.find(u => u[field] === value || decryptValue(u[field], `users.${field}`) === value);
                  return { data: found || null, error: null };
                }
              })
            })
          };
        }
        if (tableName === 'students') {
          return {
            select: (fields) => {
              const query = {
                order: () => query,
                range: async (start, end) => ({
                  data: mockStudents.slice(start, end + 1),
                  error: null
                }),
                eq: (field, value) => ({
                  maybeSingle: async () => {
                    const found = mockStudents.find(s => s[field] === value);
                    return { data: found ? { ...found } : null, error: null };
                  }
                }),
                then: (resolve) => resolve({ data: [...mockStudents], error: null })
              };
              return query;
            },
            insert: (row) => {
              const newStudent = {
                id: row.id || `stud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                ...row,
                created_at: new Date().toISOString()
              };
              mockStudents.push(newStudent);
              return {
                select: () => ({
                  single: async () => ({ data: { ...newStudent }, error: null })
                })
              };
            },
            update: (payload) => ({
              eq: (field, value) => {
                const index = mockStudents.findIndex(s => s[field] === value);
                if (index !== -1) {
                  mockStudents[index] = { ...mockStudents[index], ...payload };
                }
                return {
                  select: () => ({
                    maybeSingle: async () => ({
                      data: index !== -1 ? { ...mockStudents[index] } : null,
                      error: null
                    })
                  })
                };
              }
            }),
            delete: () => ({
              eq: (field, value) => {
                const index = mockStudents.findIndex(s => s[field] === value);
                let deleted = null;
                if (index !== -1) {
                  deleted = mockStudents.splice(index, 1)[0];
                }
                return {
                  select: () => ({
                    maybeSingle: async () => ({
                      data: deleted ? { id: deleted.id } : null,
                      error: null
                    })
                  })
                };
              }
            })
          };
        }
      }
    }
  }
};

const server = require('../server').listen(0, '127.0.0.1');
after(() => new Promise(resolve => server.close(resolve)));

const url = path => `http://127.0.0.1:${server.address().port}${path}`;

const andrewToken = signSession({ userId: 'user-andrew', username: 'andrew', role: 'superadmin', section: 'all' });
const otherSuperToken = signSession({ userId: 'user-other-super', username: 'other_super', role: 'superadmin', section: 'all' });
const delegToken = signSession({ userId: 'user-deleg', username: 'deleg_mispce', role: 'deleg', section: 'mispce' });

beforeEach(() => {
  mockStudents = [];
});

test('Session token correctly preserves username for user andrew', () => {
  const session = verifySession(andrewToken);
  assert.equal(session.username, 'andrew');
  assert.equal(session.role, 'superadmin');
});

test('Andrew can create L2 student with Computer Science in French and English', async () => {
  const payloadFr = {
    firstName: 'Charbel',
    fatherName: 'Antoine',
    familyName: 'Khoury',
    school: 'Lycee',
    major: 'Computer Science',
    section: 'l2',
    status: 'New',
    language: 'French',
    campus: 'Fanar',
    phone: '+961 71 100 001',
    email: 'charbel.l2fr@example.com'
  };

  const resFr = await fetch(url('/api/students'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${andrewToken}` },
    body: JSON.stringify(payloadFr)
  });
  assert.equal(resFr.status, 201);
  const dataFr = await resFr.json();
  assert.equal(dataFr.success, true);
  assert.equal(dataFr.data.section, 'l2');
  assert.equal(dataFr.data.major, 'Computer Science');
  assert.equal(dataFr.data.language, 'French');

  const payloadEng = {
    firstName: 'Marc',
    fatherName: 'Joseph',
    familyName: 'Sarkis',
    school: 'College',
    major: 'Computer Science',
    section: 'l2',
    status: 'New',
    language: 'English',
    campus: 'Fanar',
    phone: '+961 71 100 002',
    email: 'marc.l2eng@example.com'
  };

  const resEng = await fetch(url('/api/students'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${andrewToken}` },
    body: JSON.stringify(payloadEng)
  });
  assert.equal(resEng.status, 201);
  const dataEng = await resEng.json();
  assert.equal(dataEng.success, true);
  assert.equal(dataEng.data.section, 'l2');
  assert.equal(dataEng.data.major, 'Computer Science');
  assert.equal(dataEng.data.language, 'English');
});

test('Andrew can create L3 student with Computer Science in French and English', async () => {
  const payloadFr = {
    firstName: 'Rita',
    fatherName: 'Elias',
    familyName: 'Haddad',
    school: 'Lycee',
    major: 'Computer Science',
    section: 'l3',
    status: 'New',
    language: 'French',
    campus: 'Fanar',
    phone: '+961 71 100 003',
    email: 'rita.l3fr@example.com'
  };

  const resFr = await fetch(url('/api/students'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${andrewToken}` },
    body: JSON.stringify(payloadFr)
  });
  assert.equal(resFr.status, 201);
  const dataFr = await resFr.json();
  assert.equal(dataFr.success, true);
  assert.equal(dataFr.data.section, 'l3');

  const payloadEng = {
    firstName: 'Peter',
    fatherName: 'Michel',
    familyName: 'Karam',
    school: 'College',
    major: 'Computer Science',
    section: 'l3',
    status: 'New',
    language: 'English',
    campus: 'Fanar',
    phone: '+961 71 100 004',
    email: 'peter.l3eng@example.com'
  };

  const resEng = await fetch(url('/api/students'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${andrewToken}` },
    body: JSON.stringify(payloadEng)
  });
  assert.equal(resEng.status, 201);
  const dataEng = await resEng.json();
  assert.equal(dataEng.success, true);
  assert.equal(dataEng.data.section, 'l3');
});

test('Andrew can create M1 student with Computer Science in French ONLY', async () => {
  const payloadFr = {
    firstName: 'Elie',
    fatherName: 'Georges',
    familyName: 'Nassar',
    school: 'ULFS2',
    major: 'Computer Science',
    section: 'm1',
    status: 'Mu3id',
    language: 'French',
    campus: 'Fanar',
    phone: '+961 71 100 005',
    email: 'elie.m1fr@example.com'
  };

  const resFr = await fetch(url('/api/students'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${andrewToken}` },
    body: JSON.stringify(payloadFr)
  });
  assert.equal(resFr.status, 201);
  const dataFr = await resFr.json();
  assert.equal(dataFr.success, true);
  assert.equal(dataFr.data.section, 'm1');
  assert.equal(dataFr.data.language, 'French');

  // English must be rejected for M1
  const payloadEng = {
    firstName: 'Anthony',
    fatherName: 'Nabil',
    familyName: 'Aoun',
    school: 'ULFS2',
    major: 'Computer Science',
    section: 'm1',
    status: 'New',
    language: 'English',
    campus: 'Fanar',
    phone: '+961 71 100 006',
    email: 'anthony.m1eng@example.com'
  };

  const resEng = await fetch(url('/api/students'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${andrewToken}` },
    body: JSON.stringify(payloadEng)
  });
  assert.equal(resEng.status, 400);
  const dataEng = await resEng.json();
  assert.equal(dataEng.success, false);
  assert.match(dataEng.error, /M1 only offers French/i);
});

test('Non-CS major is rejected for L2, L3, and M1', async () => {
  const payloadBio = {
    firstName: 'Toni',
    fatherName: 'Salim',
    familyName: 'Matar',
    school: 'Lycee',
    major: 'Biology',
    section: 'l2',
    status: 'New',
    language: 'French',
    campus: 'Fanar',
    phone: '+961 71 100 007',
    email: 'toni.l2bio@example.com'
  };

  const res = await fetch(url('/api/students'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${andrewToken}` },
    body: JSON.stringify(payloadBio)
  });
  assert.equal(res.status, 400);
  const json = await res.json();
  assert.equal(json.success, false);
  assert.match(json.error, /not offered in section L2/i);
});

test('Non-Andrew user is strictly forbidden from creating L2/L3/M1 students (403)', async () => {
  const payload = {
    firstName: 'Unauthorized',
    fatherName: 'User',
    familyName: 'Attempt',
    school: 'Test',
    major: 'Computer Science',
    section: 'l2',
    status: 'New',
    language: 'French',
    campus: 'Fanar',
    phone: '+961 71 999 001',
    email: 'unauth.l2@example.com'
  };

  const resSuper = await fetch(url('/api/students'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${otherSuperToken}` },
    body: JSON.stringify(payload)
  });
  assert.equal(resSuper.status, 403);
  const jsonSuper = await resSuper.json();
  assert.match(jsonSuper.error, /Only user andrew/i);

  const resDeleg = await fetch(url('/api/students'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${delegToken}` },
    body: JSON.stringify(payload)
  });
  assert.equal(resDeleg.status, 403);
  const jsonDeleg = await resDeleg.json();
  assert.match(jsonDeleg.error, /Only user andrew/i);
});

test('Non-Andrew user does NOT see L2/L3/M1 students in GET /api/students', async () => {
  // 1. Create a regular MISPCE student
  await fetch(url('/api/students'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${andrewToken}` },
    body: JSON.stringify({
      firstName: 'Regular',
      fatherName: 'Mispce',
      familyName: 'Student',
      school: 'School',
      major: 'Informatics',
      section: 'mispce',
      status: 'New',
      language: 'French',
      campus: 'Fanar',
      phone: '+961 71 888 001',
      email: 'regular.mispce@example.com'
    })
  });

  // 2. Create an L2 student by Andrew
  await fetch(url('/api/students'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${andrewToken}` },
    body: JSON.stringify({
      firstName: 'Advanced',
      fatherName: 'L2',
      familyName: 'Student',
      school: 'School',
      major: 'Computer Science',
      section: 'l2',
      status: 'New',
      language: 'French',
      campus: 'Fanar',
      phone: '+961 71 888 002',
      email: 'advanced.l2@example.com'
    })
  });

  // 3. Query as non-Andrew superadmin
  const resOther = await fetch(url('/api/students'), {
    headers: { Authorization: `Bearer ${otherSuperToken}` }
  });
  assert.equal(resOther.status, 200);
  const jsonOther = await resOther.json();
  const emailsOther = jsonOther.data.map(s => s.email);
  assert.ok(emailsOther.includes('regular.mispce@example.com'));
  assert.ok(!emailsOther.includes('advanced.l2@example.com'), 'Non-Andrew user must not see L2 student');

  // 4. Query as Andrew
  const resAndrew = await fetch(url('/api/students'), {
    headers: { Authorization: `Bearer ${andrewToken}` }
  });
  assert.equal(resAndrew.status, 200);
  const jsonAndrew = await resAndrew.json();
  const emailsAndrew = jsonAndrew.data.map(s => s.email);
  assert.ok(emailsAndrew.includes('regular.mispce@example.com'));
  assert.ok(emailsAndrew.includes('advanced.l2@example.com'), 'Andrew must see L2 student');
});

test('Andrew can filter GET /api/students?section=l2|l3|m1', async () => {
  // Create L2, L3, M1 students
  await fetch(url('/api/students'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${andrewToken}` },
    body: JSON.stringify({
      firstName: 'Student',
      fatherName: 'Two',
      familyName: 'Sec',
      school: 'School',
      major: 'Computer Science',
      section: 'l2',
      status: 'New',
      language: 'French',
      campus: 'Fanar',
      phone: '+961 71 777 002',
      email: 's2@example.com'
    })
  });

  await fetch(url('/api/students'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${andrewToken}` },
    body: JSON.stringify({
      firstName: 'Student',
      fatherName: 'Three',
      familyName: 'Sec',
      school: 'School',
      major: 'Computer Science',
      section: 'l3',
      status: 'New',
      language: 'French',
      campus: 'Fanar',
      phone: '+961 71 777 003',
      email: 's3@example.com'
    })
  });

  await fetch(url('/api/students'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${andrewToken}` },
    body: JSON.stringify({
      firstName: 'Student',
      fatherName: 'One',
      familyName: 'Master',
      school: 'School',
      major: 'Computer Science',
      section: 'm1',
      status: 'New',
      language: 'French',
      campus: 'Fanar',
      phone: '+961 71 777 004',
      email: 'sm1@example.com'
    })
  });

  const resL2 = await fetch(url('/api/students?section=l2'), {
    headers: { Authorization: `Bearer ${andrewToken}` }
  });
  const jsonL2 = await resL2.json();
  assert.equal(jsonL2.data.length, 1);
  assert.equal(jsonL2.data[0].email, 's2@example.com');

  const resL3 = await fetch(url('/api/students?section=l3'), {
    headers: { Authorization: `Bearer ${andrewToken}` }
  });
  const jsonL3 = await resL3.json();
  assert.equal(jsonL3.data.length, 1);
  assert.equal(jsonL3.data[0].email, 's3@example.com');

  const resM1 = await fetch(url('/api/students?section=m1'), {
    headers: { Authorization: `Bearer ${andrewToken}` }
  });
  const jsonM1 = await resM1.json();
  assert.equal(jsonM1.data.length, 1);
  assert.equal(jsonM1.data[0].email, 'sm1@example.com');
});

test('Non-Andrew user receives 404 for GET /api/students/:id of L2/L3/M1 student', async () => {
  const createRes = await fetch(url('/api/students'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${andrewToken}` },
    body: JSON.stringify({
      firstName: 'Hidden',
      fatherName: 'From',
      familyName: 'Others',
      school: 'School',
      major: 'Computer Science',
      section: 'l2',
      status: 'New',
      language: 'English',
      campus: 'Fanar',
      phone: '+961 71 666 001',
      email: 'hidden.l2@example.com'
    })
  });
  const created = await createRes.json();
  const id = created.data.id;

  // Non-Andrew gets 404
  const resOther = await fetch(url(`/api/students/${id}`), {
    headers: { Authorization: `Bearer ${otherSuperToken}` }
  });
  assert.equal(resOther.status, 404);

  // Andrew gets 200
  const resAndrew = await fetch(url(`/api/students/${id}`), {
    headers: { Authorization: `Bearer ${andrewToken}` }
  });
  assert.equal(resAndrew.status, 200);
});

test('Non-Andrew user receives 403 when attempting to PUT or DELETE L2/L3/M1 student', async () => {
  const createRes = await fetch(url('/api/students'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${andrewToken}` },
    body: JSON.stringify({
      firstName: 'Protected',
      fatherName: 'Student',
      familyName: 'Sec',
      school: 'School',
      major: 'Computer Science',
      section: 'm1',
      status: 'New',
      language: 'French',
      campus: 'Fanar',
      phone: '+961 71 555 001',
      email: 'protected.m1@example.com'
    })
  });
  const created = await createRes.json();
  const id = created.data.id;

  // Non-Andrew PUT
  const putRes = await fetch(url(`/api/students/${id}`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${otherSuperToken}` },
    body: JSON.stringify({
      firstName: 'Protected',
      fatherName: 'Student',
      familyName: 'Sec',
      school: 'School',
      major: 'Computer Science',
      section: 'm1',
      status: 'New',
      language: 'French',
      campus: 'Fanar',
      phone: '+961 71 555 001',
      email: 'protected.m1@example.com'
    })
  });
  assert.equal(putRes.status, 403);

  // Non-Andrew DELETE
  const delRes = await fetch(url(`/api/students/${id}`), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${otherSuperToken}` }
  });
  assert.equal(delRes.status, 403);

  // Andrew can DELETE
  const delAndrewRes = await fetch(url(`/api/students/${id}`), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${andrewToken}` }
  });
  assert.equal(delAndrewRes.status, 200);
});

test('Andrew can assign L2, L3, M1 groups via PATCH /api/students/:id/group', async () => {
  const createRes = await fetch(url('/api/students'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${andrewToken}` },
    body: JSON.stringify({
      firstName: 'GroupTest',
      fatherName: 'Student',
      familyName: 'Sec',
      school: 'School',
      major: 'Computer Science',
      section: 'l2',
      status: 'New',
      language: 'French',
      campus: 'Fanar',
      phone: '+961 71 444 001',
      email: 'grouptest.l2@example.com'
    })
  });
  const created = await createRes.json();
  const id = created.data.id;

  // Non-Andrew gets 403
  const patchOther = await fetch(url(`/api/students/${id}/group`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${otherSuperToken}` },
    body: JSON.stringify({ inGroup: true, assignedGroup: 'L2 FR' })
  });
  assert.equal(patchOther.status, 403);

  // Andrew sets L2 FR
  const patchAndrew = await fetch(url(`/api/students/${id}/group`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${andrewToken}` },
    body: JSON.stringify({ inGroup: true, assignedGroup: 'L2 FR' })
  });
  assert.equal(patchAndrew.status, 200);
  const jsonAndrew = await patchAndrew.json();
  assert.equal(jsonAndrew.success, true);
  assert.equal(jsonAndrew.data.assignedGroup, 'L2 FR');
  assert.equal(jsonAndrew.data.inGroup, true);
});
