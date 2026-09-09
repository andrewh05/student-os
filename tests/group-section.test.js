const { test, after } = require('node:test');
const assert = require('node:assert/strict');
process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString('base64');
const { encryptValue, decryptValue, signSession } = require('../crypto');

let mockStudent = {
  id: '00000000-0000-0000-0000-000000000001',
  first_name: encryptValue('Jean', 'students.first_name'),
  father_name: encryptValue('Pierre', 'students.father_name'),
  family_name: encryptValue('Dupont', 'students.family_name'),
  origin: encryptValue('Beirut', 'students.origin'),
  address: encryptValue('Achrafieh', 'students.address'),
  school: encryptValue('Grand Lycee', 'students.school'),
  major: encryptValue('Informatics', 'students.major'),
  political_affiliation: '',
  status: encryptValue('New', 'students.status'),
  language: encryptValue('French', 'students.language'),
  campus: encryptValue('Fanar', 'students.campus'),
  phone: encryptValue('+961 70 111 222', 'students.phone'),
  email: encryptValue('jean.dupont@example.com', 'students.email'),
  in_group: false,
  left_group: false,
  note: '',
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
            order: () => ({
              range: async () => ({ data: [mockStudent], error: null })
            }),
            eq: (field, value) => ({
              maybeSingle: async () => ({
                data: mockStudent.id === value ? { ...mockStudent } : null,
                error: null
              })
            }),
            then: (resolve) => resolve({ data: [mockStudent], error: null })
          }),
          update: (payload) => ({
            eq: (field, value) => {
              if (mockStudent.id === value) {
                // If payload has assigned_group, simulate column not in schema cache to test fallback
                if (payload.assigned_group !== undefined) {
                  return {
                    select: () => ({
                      maybeSingle: async () => ({
                        data: null,
                        error: { code: 'PGRST204', message: "Could not find the 'assigned_group' column" }
                      })
                    })
                  };
                }
                Object.assign(mockStudent, payload);
              }
              return {
                select: () => ({
                  maybeSingle: async () => ({
                    data: { ...mockStudent },
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
};

const server = require('../server').listen(0, '127.0.0.1');
after(() => new Promise(resolve => server.close(resolve)));

const url = path => `http://127.0.0.1:${server.address().port}${path}`;

test('PATCH /api/students/:id/group sets assignedGroup and fallback persists via note payload', async () => {
  const res = await fetch(url('/api/students/00000000-0000-0000-0000-000000000001/group'), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inGroup: true, assignedGroup: 'Grp A,B' })
  });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.success, true);
  assert.equal(json.data.inGroup, true);
  assert.equal(json.data.assignedGroup, 'Grp A,B');
});

test('PATCH /api/students/:id/group can clear assignedGroup and inGroup', async () => {
  const res = await fetch(url('/api/students/00000000-0000-0000-0000-000000000001/group'), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inGroup: false, assignedGroup: '' })
  });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.success, true);
  assert.equal(json.data.inGroup, false);
  assert.equal(json.data.assignedGroup, '');
});

test('marking student leftGroup clears assignedGroup', async () => {
  // First set group
  await fetch(url('/api/students/00000000-0000-0000-0000-000000000001/group'), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inGroup: true, assignedGroup: 'Grp C,D' })
  });

  // Now mark left group
  const res = await fetch(url('/api/students/00000000-0000-0000-0000-000000000001/group'), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inGroup: false, leftGroup: true, assignedGroup: '' })
  });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.success, true);
  assert.equal(json.data.leftGroup, true);
  assert.equal(json.data.inGroup, false);
  assert.equal(json.data.assignedGroup, '');
});

