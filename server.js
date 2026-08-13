const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { pool, supabase, supabaseRequested, initDb, checkDbConnection } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

const mapStudent = row => ({
  id: row.id,
  firstName: row.first_name,
  fatherName: row.father_name,
  familyName: row.family_name,
  origin: row.origin,
  address: row.address,
  school: row.school,
  major: row.major,
  status: row.status,
  language: row.language,
  campus: row.campus,
  phone: row.phone,
  email: row.email,
  inGroup: Boolean(row.in_group),
  createdAt: row.created_at
});

const toStudentRow = student => ({
  first_name: student.firstName,
  father_name: student.fatherName,
  family_name: student.familyName,
  origin: student.origin || '',
  address: student.address || '',
  school: student.school,
  major: student.major,
  status: student.status,
  language: student.language,
  campus: student.campus,
  phone: student.phone,
  email: student.email
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Health & DB Status Endpoint
app.get('/api/db-status', async (req, res) => {
  const status = await checkDbConnection();
  res.json(status);
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
  const { fullName, username, password, role = 'staff' } = req.body;
  if (!fullName || !username || !password) {
    return res.status(400).json({ success: false, error: 'Full name, username and password are required' });
  }
  if (username.trim().length < 3 || password.length < 8) {
    return res.status(400).json({ success: false, error: 'Username must be at least 3 characters and password at least 8 characters' });
  }
  if (!['admin', 'staff'].includes(role)) {
    return res.status(400).json({ success: false, error: 'Invalid user role' });
  }
  try {
    if (supabase) {
      const { data, error } = await supabase.from('users').insert({ username: username.trim(), password, full_name: fullName.trim(), role }).select('id, username, full_name, role').single();
      if (error) {
        if (error.code === '23505') return res.status(409).json({ success: false, error: 'This username already exists' });
        throw error;
      }
      return res.status(201).json({ success: true, provider: 'Supabase', data, message: 'Portal user created successfully' });
    }
    const { rows } = await pool.query(
      `INSERT INTO users (username, password, full_name, role) VALUES ($1, $2, $3, $4) RETURNING id, username, full_name AS "fullName", role`,
      [username.trim(), password, fullName.trim(), role]
    );
    return res.status(201).json({ success: true, provider: 'PostgreSQL', data: rows[0], message: 'Portal user created successfully' });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ success: false, error: 'This username already exists' });
    console.error('Error creating portal user:', err.message);
    return res.status(500).json({ success: false, error: 'Could not create portal user' });
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
      const { data, error } = await supabase
        .from('users')
        .select('id, username, password, full_name, role')
        .ilike('username', username)
        .maybeSingle();
      if (error) throw error;
      if (!data || data.password !== password) {
        return res.status(401).json({ success: false, error: 'Invalid username or password' });
      }
      return res.json({
        success: true,
        message: 'Login successful',
        token: `token-${data.id}-${Date.now()}`,
        user: { id: data.id, username: data.username, fullName: data.full_name || data.username, role: data.role }
      });
    }
    const { rows } = await pool.query(
      `SELECT id, username, password, full_name AS "fullName", role FROM users WHERE LOWER(username) = LOWER($1);`,
      [username]
    );

    if (rows.length === 0 || rows[0].password !== password) {
      return res.status(401).json({ success: false, error: 'Invalid username or password' });
    }

    const user = rows[0];
    delete user.password;

    res.json({
      success: true,
      message: 'Login successful',
      token: `token-${user.id}-${Date.now()}`,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName || user.username,
        role: user.role
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
        id, 
        first_name AS "firstName", 
        father_name AS "fatherName", 
        family_name AS "familyName", 
        origin, 
        address, 
        school, 
        major, 
        status, 
        language, 
        campus, 
        phone, 
        email, 
        in_group AS "inGroup",
        created_at AS "createdAt"
      FROM students 
      ORDER BY created_at DESC;
    `);
    res.json({ success: true, data: rows });
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
        id, 
        first_name AS "firstName", 
        father_name AS "fatherName", 
        family_name AS "familyName", 
        origin, 
        address, 
        school, 
        major, 
        status, 
        language, 
        campus, 
        phone, 
        email, 
        in_group AS "inGroup",
        created_at AS "createdAt"
      FROM students 
      WHERE id = $1;
    `, [id]);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Student not found' });
    }
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('Error fetching student:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST create new student
app.post('/api/students', async (req, res) => {
  const { firstName, fatherName, familyName, origin, address, school, major, status, language, campus, phone, email } = req.body;

  if (!firstName || !fatherName || !familyName || !school || !major || !status || !language || !campus || !phone || !email) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }

  try {
    if (supabase) {
      const { data, error } = await supabase.from('students').insert(toStudentRow(req.body)).select().single();
      if (error) throw error;
      return res.status(201).json({ success: true, provider: 'Supabase', data: mapStudent(data), message: 'Student created successfully in Supabase' });
    }
    const { rows } = await pool.query(
      `INSERT INTO students 
        (first_name, father_name, family_name, origin, address, school, major, status, language, campus, phone, email)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING 
        id, 
        first_name AS "firstName", 
        father_name AS "fatherName", 
        family_name AS "familyName", 
        origin, 
        address, 
        school, 
        major, 
        status, 
        language, 
        campus, 
        phone, 
        email, 
        in_group AS "inGroup",
        created_at AS "createdAt";`,
      [firstName, fatherName, familyName, origin || '', address || '', school, major, status, language, campus, phone, email]
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
  const { firstName, fatherName, familyName, origin, address, school, major, status, language, campus, phone, email } = req.body;

  if (!firstName || !fatherName || !familyName || !school || !major || !status || !language || !campus || !phone || !email) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }

  try {
    if (supabase) {
      const { data, error } = await supabase.from('students').update(toStudentRow(req.body)).eq('id', id).select().maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ success: false, error: 'Student not found' });
      return res.json({ success: true, data: mapStudent(data), message: 'Student updated successfully' });
    }
    const { rows } = await pool.query(
      `UPDATE students 
       SET first_name = $1, 
           father_name = $2, 
           family_name = $3, 
           origin = $4,
           address = $5,
           school = $6,
           major = $7,
           status = $8,
           language = $9,
           campus = $10,
           phone = $11,
           email = $12
       WHERE id = $13
       RETURNING 
        id, 
        first_name AS "firstName", 
        father_name AS "fatherName", 
        family_name AS "familyName", 
        origin, 
        address, 
        school, 
        major, 
        status, 
        language, 
        campus, 
        phone, 
        email, 
        in_group AS "inGroup",
        created_at AS "createdAt";`,
      [firstName, fatherName, familyName, origin || '', address || '', school, major, status, language, campus, phone, email, id]
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

// PATCH group membership without changing the rest of the student record
app.patch('/api/students/:id/group', async (req, res) => {
  const { id } = req.params;
  const { inGroup } = req.body;
  if (typeof inGroup !== 'boolean') {
    return res.status(400).json({ success: false, error: 'inGroup must be true or false' });
  }

  try {
    if (supabase) {
      const { data, error } = await supabase
        .from('students')
        .update({ in_group: inGroup })
        .eq('id', id)
        .select()
        .maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ success: false, error: 'Student not found' });
      return res.json({ success: true, data: mapStudent(data) });
    }

    const { rows } = await pool.query(
      `UPDATE students SET in_group = $1 WHERE id = $2 RETURNING id, in_group AS "inGroup";`,
      [inGroup, id]
    );
    if (!rows.length) return res.status(404).json({ success: false, error: 'Student not found' });
    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('Error updating group membership:', err.message);
    const needsMigration = err.code === '42703' || /in_group/i.test(err.message);
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
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/form', (req, res) => {
  res.sendFile(path.join(__dirname, 'form.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

app.get('/users', (req, res) => {
  res.sendFile(path.join(__dirname, 'users.html'));
});

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
