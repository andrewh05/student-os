const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();
const { encryptValue, decryptValue, hashPassword, verifyPassword, signSession, verifySession } = require('./crypto');

const { pool, supabase, supabaseRequested, initDb, checkDbConnection } = require('./db');
const { getSettings, runGoogleDriveBackup, exchangeGoogleCode, googleAuthorizationUrl } = require('./backup');

const app = express();
const PORT = process.env.PORT || 3000;

function parseStudentNotePayload(value) {
  if (!value) return { text: '', assignedGroup: '' };
  try {
    const decrypted = decryptValue(value, 'students.note');
    if (!decrypted) return { text: '', assignedGroup: '' };
    const parsed = JSON.parse(decrypted);
    return {
      text: typeof parsed.text === 'string' ? parsed.text : '',
      assignedGroup: typeof parsed.assignedGroup === 'string' ? parsed.assignedGroup : ''
    };
  } catch {
    return { text: '', assignedGroup: '' };
  }
}

function readStudentNote(value) {
  return parseStudentNotePayload(value).text;
}

const mapStudent = row => {
  const notePayload = parseStudentNotePayload(row.note);
  const assignedGroup = row.assigned_group
    ? decryptValue(row.assigned_group, 'students.assigned_group')
    : (row.assignedGroup || notePayload.assignedGroup || '');

  return {
    id: row.id,
    note: notePayload.text,
    kazaa: row.kazaa ? decryptValue(row.kazaa, 'students.kazaa') : '',
    firstName: decryptValue(row.first_name, 'students.first_name'),
    fatherName: decryptValue(row.father_name, 'students.father_name'),
    familyName: decryptValue(row.family_name, 'students.family_name'),
    origin: decryptValue(row.origin, 'students.origin'),
    address: decryptValue(row.address, 'students.address'),
    school: decryptValue(row.school, 'students.school'),
    major: decryptValue(row.major, 'students.major'),
    politicalAffiliation: decryptValue(row.political_affiliation, 'students.political_affiliation'),
    status: decryptValue(row.status, 'students.status'),
    language: decryptValue(row.language, 'students.language'),
    campus: decryptValue(row.campus, 'students.campus'),
    phone: decryptValue(row.phone, 'students.phone'),
    email: decryptValue(row.email, 'students.email'),
    inGroup: Boolean(row.in_group),
    leftGroup: Boolean(row.left_group),
    assignedGroup: assignedGroup || '',
    createdAt: row.created_at
  };
};

const toStudentRow = student => {
  const row = {
    first_name: encryptValue(student.firstName, 'students.first_name'),
    father_name: encryptValue(student.fatherName, 'students.father_name'),
    family_name: encryptValue(student.familyName, 'students.family_name'),
    origin: encryptValue(student.origin || '', 'students.origin'),
    address: encryptValue(student.address || '', 'students.address'),
    school: encryptValue(student.school, 'students.school'),
    major: encryptValue(student.major, 'students.major'),
    political_affiliation: encryptValue(student.politicalAffiliation || '', 'students.political_affiliation'),
    status: encryptValue(student.status, 'students.status'),
    language: encryptValue(student.language, 'students.language'),
    campus: encryptValue(student.campus, 'students.campus'),
    phone: encryptValue(student.phone, 'students.phone'),
    email: encryptValue(student.email, 'students.email')
  };
  if (student.kazaa !== undefined) {
    row.kazaa = student.kazaa ? encryptValue(student.kazaa, 'students.kazaa') : '';
  }
  return row;
};

const normalizeText = value => String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
const normalizePhone = value => String(value || '').replace(/\D/g, '');

const studentIdentity = student => ({
  name: [student.firstName, student.fatherName, student.familyName].map(normalizeText).join('|'),
  email: normalizeText(student.email),
  phone: normalizePhone(student.phone)
});

const duplicateReason = (candidate, existingStudents) => {
  const identity = studentIdentity(candidate);
  for (const student of existingStudents) {
    const existing = studentIdentity(student);
    if (identity.email && identity.email === existing.email) return 'email address';
    if (identity.phone && identity.phone === existing.phone) return 'phone number';
    if (identity.name && identity.name === existing.name) return 'full name';
  }
  return null;
};

async function findDuplicateStudent(candidate, excludedId = null) {
  let students;
  if (supabase) {
    const { data, error } = await supabase
      .from('students')
      .select('id, first_name, father_name, family_name, phone, email');
    if (error) throw error;
    students = (data || []).map(mapStudent);
  } else {
    const { rows } = await pool.query(
      'SELECT id, first_name, father_name, family_name, phone, email FROM students'
    );
    students = rows.map(row => ({
      id: row.id,
      firstName: decryptValue(row.first_name, 'students.first_name'),
      fatherName: decryptValue(row.father_name, 'students.father_name'),
      familyName: decryptValue(row.family_name, 'students.family_name'),
      phone: decryptValue(row.phone, 'students.phone'),
      email: decryptValue(row.email, 'students.email')
    }));
  }

  return duplicateReason(
    candidate,
    students.filter(student => String(student.id) !== String(excludedId))
  );
}