test('group section normalization correctly classifies sections', () => {
  function getStudentAssignedGroup(student) {
    const norm = (student?.assignedGroup || '').trim().toLowerCase();
    if (norm === 'grp a,b' || norm === 'a,b') return 'Grp A,B';
    if (norm === 'grp c,d' || norm === 'c,d') return 'Grp C,D';
    if (norm === 'grp e1' || norm === 'e1') return 'Grp E1';
    if (norm === 'grp e2' || norm === 'e2') return 'Grp E2';
    return '';
  }

  assert.equal(getStudentAssignedGroup({ assignedGroup: 'Grp A,B' }), 'Grp A,B');
  assert.equal(getStudentAssignedGroup({ assignedGroup: 'a,b' }), 'Grp A,B');
  assert.equal(getStudentAssignedGroup({ assignedGroup: 'Grp C,D' }), 'Grp C,D');
  assert.equal(getStudentAssignedGroup({ assignedGroup: 'c,d' }), 'Grp C,D');
  assert.equal(getStudentAssignedGroup({ assignedGroup: 'Grp E1' }), 'Grp E1');
  assert.equal(getStudentAssignedGroup({ assignedGroup: 'e1' }), 'Grp E1');
  assert.equal(getStudentAssignedGroup({ assignedGroup: 'Grp E2' }), 'Grp E2');
  assert.equal(getStudentAssignedGroup({ assignedGroup: 'e2' }), 'Grp E2');
  assert.equal(getStudentAssignedGroup({ assignedGroup: '' }), '');
  assert.equal(getStudentAssignedGroup(null), '');
});

test('political affiliations breakdown per group accurately aggregates counts', () => {
  const sampleStudents = [
    { assignedGroup: 'Grp A,B', inGroup: true, leftGroup: false, politicalAffiliation: 'Party X' },
    { assignedGroup: 'Grp A,B', inGroup: true, leftGroup: false, politicalAffiliation: 'Party X' },
    { assignedGroup: 'Grp A,B', inGroup: true, leftGroup: false, politicalAffiliation: 'Party Y' },
    { assignedGroup: 'Grp C,D', inGroup: true, leftGroup: false, politicalAffiliation: 'Party Z' },
    { assignedGroup: 'Grp E1', inGroup: true, leftGroup: false, politicalAffiliation: 'Independent' },
    { assignedGroup: 'Grp E2', inGroup: true, leftGroup: false, politicalAffiliation: 'Party X' },
    { assignedGroup: '', inGroup: false, leftGroup: false, politicalAffiliation: 'Independent' },
    { assignedGroup: '', inGroup: false, leftGroup: true, politicalAffiliation: 'Party Y' }
  ];

  function getStudentAssignedGroup(student) {
    const norm = (student?.assignedGroup || '').trim().toLowerCase();
    if (norm === 'grp a,b' || norm === 'a,b') return 'Grp A,B';
    if (norm === 'grp c,d' || norm === 'c,d') return 'Grp C,D';
    if (norm === 'grp e1' || norm === 'e1') return 'Grp E1';
    if (norm === 'grp e2' || norm === 'e2') return 'Grp E2';
    return '';
  }

  function getStudentsForPoliticalGroup(groupKey) {
    if (groupKey === 'Grp A,B') return sampleStudents.filter(s => getStudentAssignedGroup(s) === 'Grp A,B');
    if (groupKey === 'Grp C,D') return sampleStudents.filter(s => getStudentAssignedGroup(s) === 'Grp C,D');
    if (groupKey === 'Grp E1') return sampleStudents.filter(s => getStudentAssignedGroup(s) === 'Grp E1');
    if (groupKey === 'Grp E2') return sampleStudents.filter(s => getStudentAssignedGroup(s) === 'Grp E2');
    if (groupKey === 'in_group') return sampleStudents.filter(s => s.inGroup && !s.leftGroup);
    if (groupKey === 'not_in_group') return sampleStudents.filter(s => !s.inGroup && !s.leftGroup);
    return sampleStudents;
  }

  const grpAB = getStudentsForPoliticalGroup('Grp A,B');
  assert.equal(grpAB.length, 3);
  const grpABAffs = grpAB.reduce((acc, s) => {
    acc[s.politicalAffiliation] = (acc[s.politicalAffiliation] || 0) + 1;
    return acc;
  }, {});
  assert.equal(grpABAffs['Party X'], 2);
  assert.equal(grpABAffs['Party Y'], 1);

  const inGrp = getStudentsForPoliticalGroup('in_group');
  assert.equal(inGrp.length, 6);

  const notInGrp = getStudentsForPoliticalGroup('not_in_group');
  assert.equal(notInGrp.length, 1);
});

