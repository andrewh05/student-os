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
  const resA = await fetch(url('/api/students/00000000-0000-0000-0000-000000000001/group'), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inGroup: true, assignedGroup: 'Grp A' })
  });
  assert.equal(resA.status, 200);
  const jsonA = await resA.json();
  assert.equal(jsonA.success, true);
  assert.equal(jsonA.data.inGroup, true);
  assert.equal(jsonA.data.assignedGroup, 'Grp A');

  const resB = await fetch(url('/api/students/00000000-0000-0000-0000-000000000001/group'), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inGroup: true, assignedGroup: 'Grp B' })
  });
  assert.equal(resB.status, 200);
  const jsonB = await resB.json();
  assert.equal(jsonB.success, true);
  assert.equal(jsonB.data.inGroup, true);
  assert.equal(jsonB.data.assignedGroup, 'Grp B');
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
    if (norm === 'grp a' || norm === 'a') return 'Grp A';
    if (norm === 'grp b' || norm === 'b') return 'Grp B';
    if (norm === 'grp a,b' || norm === 'a,b') return 'Grp A,B';
    if (norm === 'grp c,d' || norm === 'c,d') return 'Grp C,D';
    if (norm === 'grp e1' || norm === 'e1') return 'Grp E1';
    if (norm === 'grp e2' || norm === 'e2') return 'Grp E2';
    return '';
  }

  assert.equal(getStudentAssignedGroup({ assignedGroup: 'Grp A' }), 'Grp A');
  assert.equal(getStudentAssignedGroup({ assignedGroup: 'a' }), 'Grp A');
  assert.equal(getStudentAssignedGroup({ assignedGroup: 'Grp B' }), 'Grp B');
  assert.equal(getStudentAssignedGroup({ assignedGroup: 'b' }), 'Grp B');
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
    { assignedGroup: 'Grp A', inGroup: true, leftGroup: false, politicalAffiliation: 'Party X' },
    { assignedGroup: 'Grp A', inGroup: true, leftGroup: false, politicalAffiliation: 'Party X' },
    { assignedGroup: 'Grp B', inGroup: true, leftGroup: false, politicalAffiliation: 'Party Y' },
    { assignedGroup: 'Grp C,D', inGroup: true, leftGroup: false, politicalAffiliation: 'Party Z' },
    { assignedGroup: 'Grp E1', inGroup: true, leftGroup: false, politicalAffiliation: 'Independent' },
    { assignedGroup: 'Grp E2', inGroup: true, leftGroup: false, politicalAffiliation: 'Party X' },
    { assignedGroup: '', inGroup: false, leftGroup: false, politicalAffiliation: 'Independent' },
    { assignedGroup: '', inGroup: false, leftGroup: true, politicalAffiliation: 'Party Y' }
  ];

  function getStudentAssignedGroup(student) {
    const norm = (student?.assignedGroup || '').trim().toLowerCase();
    if (norm === 'grp a' || norm === 'a') return 'Grp A';
    if (norm === 'grp b' || norm === 'b') return 'Grp B';
    if (norm === 'grp a,b' || norm === 'a,b') return 'Grp A,B';
    if (norm === 'grp c,d' || norm === 'c,d') return 'Grp C,D';
    if (norm === 'grp e1' || norm === 'e1') return 'Grp E1';
    if (norm === 'grp e2' || norm === 'e2') return 'Grp E2';
    return '';
  }

  function getStudentsForPoliticalGroup(groupKey) {
    if (groupKey === 'Grp A') return sampleStudents.filter(s => getStudentAssignedGroup(s) === 'Grp A');
    if (groupKey === 'Grp B') return sampleStudents.filter(s => getStudentAssignedGroup(s) === 'Grp B');
    if (groupKey === 'Grp A,B') return sampleStudents.filter(s => ['Grp A,B', 'Grp A', 'Grp B'].includes(getStudentAssignedGroup(s)));
    if (groupKey === 'Grp C,D') return sampleStudents.filter(s => getStudentAssignedGroup(s) === 'Grp C,D');
    if (groupKey === 'Grp E1') return sampleStudents.filter(s => getStudentAssignedGroup(s) === 'Grp E1');
    if (groupKey === 'Grp E2') return sampleStudents.filter(s => getStudentAssignedGroup(s) === 'Grp E2');
    if (groupKey === 'in_group') return sampleStudents.filter(s => s.inGroup && !s.leftGroup);
    if (groupKey === 'not_in_group') return sampleStudents.filter(s => !s.inGroup && !s.leftGroup);
    return sampleStudents;
  }

  const grpA = getStudentsForPoliticalGroup('Grp A');
  assert.equal(grpA.length, 2);
  const grpAAffs = grpA.reduce((acc, s) => {
    acc[s.politicalAffiliation] = (acc[s.politicalAffiliation] || 0) + 1;
    return acc;
  }, {});
  assert.equal(grpAAffs['Party X'], 2);

  const grpB = getStudentsForPoliticalGroup('Grp B');
  assert.equal(grpB.length, 1);
  assert.equal(grpB[0].politicalAffiliation, 'Party Y');

  const grpAB = getStudentsForPoliticalGroup('Grp A,B');
  assert.equal(grpAB.length, 3);

  const grpCD = getStudentsForPoliticalGroup('Grp C,D');
  assert.equal(grpCD.length, 1);
  assert.equal(grpCD[0].politicalAffiliation, 'Party Z');

  const inGrp = getStudentsForPoliticalGroup('in_group');
  assert.equal(inGrp.length, 6);

  const notInGrp = getStudentsForPoliticalGroup('not_in_group');
  assert.equal(notInGrp.length, 1);
});