app.use(cors());
app.use(express.json());
const hasLocalFilesystem = typeof __dirname !== 'undefined';
if (hasLocalFilesystem) {
  app.use(express.static(path.join(__dirname)));
}

const VALID_ROLES = ['superadmin', 'admin', 'deleg', 'staff'];
const isAdminRole = role => role === 'admin' || role === 'superadmin';
const isSuperAdminRole = role => role === 'superadmin';

async function getUserById(id) {
  if (supabase) {
    const { data, error } = await supabase.from('users').select('id, username, full_name, role, approved').eq('id', id).maybeSingle();
    if (error || !data) return null;
    return {
      id: data.id,
      username: decryptValue(data.username, 'users.username'),
      fullName: decryptValue(data.full_name, 'users.full_name'),
      role: decryptValue(data.role, 'users.role'),
      approved: data.approved
    };
  }
  const { rows } = await pool.query(`SELECT id, username, full_name, role, approved FROM users WHERE id = $1`, [id]);
  if (!rows || !rows.length) return null;
  const u = rows[0];
  return {
    id: u.id,
    username: decryptValue(u.username, 'users.username'),
    fullName: decryptValue(u.full_name, 'users.full_name'),
    role: decryptValue(u.role, 'users.role'),
    approved: u.approved
  };
}

const requireAdmin = (req, res, next) => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const session = verifySession(token);
  if (!session) return res.status(401).json({ success: false, error: 'Please sign in again.' });
  if (!isAdminRole(session.role)) return res.status(403).json({ success: false, error: 'Administrator approval required' });
  next();
};

