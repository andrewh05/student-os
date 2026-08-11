const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { pool, initDb, checkDbConnection } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Health & DB Status Endpoint
app.get('/api/db-status', async (req, res) => {
  const status = await checkDbConnection();
  res.json(status);
});

// LOGIN Endpoint (Username & Password authentication against PostgreSQL)
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Username and password are required' });
  }

  try {
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

// GET all students (including username & password)
app.get('/api/students', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT 
        id, 
        first_name AS "firstName", 
        father_name AS "fatherName", 
        family_name AS "familyName", 
        username,
        password,
        origin, 
        address, 
        school, 
        major, 
        status, 
        language, 
        campus, 
        phone, 
        email, 
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
    const { rows } = await pool.query(`
      SELECT 
        id, 
        first_name AS "firstName", 
        father_name AS "fatherName", 
        family_name AS "familyName", 
        username,
        password,
        origin, 
        address, 
        school, 
        major, 
        status, 
        language, 
        campus, 
        phone, 
        email, 
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
  const { firstName, fatherName, familyName, username, password, origin, address, school, major, status, language, campus, phone, email } = req.body;

  if (!firstName || !fatherName || !familyName || !school || !major || !status || !language || !campus || !phone || !email) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }

  // Generate fallback username if not explicitly provided
  const studentUsername = username ? username.trim() : `${firstName.toLowerCase()}_${familyName.toLowerCase()}`;
  const studentPassword = password ? password : 'StudentPass123!';

  try {
    const { rows } = await pool.query(
      `INSERT INTO students 
        (first_name, father_name, family_name, username, password, origin, address, school, major, status, language, campus, phone, email)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING 
        id, 
        first_name AS "firstName", 
        father_name AS "fatherName", 
        family_name AS "familyName", 
        username,
        password,
        origin, 
        address, 
        school, 
        major, 
        status, 
        language, 
        campus, 
        phone, 
        email, 
        created_at AS "createdAt";`,
      [firstName, fatherName, familyName, studentUsername, studentPassword, origin || '', address || '', school, major, status, language, campus, phone, email]
    );

    res.status(201).json({ success: true, data: rows[0], message: 'Student created successfully' });
  } catch (err) {
    console.error('Error creating student:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT update student
app.put('/api/students/:id', async (req, res) => {
  const { id } = req.params;
  const { firstName, fatherName, familyName, username, password, origin, address, school, major, status, language, campus, phone, email } = req.body;

  if (!firstName || !fatherName || !familyName || !school || !major || !status || !language || !campus || !phone || !email) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }

  const studentUsername = username ? username.trim() : `${firstName.toLowerCase()}_${familyName.toLowerCase()}`;
  const studentPassword = password ? password : 'StudentPass123!';

  try {
    const { rows } = await pool.query(
      `UPDATE students 
       SET first_name = $1, 
           father_name = $2, 
           family_name = $3, 
           username = $4,
           password = $5,
           origin = $6, 
           address = $7, 
           school = $8, 
           major = $9, 
           status = $10, 
           language = $11, 
           campus = $12, 
           phone = $13, 
           email = $14
       WHERE id = $15
       RETURNING 
        id, 
        first_name AS "firstName", 
        father_name AS "fatherName", 
        family_name AS "familyName", 
        username,
        password,
        origin, 
        address, 
        school, 
        major, 
        status, 
        language, 
        campus, 
        phone, 
        email, 
        created_at AS "createdAt";`,
      [firstName, fatherName, familyName, studentUsername, studentPassword, origin || '', address || '', school, major, status, language, campus, phone, email, id]
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

// DELETE student
app.delete('/api/students/:id', async (req, res) => {
  const { id } = req.params;
  try {
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