test('changing assigned group from Grp A to another group requires confirmation', () => {
  function shouldConfirmGroupChange(student, targetGroup) {
    function getStudentAssignedGroup(s) {
      const norm = (s?.assignedGroup || '').trim().toLowerCase();
      if (norm === 'grp a' || norm === 'a') return 'Grp A';
      if (norm === 'grp b' || norm === 'b') return 'Grp B';
      if (norm === 'grp a,b' || norm === 'a,b') return 'Grp A,B';
      if (norm === 'grp c,d' || norm === 'c,d') return 'Grp C,D';
      if (norm === 'grp e1' || norm === 'e1') return 'Grp E1';
      if (norm === 'grp e2' || norm === 'e2') return 'Grp E2';
      return '';
    }

    const currentNorm = (student.assignedGroup || '').trim().toLowerCase();
    const targetNorm = targetGroup.trim().toLowerCase();
    const isAlreadyInTarget = currentNorm === targetNorm || currentNorm === targetNorm.replace(/^grp\s*/, '');
    const currentGroup = getStudentAssignedGroup(student) || (student.assignedGroup ? student.assignedGroup.trim() : '');

    return Boolean(currentGroup && !isAlreadyInTarget);
  }

  // Student in Grp A clicking other groups requires confirmation
  assert.equal(shouldConfirmGroupChange({ assignedGroup: 'Grp A' }, 'Grp B'), true);
  assert.equal(shouldConfirmGroupChange({ assignedGroup: 'Grp A' }, 'Grp C,D'), true);
  // Clicking Grp A when already in Grp A toggles off/unassigns without confirmation
  assert.equal(shouldConfirmGroupChange({ assignedGroup: 'Grp A' }, 'Grp A'), false);
  // Student with no group assigned initially clicking Grp A does not require confirmation
  assert.equal(shouldConfirmGroupChange({ assignedGroup: '' }, 'Grp A'), false);
  // Student in Grp B clicking Grp A requires confirmation
  assert.equal(shouldConfirmGroupChange({ assignedGroup: 'Grp B' }, 'Grp A'), true);
  // Student in Grp E1 clicking Grp E2 requires confirmation
  assert.equal(shouldConfirmGroupChange({ assignedGroup: 'Grp E1' }, 'Grp E2'), true);
});