// Kazaa report: authenticated access, with only origin text sent to Groq.
const { DISTRICTS, classifyOrigins } = require('./kazaa');
const requireSession = (req, res, next) => {
  const session = verifySession((req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
  if (!session) return res.status(401).json({ success: false, error: 'Please sign in again to view students by kazaa.' });
  res.set('Cache-Control', 'no-store');
  next();
};
app.get('/api/kazaa', requireSession, async (req, res) => {
  try {
    let rows;
    if (supabase) {
      rows = [];
      for (let offset = 0; ; offset += 1000) {
        let { data, error } = await supabase.from('students').select('id, first_name, family_name, origin, kazaa').order('id').range(offset, offset + 999);
        if (error && (error.code === '42703' || /kazaa/i.test(error.message))) {
          const fallback = await supabase.from('students').select('id, first_name, family_name, origin').order('id').range(offset, offset + 999);
          if (fallback.error) throw fallback.error;
          data = fallback.data;
          error = null;
        }
        if (error) throw error;
        rows.push(...data);
        if (data.length < 1000) break;
      }
    } else {
      try {
        ({ rows } = await pool.query('SELECT id, first_name, family_name, origin, kazaa FROM students ORDER BY id'));
      } catch {
        ({ rows } = await pool.query('SELECT id, first_name, family_name, origin FROM students ORDER BY id'));
      }
    }
    res.json({ success: true, configured: Boolean(process.env.GROQ_API_KEY), districts: DISTRICTS,
      data: rows.map(row => ({ id: row.id, firstName: decryptValue(row.first_name, 'students.first_name'), familyName: decryptValue(row.family_name, 'students.family_name'), origin: decryptValue(row.origin, 'students.origin'), kazaa: row.kazaa ? decryptValue(row.kazaa, 'students.kazaa') : '' })) });
  } catch {
    res.status(500).json({ success: false, error: 'Could not load students. Please reload to try again.' });
  }
});
app.post('/api/kazaa/classify', requireAdmin, async (req, res) => {
  const { origins } = req.body || {};
  if (!Array.isArray(origins) || !origins.length || origins.length > 30 || origins.some(value => typeof value !== 'string' || !value.trim() || value.length > 300)) {
    return res.status(400).json({ success: false, error: 'Send 1–30 origin names, up to 300 characters each.' });
  }
  if (!process.env.GROQ_API_KEY) return res.status(503).json({ success: false, error: 'Groq is not configured. Add GROQ_API_KEY to Cloudflare secrets.' });
  try {
    const data = await classifyOrigins(origins, process.env.GROQ_API_KEY);
    res.json({ success: true, data });
  } catch (err) {
    res.status(502).json({ success: false, error: err.name === 'TimeoutError' ? 'Groq took too long. Please try again.' : err.message });
  }
});

app.post('/api/kazaa/batch', requireSession, async (req, res) => {
  const { assignments } = req.body || {};
  if (!Array.isArray(assignments) || !assignments.length || assignments.length > 500) {
    return res.status(400).json({ success: false, error: 'Send an array of up to 500 assignments.' });
  }
  for (const item of assignments) {
    if (!item || typeof item.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.id)) {
      return res.status(400).json({ success: false, error: 'Invalid student ID in batch.' });
    }
    if (item.district && !DISTRICTS.includes(item.district)) {
      return res.status(400).json({ success: false, error: `Invalid district: ${item.district}` });
    }
  }
  try {
    if (supabase) {
      for (const item of assignments) {
        const districtValue = item.district || '';
        const encrypted = districtValue ? encryptValue(districtValue, 'students.kazaa') : '';
        const { error } = await supabase.from('students').update({ kazaa: encrypted }).eq('id', item.id);
        if (error) throw error;
      }
    } else {
      for (const item of assignments) {
        const districtValue = item.district || '';
        const encrypted = districtValue ? encryptValue(districtValue, 'students.kazaa') : '';
        await pool.query('UPDATE students SET kazaa = $1 WHERE id = $2', [encrypted, item.id]);
      }
    }
    res.json({ success: true, count: assignments.length });
  } catch (err) {
    console.error('Error batch updating kazaa:', err.message);
    const needsMigration = err.code === '42703' || /kazaa/i.test(err.message);
    res.status(500).json({
      success: false,
      error: needsMigration
        ? 'Kazaa column is not enabled in the database yet. Run the migration in supabase_kazaa_migration.sql.'
        : 'Could not save kazaa assignments. Please try again.'
    });
  }
});

// Health & DB Status Endpoint
app.get('/api/db-status', async (req, res) => {
  const status = await checkDbConnection();
  res.json(status);
});

app.get('/api/backup/status', requireAdmin, async (req, res) => {
  try {
    const settings = await getSettings();
    res.json({ success: true, configured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET), connected: Boolean(settings?.refresh_token), enabled: Boolean(settings?.enabled), retentionDays: settings?.retention_days || 30, lastBackupAt: settings?.last_backup_at || null, lastBackupName: settings?.last_backup_name || null, lastError: settings?.last_error || null });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.get('/api/backup/connect', requireAdmin, (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) return res.status(503).json({ success: false, error: 'Google OAuth secrets are not configured in Cloudflare' });
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  res.json({ success: true, url: googleAuthorizationUrl(token) });
});

app.get('/api/google-drive/callback', async (req, res) => {
  const session = verifySession(req.query.state);
  if (!session || !isAdminRole(session.role)) return res.status(403).send('Invalid or expired administrator session.');
  try {
    if (!req.query.code) throw new Error(req.query.error || 'Google authorization was cancelled');
    await exchangeGoogleCode(req.query.code);
    res.redirect(302, '/backup.html?connected=1');
  } catch (error) { res.redirect(302, `/backup.html?error=${encodeURIComponent(error.message)}`); }
});

app.post('/api/backup/run', requireAdmin, async (req, res) => {
  try { res.json({ success: true, data: await runGoogleDriveBackup() }); }
  catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.patch('/api/backup/settings', requireAdmin, async (req, res) => {
  const retentionDays = Number(req.body.retentionDays);
  if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 365) return res.status(400).json({ success: false, error: 'Retention must be between 1 and 365 days' });
  const { error } = await supabase.from('backup_settings').update({ enabled: Boolean(req.body.enabled), retention_days: retentionDays }).eq('id', 1);
  if (error) return res.status(500).json({ success: false, error: error.message });
  res.json({ success: true });
});

app.use(['/api/students', '/api/users'], (req, res, next) => {
  if (supabaseRequested && !supabase) {
    return res.status(503).json({
      success: false,
      error: 'Supabase is configured but its API key is missing or invalid. Update the Supabase environment variables and restart the server.'
    });
  }
  next();
});

app.post('/api/users', async (req, res) => {
  const { fullName, username, password, role = 'deleg' } = req.body;
  if (!fullName || !username || !password) {
    return res.status(400).json({ success: false, error: 'Full name, username and password are required' });
  }
  if (username.trim().length < 3 || password.length < 8) {
    return res.status(400).json({ success: false, error: 'Username must be at least 3 characters and password at least 8 characters' });
  }
  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ success: false, error: 'Invalid user role' });
  }

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const session = verifySession(token);
  const isSuperAdmin = Boolean(session && isSuperAdminRole(session.role));
  const isAdmin = Boolean(session && isAdminRole(session.role));

  if (role === 'superadmin' && !isSuperAdmin) {
    return res.status(403).json({ success: false, error: 'Only superadministrators can grant the superadmin role' });
  }

  // Determine assigned role based on caller privileges
  let assignedRole = 'deleg';
  if (isSuperAdmin) {
    assignedRole = role === 'staff' ? 'deleg' : role;
  } else if (isAdmin) {
    assignedRole = (role === 'admin') ? 'admin' : 'deleg';
  } else {
    assignedRole = 'deleg';
  }
  const isApproved = Boolean(isAdmin && req.body.approved === true);

  try {
    if (supabase) {
      const { data: existingUsers, error: lookupError } = await supabase.from('users').select('id, username');
      if (lookupError) throw lookupError;
      const duplicate = (existingUsers || []).some(user => decryptValue(user.username, 'users.username').toLowerCase() === username.trim().toLowerCase());
      if (duplicate) return res.status(409).json({ success: false, error: 'This username already exists' });
      const encryptedUser = {
        username: encryptValue(username.trim(), 'users.username'),
        password: hashPassword(password),
        full_name: encryptValue(fullName.trim(), 'users.full_name'),
        role: encryptValue(assignedRole, 'users.role'),
        approved: isApproved
      };
      const { data, error } = await supabase.from('users').insert(encryptedUser).select('id, username, full_name, role, approved').single();
      if (error) {
        if (error.code === '23505') return res.status(409).json({ success: false, error: 'This username already exists' });
        throw error;
      }
      return res.status(201).json({
        success: true,
        provider: 'Supabase',
        data: { id: data.id, username: username.trim(), full_name: fullName.trim(), role: assignedRole, approved: isApproved },
        message: isApproved ? 'Portal user created successfully' : 'Portal user created and is waiting for administrator approval'
      });
    }
    const { rows } = await pool.query(
      `INSERT INTO users (username, password, full_name, role, approved) VALUES ($1, $2, $3, $4, $5) RETURNING id, username, full_name AS "fullName", role, approved`,
      [encryptValue(username.trim(), 'users.username'), hashPassword(password), encryptValue(fullName.trim(), 'users.full_name'), encryptValue(assignedRole, 'users.role'), isApproved]
    );
    return res.status(201).json({
      success: true,
      provider: 'PostgreSQL',
      data: rows[0],
      message: isApproved ? 'Portal user created successfully' : 'Portal user created and is waiting for administrator approval'
    });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ success: false, error: 'This username already exists' });
    console.error('Error creating portal user:', err.message);
    return res.status(500).json({ success: false, error: 'Could not create portal user' });
  }
});

// Public registration request. Accounts remain disabled until an admin approves them.
app.post('/api/signup', async (req, res) => {
  const { fullName, username, password } = req.body;
  if (!fullName || !username || !password || username.trim().length < 3 || password.length < 8) {
    return res.status(400).json({ success: false, error: 'Enter a full name, username of at least 3 characters, and password of at least 8 characters' });
  }
  try {
    const { data: users, error: lookupError } = await supabase.from('users').select('id, username');
    if (lookupError) throw lookupError;
    const duplicate = (users || []).some(user => decryptValue(user.username, 'users.username').toLowerCase() === username.trim().toLowerCase());
    if (duplicate) return res.status(409).json({ success: false, error: 'This username is already registered or awaiting approval' });
    const { error } = await supabase.from('users').insert({
      username: encryptValue(username.trim(), 'users.username'),
      password: hashPassword(password),
      full_name: encryptValue(fullName.trim(), 'users.full_name'),
      role: encryptValue('deleg', 'users.role'),
      approved: false
    });
    if (error) throw error;
    return res.status(201).json({ success: true, message: 'Your account request was sent for approval.' });
  } catch (err) {
    const migration = err.code === '42703' || /approved/i.test(err.message);
    return res.status(500).json({ success: false, error: migration ? 'Account approvals need the database migration before registration can open.' : 'Could not submit account request' });
  }
});