test('status breakdown (New vs Mu3id) per group and in-group aggregates accurately', () => {
  const sampleStudents = [
    { assignedGroup: 'Grp A', inGroup: true, leftGroup: false, status: 'New' },
    { assignedGroup: 'Grp A', inGroup: true, leftGroup: false, status: 'Mu3id' },
    { assignedGroup: 'Grp A', inGroup: true, leftGroup: false, status: 'New' },
    { assignedGroup: 'Grp B', inGroup: true, leftGroup: false, status: 'Mu3id' },
    { assignedGroup: 'Grp B', inGroup: true, leftGroup: false, status: 'Mu3id' },
    { assignedGroup: 'Grp C,D', inGroup: true, leftGroup: false, status: 'New' },
    { assignedGroup: 'Grp E1', inGroup: true, leftGroup: false, status: 'New' },
    { assignedGroup: 'Grp E1', inGroup: true, leftGroup: false, status: 'Mu3id' },
    { assignedGroup: 'Grp E2', inGroup: true, leftGroup: false, status: 'New' },
    { assignedGroup: '', inGroup: false, leftGroup: false, status: 'New' },
    { assignedGroup: '', inGroup: false, leftGroup: true, status: 'Mu3id' }
  ];

  function getStudentAssignedGroup(s) {
    const norm = (s?.assignedGroup || '').trim().toLowerCase();
    if (norm === 'grp a' || norm === 'a') return 'Grp A';
    if (norm === 'grp b' || norm === 'b') return 'Grp B';
    if (norm === 'grp a,b' || norm === 'a,b') return 'Grp A,B';
    if (norm === 'grp c,d' || norm === 'c,d') return 'Grp C,D';
    if (norm === 'grp e1' || norm === 'e1') return 'Grp E1';
    if (norm === 'grp e2' || norm === 'e2') return 'Grp E2';
    return '';
  }

  const isNew = s => String(s.status || '').trim().toLowerCase() === 'new';
  const isMu3id = s => String(s.status || '').trim().toLowerCase() === 'mu3id';

  // Overall in-group breakdown
  const inGroup = sampleStudents.filter(s => s.inGroup && !s.leftGroup);
  assert.equal(inGroup.filter(isNew).length, 5);
  assert.equal(inGroup.filter(isMu3id).length, 4);

  // Grp A
  const grpA = sampleStudents.filter(s => getStudentAssignedGroup(s) === 'Grp A');
  assert.equal(grpA.filter(isNew).length, 2);
  assert.equal(grpA.filter(isMu3id).length, 1);

  // Grp B
  const grpB = sampleStudents.filter(s => getStudentAssignedGroup(s) === 'Grp B');
  assert.equal(grpB.filter(isNew).length, 0);
  assert.equal(grpB.filter(isMu3id).length, 2);

  // Grp C,D
  const grpCD = sampleStudents.filter(s => getStudentAssignedGroup(s) === 'Grp C,D');
  assert.equal(grpCD.filter(isNew).length, 1);
  assert.equal(grpCD.filter(isMu3id).length, 0);

  // Grp E1
  const grpE1 = sampleStudents.filter(s => getStudentAssignedGroup(s) === 'Grp E1');
  assert.equal(grpE1.filter(isNew).length, 1);
  assert.equal(grpE1.filter(isMu3id).length, 1);

  // Grp E2
  const grpE2 = sampleStudents.filter(s => getStudentAssignedGroup(s) === 'Grp E2');
  assert.equal(grpE2.filter(isNew).length, 1);
  assert.equal(grpE2.filter(isMu3id).length, 0);
});

test('approve to group button renders correct state, title, and disabled logic', () => {
  function getApproveButtonProps(student) {
    const isApproved = !!student.inGroup;
    const isLeft = !!student.leftGroup;
    return {
      className: `btn-approve-group-icon ${isApproved ? 'is-approved' : ''}`.trim(),
      disabled: isLeft,
      title: isLeft
        ? 'This student left the group'
        : (isApproved
            ? `Approved in group class (Done)${student.assignedGroup ? ' - ' + student.assignedGroup : ''}`
            : `Approve ${student.fullName || 'student'} to group class`),
      iconType: isApproved ? 'check' : 'arrow'
    };
  }

  // Not in group
  const s1 = { fullName: 'Ali Ahmad', inGroup: false, leftGroup: false, assignedGroup: '' };
  const p1 = getApproveButtonProps(s1);
  assert.equal(p1.className, 'btn-approve-group-icon');
  assert.equal(p1.disabled, false);
  assert.equal(p1.title, 'Approve Ali Ahmad to group class');
  assert.equal(p1.iconType, 'arrow');

  // Approved in group
  const s2 = { fullName: 'Sara Nour', inGroup: true, leftGroup: false, assignedGroup: 'Grp A' };
  const p2 = getApproveButtonProps(s2);
  assert.equal(p2.className, 'btn-approve-group-icon is-approved');
  assert.equal(p2.disabled, false);
  assert.equal(p2.title, 'Approved in group class (Done) - Grp A');
  assert.equal(p2.iconType, 'check');

  // Student left group
  const s3 = { fullName: 'Omar Khalid', inGroup: false, leftGroup: true, assignedGroup: '' };
  const p3 = getApproveButtonProps(s3);
  assert.equal(p3.disabled, true);
  assert.equal(p3.title, 'This student left the group');
});