app.get('/api/users/pending', requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase.from('users').select('id, username, full_name, role, created_at').eq('approved', false).order('created_at');
    if (error) throw error;
    return res.json({ success: true, data: (data || []).map(user => ({
      id: user.id,
      username: decryptValue(user.username, 'users.username'),
      fullName: decryptValue(user.full_name, 'users.full_name'),
      role: decryptValue(user.role, 'users.role'),
      createdAt: user.created_at
    })) });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/users/all', requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase.from('users').select('id, username, full_name, role, approved, created_at').order('created_at');
    if (error) throw error;
    return res.json({ success: true, data: (data || []).map(user => ({
      id: user.id,
      username: decryptValue(user.username, 'users.username'),
      fullName: decryptValue(user.full_name, 'users.full_name'),
      role: decryptValue(user.role, 'users.role'),
      approved: user.approved !== false,
      createdAt: user.created_at
    })) });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.patch('/api/users/:id/approval', requireAdmin, async (req, res) => {
  const { approved } = req.body;
  if (typeof approved !== 'boolean') return res.status(400).json({ success: false, error: 'approved must be true or false' });
  try {
    const query = approved
      ? supabase.from('users').update({ approved: true }).eq('id', req.params.id).select('id').maybeSingle()
      : supabase.from('users').delete().eq('id', req.params.id).select('id').maybeSingle();
    const { data, error } = await query;
    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, error: 'Request not found' });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/users/:id', requireAdmin, async (req, res) => {
  const { fullName, username, role, approved, password } = req.body;
  if (!fullName || !username || username.trim().length < 3 || !VALID_ROLES.includes(role) || typeof approved !== 'boolean') {
    return res.status(400).json({ success: false, error: 'Enter a valid name, username, role, and approval status' });
  }
  if (password && password.length < 8) return res.status(400).json({ success: false, error: 'New password must be at least 8 characters' });
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const session = verifySession(token);
  const isSuperAdmin = Boolean(session && isSuperAdminRole(session.role));

  const target = await getUserById(req.params.id);
  if (!target) return res.status(404).json({ success: false, error: 'User not found' });

  if (session.id === req.params.id) {
    if (session.role === 'superadmin' && role !== 'superadmin') {
      return res.status(400).json({ success: false, error: 'You cannot demote your own superadministrator account' });
    }
    if (session.role === 'admin' && !isAdminRole(role)) {
      return res.status(400).json({ success: false, error: 'You cannot demote your own administrator account' });
    }
    if (!approved) {
      return res.status(400).json({ success: false, error: 'You cannot disable your own account' });
    }
  }

  if (!isSuperAdmin) {
    if (target.role === 'superadmin') {
      return res.status(403).json({ success: false, error: 'Only superadministrators can edit a superadministrator account' });
    }
    if (role === 'superadmin') {
      return res.status(403).json({ success: false, error: 'Only superadministrators can grant the superadmin role' });
    }
  }

  const assignedRole = role === 'staff' ? 'deleg' : role;
  try {
    const { data: users, error: lookupError } = await supabase.from('users').select('id, username');
    if (lookupError) throw lookupError;
    const duplicate = (users || []).some(user => user.id !== req.params.id && decryptValue(user.username, 'users.username').toLowerCase() === username.trim().toLowerCase());
    if (duplicate) return res.status(409).json({ success: false, error: 'This username already exists' });
    const update = {
      full_name: encryptValue(fullName.trim(), 'users.full_name'),
      username: encryptValue(username.trim(), 'users.username'),
      role: encryptValue(assignedRole, 'users.role'),
      approved
    };
    if (password) update.password = hashPassword(password);
    const { data, error } = await supabase.from('users').update(update).eq('id', req.params.id).select('id').maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, error: 'User not found' });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/users/:id', requireAdmin, async (req, res) => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const session = verifySession(token);
  if (session.id === req.params.id) return res.status(400).json({ success: false, error: 'You cannot delete your own administrator account' });
  const isSuperAdmin = Boolean(session && isSuperAdminRole(session.role));
  const target = await getUserById(req.params.id);
  if (!target) return res.status(404).json({ success: false, error: 'User not found' });
  if (target.role === 'superadmin' && !isSuperAdmin) {
    return res.status(403).json({ success: false, error: 'Only superadministrators can delete a superadministrator account' });
  }
  try {
    const { data, error } = await supabase.from('users').delete().eq('id', req.params.id).select('id').maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, error: 'User not found' });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// LOGIN Endpoint (Username & Password authentication against PostgreSQL)
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Username and password are required' });
  }

  try {
    if (supabase) {
      const { data: users, error } = await supabase.from('users').select('id, username, password, full_name, role, approved');
      if (error) throw error;
      const data = (users || []).find(user => decryptValue(user.username, 'users.username').toLowerCase() === username.toLowerCase());
      if (!data || !verifyPassword(password, data.password)) {
        return res.status(401).json({ success: false, error: 'Invalid username or password' });
      }
      if (data.approved === false) return res.status(403).json({ success: false, error: 'Your account is waiting for administrator approval' });
      if (!String(data.password).startsWith('scrypt:v1:')) {
        await supabase.from('users').update({ password: hashPassword(password) }).eq('id', data.id);
      }
      const decryptedUsername = decryptValue(data.username, 'users.username');
      const decryptedName = decryptValue(data.full_name, 'users.full_name');
      const decryptedRole = decryptValue(data.role, 'users.role');
      return res.json({
        success: true,
        message: 'Login successful',
        token: signSession({ id: data.id, role: decryptedRole }),
        user: { id: data.id, username: decryptedUsername, fullName: decryptedName || decryptedUsername, role: decryptedRole }
      });
    }
    const { rows } = await pool.query(`SELECT id, username, password, full_name AS "fullName", role, approved FROM users;`);
    const matched = rows.find(user => decryptValue(user.username, 'users.username').toLowerCase() === username.toLowerCase());

    if (!matched || !verifyPassword(password, matched.password)) {
      return res.status(401).json({ success: false, error: 'Invalid username or password' });
    }
    if (matched.approved === false) {
      return res.status(403).json({ success: false, error: 'Your account is waiting for administrator approval' });
    }

    const user = matched;
    if (!String(user.password).startsWith('scrypt:v1:')) {
      await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hashPassword(password), user.id]);
    }
    delete user.password;

    res.json({
      success: true,
      message: 'Login successful',
      token: signSession({ id: user.id, role: decryptValue(user.role, 'users.role') }),
      user: {
        id: user.id,
        username: decryptValue(user.username, 'users.username'),
        fullName: decryptValue(user.fullName, 'users.full_name') || decryptValue(user.username, 'users.username'),
        role: decryptValue(user.role, 'users.role')
      }
    });
  } catch (err) {
    console.error('Error during login:', err.message);
    res.status(500).json({ success: false, error: 'Authentication error' });
  }
});

// GET all students
app.get('/api/students', async (req, res) => {
  try {
    if (supabase) {
      const { data, error } = await supabase.from('students').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return res.json({ success: true, data: (data || []).map(mapStudent) });
    }
    const { rows } = await pool.query(`
      SELECT 
        note,
        kazaa,
        id, 
        first_name AS "firstName", 
        father_name AS "fatherName", 
        family_name AS "familyName", 
        origin, 
        address, 
        school, 
        major, 
        political_affiliation AS "politicalAffiliation",
        status, 
        language, 
        campus, 
        phone, 
        email, 
        in_group AS "inGroup",
        left_group AS "leftGroup",
        created_at AS "createdAt"
      FROM students 
      ORDER BY created_at DESC;
    `);
    res.json({ success: true, data: rows.map(row => ({ ...row, note: readStudentNote(row.note), kazaa: row.kazaa ? decryptValue(row.kazaa, 'students.kazaa') : '' })) });
  } catch (err) {
    console.error('Error fetching students:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET single student by ID
app.get('/api/students/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (supabase) {
      const { data, error } = await supabase.from('students').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ success: false, error: 'Student not found' });
      return res.json({ success: true, data: mapStudent(data) });
    }
    const { rows } = await pool.query(`
      SELECT 
        note,
        kazaa,
        id, 
        first_name AS "firstName", 
        father_name AS "fatherName", 
        family_name AS "familyName", 
        origin, 
        address, 
        school, 
        major, 
        political_affiliation AS "politicalAffiliation",
        status, 
        language, 
        campus, 
        phone, 
        email, 
        in_group AS "inGroup",
        left_group AS "leftGroup",
        created_at AS "createdAt"
      FROM students 
      WHERE id = $1;
    `, [id]);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Student not found' });
    }
    res.json({ success: true, data: { ...rows[0], note: readStudentNote(rows[0].note), kazaa: rows[0].kazaa ? decryptValue(rows[0].kazaa, 'students.kazaa') : '' } });
  } catch (err) {
    console.error('Error fetching student:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST create new student
app.post('/api/students', async (req, res) => {
  const { firstName, fatherName, familyName, origin, address, school, major, politicalAffiliation, status, language, campus, phone, email } = req.body;

  if (!firstName || !fatherName || !familyName || !school || !major || !status || !language || !campus || !phone || !email) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }

  try {
    const duplicateField = await findDuplicateStudent(req.body);
    if (duplicateField) {
      return res.status(409).json({
        success: false,
        error: `This student already exists (matching ${duplicateField})`
      });
    }

    if (supabase) {
      const { data, error } = await supabase.from('students').insert(toStudentRow(req.body)).select().single();
      if (error) throw error;
      return res.status(201).json({ success: true, provider: 'Supabase', data: mapStudent(data), message: 'Student created successfully in Supabase' });
    }
    const encrypted = toStudentRow(req.body);
    const { rows } = await pool.query(
      `INSERT INTO students 
        (first_name, father_name, family_name, origin, address, school, major, political_affiliation, status, language, campus, phone, email)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING 
        id, 
        first_name AS "firstName", 
        father_name AS "fatherName", 
        family_name AS "familyName", 
        origin, 
        address, 
        school, 
        major, 
        political_affiliation AS "politicalAffiliation",
        status, 
        language, 
        campus, 
        phone, 
        email, 
        in_group AS "inGroup",
        left_group AS "leftGroup",
        created_at AS "createdAt";`,
      [encrypted.first_name, encrypted.father_name, encrypted.family_name, encrypted.origin, encrypted.address, encrypted.school, encrypted.major, encrypted.political_affiliation, encrypted.status, encrypted.language, encrypted.campus, encrypted.phone, encrypted.email]
    );

    res.status(201).json({ success: true, provider: 'PostgreSQL', data: rows[0], message: 'Student created successfully' });
  } catch (err) {
    console.error('Error creating student:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT update student
app.put('/api/students/:id', async (req, res) => {
  const { id } = req.params;
  const { firstName, fatherName, familyName, origin, address, school, major, politicalAffiliation, status, language, campus, phone, email } = req.body;

  if (!firstName || !fatherName || !familyName || !school || !major || !status || !language || !campus || !phone || !email) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }

  try {
    const duplicateField = await findDuplicateStudent(req.body, id);
    if (duplicateField) {
      return res.status(409).json({
        success: false,
        error: `Another student already exists with this ${duplicateField}`
      });
    }

    if (supabase) {
      const { data, error } = await supabase.from('students').update(toStudentRow(req.body)).eq('id', id).select().maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ success: false, error: 'Student not found' });
      return res.json({ success: true, data: mapStudent(data), message: 'Student updated successfully' });
    }
    const encrypted = toStudentRow(req.body);
    const { rows } = await pool.query(
      `UPDATE students 
       SET first_name = $1, 
           father_name = $2, 
           family_name = $3, 
           origin = $4,
           address = $5,
           school = $6,
           major = $7,
           political_affiliation = $8,
           status = $9,
           language = $10,
           campus = $11,
           phone = $12,
           email = $13
       WHERE id = $14
       RETURNING 
        id, 
        first_name AS "firstName", 
        father_name AS "fatherName", 
        family_name AS "familyName", 
        origin, 
        address, 
        school, 
        major, 
        political_affiliation AS "politicalAffiliation",
        status, 
        language, 
        campus, 
        phone, 
        email, 
        in_group AS "inGroup",
        left_group AS "leftGroup",
        created_at AS "createdAt";`,
      [encrypted.first_name, encrypted.father_name, encrypted.family_name, encrypted.origin, encrypted.address, encrypted.school, encrypted.major, encrypted.political_affiliation, encrypted.status, encrypted.language, encrypted.campus, encrypted.phone, encrypted.email, id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Student not found' });
    }

    res.json({ success: true, data: rows[0], message: 'Student updated successfully' });
  } catch (err) {
    console.error('Error updating student:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update only the selected student's note; normal profile edits preserve it.
app.patch('/api/students/:id/note', async (req, res) => {
  const session = verifySession((req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
  if (!session) return res.status(401).json({ success: false, error: 'Please sign in again to save notes.' });
  const { id } = req.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return res.status(400).json({ success: false, error: 'Invalid student ID.' });
  }
  const { note } = req.body || {};
  if (typeof note !== 'string' || note.length > 5000) {
    return res.status(400).json({ success: false, error: 'Note must be text of at most 5,000 characters.' });
  }
  try {
    let row;
    if (supabase) {
      const { data: studentRecord } = await supabase.from('students').select('note').eq('id', id).maybeSingle();
      const currentPayload = studentRecord ? parseStudentNotePayload(studentRecord.note) : { text: '', assignedGroup: '' };
      const newPayload = { text: note.trim(), assignedGroup: currentPayload.assignedGroup || '' };
      const encrypted = (newPayload.text || newPayload.assignedGroup)
        ? encryptValue(JSON.stringify(newPayload), 'students.note')
        : '';
      const { data, error } = await supabase.from('students').update({ note: encrypted }).eq('id', id).select('id').maybeSingle();
      if (error) throw error;
      row = data;
    } else {
      const noteRes = await pool.query('SELECT note FROM students WHERE id = $1', [id]);
      const currentPayload = noteRes.rows[0] ? parseStudentNotePayload(noteRes.rows[0].note) : { text: '', assignedGroup: '' };
      const newPayload = { text: note.trim(), assignedGroup: currentPayload.assignedGroup || '' };
      const encrypted = (newPayload.text || newPayload.assignedGroup)
        ? encryptValue(JSON.stringify(newPayload), 'students.note')
        : '';
      const { rows } = await pool.query('UPDATE students SET note = $1 WHERE id = $2 RETURNING id', [encrypted, id]);
      row = rows[0];
    }
    if (!row) return res.status(404).json({ success: false, error: 'Student not found.' });
    res.json({ success: true, data: { id: row.id, note: note.trim() } });
  } catch (err) {
    console.error('Error saving student note:', err.message);
    res.status(500).json({ success: false, error: 'Could not save the note. Please try again.' });
  }
});

// Update only the selected student's kazaa (district); normal profile edits preserve it.
app.patch('/api/students/:id/kazaa', async (req, res) => {
  const session = verifySession((req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
  if (!session) return res.status(401).json({ success: false, error: 'Please sign in again to save kazaa.' });
  const { id } = req.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return res.status(400).json({ success: false, error: 'Invalid student ID.' });
  }
  const { kazaa } = req.body || {};
  const districtValue = typeof kazaa === 'string' ? kazaa.trim() : '';
  if (districtValue && !DISTRICTS.includes(districtValue)) {
    return res.status(400).json({ success: false, error: 'Invalid kazaa district.' });
  }
  const encrypted = districtValue ? encryptValue(districtValue, 'students.kazaa') : '';
  try {
    let row;
    if (supabase) {
      const { data, error } = await supabase.from('students').update({ kazaa: encrypted }).eq('id', id).select('id').maybeSingle();
      if (error) throw error;
      row = data;
    } else {
      const { rows } = await pool.query('UPDATE students SET kazaa = $1 WHERE id = $2 RETURNING id', [encrypted, id]);
      row = rows[0];
    }
    if (!row) return res.status(404).json({ success: false, error: 'Student not found.' });
    res.json({ success: true, data: { id: row.id, kazaa: districtValue } });
  } catch (err) {
    console.error('Error saving student kazaa:', err.message);
    const needsMigration = err.code === '42703' || /kazaa/i.test(err.message);
    res.status(500).json({
      success: false,
      error: needsMigration
        ? 'Kazaa column is not enabled in the database yet. Run the migration in supabase_kazaa_migration.sql.'
        : 'Could not save kazaa. Please try again.'
    });
  }
});

// PATCH group membership without changing the rest of the student record
app.patch('/api/students/:id/group', async (req, res) => {
  const { id } = req.params;
  const { inGroup, leftGroup = false, assignedGroup } = req.body;
  if (typeof inGroup !== 'boolean') {
    return res.status(400).json({ success: false, error: 'inGroup must be true or false' });
  }
  if (typeof leftGroup !== 'boolean') {
    return res.status(400).json({ success: false, error: 'leftGroup must be true or false' });
  }
  if (assignedGroup !== undefined && typeof assignedGroup !== 'string') {
    return res.status(400).json({ success: false, error: 'assignedGroup must be a string' });
  }

  const nextInGroup = leftGroup ? false : inGroup;
  const nextAssignedGroup = leftGroup ? '' : (assignedGroup !== undefined ? assignedGroup.trim() : undefined);

  try {
    if (supabase) {
      let updatePayload = { in_group: nextInGroup, left_group: leftGroup };
      if (nextAssignedGroup !== undefined) {
        updatePayload.assigned_group = nextAssignedGroup ? encryptValue(nextAssignedGroup, 'students.assigned_group') : '';
      }

      let updateResult = await supabase
        .from('students')
        .update(updatePayload)
        .eq('id', id)
        .select()
        .maybeSingle();

      // If assigned_group column is not present in Supabase table (PGRST204 or 42703), fallback to note payload
      if (updateResult.error && (updateResult.error.code === 'PGRST204' || updateResult.error.code === '42703' || /assigned_group/i.test(updateResult.error.message))) {
        const { data: studentRecord } = await supabase.from('students').select('note').eq('id', id).maybeSingle();
        const currentPayload = studentRecord ? parseStudentNotePayload(studentRecord.note) : { text: '' };
        const newPayload = {
          text: currentPayload.text,
          assignedGroup: nextAssignedGroup !== undefined ? nextAssignedGroup : (currentPayload.assignedGroup || '')
        };
        const encryptedNote = (newPayload.text || newPayload.assignedGroup)
          ? encryptValue(JSON.stringify(newPayload), 'students.note')
          : '';

        updateResult = await supabase
          .from('students')
          .update({ in_group: nextInGroup, left_group: leftGroup, note: encryptedNote })
          .eq('id', id)
          .select()
          .maybeSingle();
      }

      if (updateResult.error) throw updateResult.error;
      if (!updateResult.data) return res.status(404).json({ success: false, error: 'Student not found' });
      return res.json({ success: true, data: mapStudent(updateResult.data) });
    }

    // Postgres pool handling
    try {
      const { rows } = await pool.query(
        `UPDATE students SET in_group = $1, left_group = $2, assigned_group = $3 WHERE id = $4
         RETURNING id, in_group AS "inGroup", left_group AS "leftGroup", assigned_group AS "assignedGroup";`,
        [nextInGroup, leftGroup, nextAssignedGroup || '', id]
      );
      if (!rows.length) return res.status(404).json({ success: false, error: 'Student not found' });
      return res.json({ success: true, data: rows[0] });
    } catch (pgErr) {
      if (pgErr.code === '42703' || /assigned_group/i.test(pgErr.message)) {
        const noteRes = await pool.query('SELECT note FROM students WHERE id = $1', [id]);
        const currentPayload = noteRes.rows[0] ? parseStudentNotePayload(noteRes.rows[0].note) : { text: '' };
        const newPayload = {
          text: currentPayload.text,
          assignedGroup: nextAssignedGroup !== undefined ? nextAssignedGroup : (currentPayload.assignedGroup || '')
        };
        const encryptedNote = (newPayload.text || newPayload.assignedGroup)
          ? encryptValue(JSON.stringify(newPayload), 'students.note')
          : '';

        const { rows } = await pool.query(
          `UPDATE students SET in_group = $1, left_group = $2, note = $3 WHERE id = $4
           RETURNING id, in_group AS "inGroup", left_group AS "leftGroup";`,
          [nextInGroup, leftGroup, encryptedNote, id]
        );
        if (!rows.length) return res.status(404).json({ success: false, error: 'Student not found' });
        return res.json({ success: true, data: { ...rows[0], assignedGroup: newPayload.assignedGroup } });
      }
      throw pgErr;
    }
  } catch (err) {
    console.error('Error updating group membership:', err.message);
    const needsMigration = err.code === '42703' || /in_group|left_group/i.test(err.message);
    return res.status(500).json({
      success: false,
      error: needsMigration
        ? 'Group membership is not enabled in the database yet. Run the migration in supabase_schema.sql.'
        : err.message
    });
  }
});

// DELETE student
app.delete('/api/students/:id', async (req, res) => {
  const { id } = req.params;
  try {
    if (supabase) {
      const { data, error } = await supabase.from('students').delete().eq('id', id).select('id').maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ success: false, error: 'Student not found' });
      return res.json({ success: true, message: 'Student deleted successfully' });
    }
    const { rowCount } = await pool.query('DELETE FROM students WHERE id = $1;', [id]);
    if (rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Student not found' });
    }
    res.json({ success: true, message: 'Student deleted successfully' });
  } catch (err) {
    console.error('Error deleting student:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// HTML page routing helpers
const servePage = page => (req, res) => {
  if (hasLocalFilesystem) return res.sendFile(path.join(__dirname, `${page}.html`));
  return res.redirect(302, `/${page}.html`);
};

app.get('/login', servePage('login'));
app.get('/form', servePage('form'));
app.get('/dashboard', servePage('dashboard'));
app.get('/users', servePage('users'));

// Initialize DB and start listening
async function startServer() {
  try {
    await initDb();
    console.log('PostgreSQL database initialized successfully.');
  } catch (err) {
    console.warn('Could not initialize PostgreSQL on startup:', err.message);
  }

  app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = app;
