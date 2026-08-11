const API_BASE = '/api';

const form = document.querySelector('#studentForm');
const loginForm = document.querySelector('#loginForm');
const recordsGrid = document.querySelector('#recordsGrid');
const emptyState = document.querySelector('#emptyState');
const recordCount = document.querySelector('#recordCount');
const searchInput = document.querySelector('#searchInput');
const toast = document.querySelector('#toast');
const dbStatusPill = document.querySelector('#dbStatusPill');
const dbStatusText = document.querySelector('#dbStatusText');
const logoutBtn = document.querySelector('#logoutBtn');
const userNameDisplay = document.querySelector('#userNameDisplay');

let students = [];
let editingId = null;

const escapeHtml = (value = '') => String(value || '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[char]));

// Authentication Protection
function checkAuth() {
  const currentPage = document.body.dataset.page;
  const userJson = localStorage.getItem('hub_user');

  if (currentPage === 'login') {
    if (userJson) {
      window.location.href = 'dashboard.html';
    }
    return;
  }

  if (!userJson) {
    window.location.href = 'login.html';
    return;
  }

  try {
    const user = JSON.parse(userJson);
    if (userNameDisplay) {
      userNameDisplay.textContent = user.fullName || user.username || 'Admin';
    }
  } catch (err) {
    localStorage.removeItem('hub_user');
    window.location.href = 'login.html';
  }
}

// Logout handler
if (logoutBtn) {
  logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('hub_user');
    showToast('Logged out', 'You have been signed out successfully.');
    setTimeout(() => {
      window.location.href = 'login.html';
    }, 800);
  });
}

// Login Form Submit handler
if (loginForm) {
  loginForm.addEventListener('submit', async event => {
    event.preventDefault();
    const usernameInput = loginForm.querySelector('#username');
    const passwordInput = loginForm.querySelector('#password');
    const loginError = document.querySelector('#loginError');
    const loginSubmitBtn = document.querySelector('#loginSubmitBtn');

    const username = usernameInput ? usernameInput.value.trim() : '';
    const password = passwordInput ? passwordInput.value : '';

    if (!username || !password) {
      if (loginError) loginError.textContent = 'Please enter both username and password.';
      return;
    }

    if (loginSubmitBtn) loginSubmitBtn.disabled = true;
    if (loginError) loginError.textContent = '';

    try {
      const res = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const json = await res.json();

      if (json.success) {
        localStorage.setItem('hub_user', JSON.stringify(json.user));
        showToast('Login Successful', `Welcome back, ${json.user.fullName || json.user.username}!`);
        setTimeout(() => {
          window.location.href = 'dashboard.html';
        }, 1000);
      } else {
        if (loginError) loginError.textContent = json.error || 'Invalid username or password.';
        if (loginSubmitBtn) loginSubmitBtn.disabled = false;
      }
    } catch (err) {
      if (loginError) loginError.textContent = `Server error: ${err.message}`;
      if (loginSubmitBtn) loginSubmitBtn.disabled = false;
    }
  });
}

// Check PostgreSQL Database Connection Status
async function checkDbConnection() {
  if (!dbStatusPill || !dbStatusText) return;
  try {
    const res = await fetch(`${API_BASE}/db-status`);
    const data = await res.json();
    if (data.connected) {
      dbStatusPill.classList.remove('disconnected');
      dbStatusPill.classList.add('connected');
      dbStatusText.textContent = `PostgreSQL Connected`;
      dbStatusPill.title = `Connected to PostgreSQL (${data.count} records stored)`;
    } else {
      dbStatusPill.classList.remove('connected');
      dbStatusPill.classList.add('disconnected');
      dbStatusText.textContent = `PostgreSQL Offline`;
      dbStatusPill.title = `Database error: ${data.message || 'Could not connect to PostgreSQL'}`;
    }
  } catch (err) {
    dbStatusPill.classList.remove('connected');
    dbStatusPill.classList.add('disconnected');
    dbStatusText.textContent = `PostgreSQL Offline`;
    dbStatusPill.title = `Connection error: ${err.message}`;
  }
}

// Fetch all students from PostgreSQL backend
async function fetchStudents() {
  try {
    const res = await fetch(`${API_BASE}/students`);
    const json = await res.json();
    if (json.success) {
      students = json.data || [];
      renderStudents(searchInput ? searchInput.value : '');
    } else {
      console.error('Failed to fetch students:', json.error);
    }
  } catch (err) {
    console.error('Error connecting to backend:', err);
  }
}

// Render student grid and stats (for dashboard)
function renderStudents(query = '') {
  if (!recordsGrid) return;
  const needle = query.trim().toLowerCase();
  const filtered = students.filter(s => 
    Object.values(s).some(value => String(value).toLowerCase().includes(needle))
  );

  if (recordCount) recordCount.textContent = students.length;
  updateStats();

  if (emptyState) {
    emptyState.style.display = filtered.length ? 'none' : 'block';
  }

  recordsGrid.innerHTML = filtered.map(student => {
    const fullName = `${student.firstName} ${student.fatherName} ${student.familyName}`;
    const initials = `${student.firstName?.[0] || ''}${student.familyName?.[0] || ''}`.toUpperCase();
    return `
      <article class="student-card">
        <span class="tag">${escapeHtml(student.status)}</span>
        <div class="student-top">
          <div class="avatar">${escapeHtml(initials)}</div>
          <div>
            <h3>${escapeHtml(fullName)}</h3>
            <p>${escapeHtml(student.major)}</p>
          </div>
        </div>
        <div class="student-details">
          <div class="detail"><small>Username</small><span class="highlight-orange">@${escapeHtml(student.username || 'n/a')}</span></div>
          <div class="detail"><small>Password</small><span>••••••••</span></div>
          <div class="detail"><small>School</small><span title="${escapeHtml(student.school)}">${escapeHtml(student.school)}</span></div>
          <div class="detail"><small>Campus</small><span>${escapeHtml(student.campus)}</span></div>
          <div class="detail"><small>Phone</small><span>${escapeHtml(student.phone)}</span></div>
          <div class="detail"><small>Language</small><span>${escapeHtml(student.language)}</span></div>
          <div class="detail"><small>Email</small><span title="${escapeHtml(student.email)}">${escapeHtml(student.email)}</span></div>
          <div class="detail"><small>Origin</small><span>${escapeHtml(student.origin || 'N/A')}</span></div>
        </div>
        <div class="card-actions">
          <a class="btn-action edit" href="form.html?edit=${student.id}">Edit record</a>
          <button type="button" class="btn-action delete" onclick="deleteStudentRecord('${student.id}')">Delete</button>
        </div>
      </article>
    `;
  }).join('');
}

// Update dashboard metrics and charts
function updateStats() {
  const total = students.length;
  const count = (key, value) => students.filter(s => s[key] === value).length;
  const newCount = count('status', 'New');
  const returningCount = count('status', 'Mu3id');
  const fanar = count('campus', 'Fanar');
  const amshit = count('campus', 'Amshit');
  const french = count('language', 'French');
  const english = count('language', 'English');
  const percent = value => total ? Math.round(value / total * 100) : 0;
  const schools = new Set(students.map(s => (s.school || '').trim().toLowerCase()).filter(Boolean)).size;

  const setText = (id, value) => {
    const el = document.querySelector(id);
    if (el) el.textContent = value;
  };

  setText('#totalStudents', total);
  setText('#newStudents', newCount);
  setText('#returningStudents', returningCount);
  setText('#schoolCount', schools);
  setText('#newPercentage', `${percent(newCount)}% of total`);
  setText('#returningPercentage', `${percent(returningCount)}% of total`);
  setText('#fanarCount', fanar);
  setText('#amshitCount', amshit);
  setText('#donutTotal', total);
  setText('#frenchPercent', `${percent(french)}%`);
  setText('#englishPercent', `${percent(english)}%`);
  setText('#frenchCount', `${french} student${french === 1 ? '' : 's'}`);
  setText('#englishCount', `${english} student${english === 1 ? '' : 's'}`);
  setText('#directorySummary', `${total} student${total === 1 ? '' : 's'}`);

  const fanarBar = document.querySelector('#fanarBar');
  const amshitBar = document.querySelector('#amshitBar');
  const frenchBar = document.querySelector('#frenchBar');
  const englishBar = document.querySelector('#englishBar');
  const campusDonut = document.querySelector('#campusDonut');

  if (fanarBar) fanarBar.style.width = `${percent(fanar)}%`;
  if (amshitBar) amshitBar.style.width = `${percent(amshit)}%`;
  if (frenchBar) frenchBar.style.width = `${percent(french)}%`;
  if (englishBar) englishBar.style.width = `${percent(english)}%`;
  if (campusDonut) campusDonut.style.setProperty('--fanar', `${percent(fanar)}%`);
}

// Show Toast notification
function showToast(title, message) {
  if (!toast) return;
  const toastTitle = document.querySelector('#toastTitle');
  const toastMsg = document.querySelector('#toastMsg');
  if (toastTitle) toastTitle.textContent = title;
  if (toastMsg) toastMsg.textContent = message;
  toast.classList.add('show');
  window.setTimeout(() => toast.classList.remove('show'), 3500);
}

// Delete student record from PostgreSQL
async function deleteStudentRecord(id) {
  if (!confirm('Are you sure you want to delete this student record from PostgreSQL? This action cannot be undone.')) {
    return;
  }
  try {
    const res = await fetch(`${API_BASE}/students/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.success) {
      showToast('Record deleted', 'The student record was removed from PostgreSQL.');
      fetchStudents();
      checkDbConnection();
    } else {
      alert(`Could not delete record: ${json.error}`);
    }
  } catch (err) {
    alert(`Error deleting record: ${err.message}`);
  }
}

// Form logic (Add / Edit Student)
if (form) {
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const required = [...form.querySelectorAll('[required]')];
    required.forEach(input => input.classList.toggle('invalid', !input.validity.valid));
    const firstInvalid = required.find(input => !input.validity.valid);
    if (firstInvalid) {
      const msg = document.querySelector('#formMessage');
      if (msg) msg.textContent = 'Please complete all required fields correctly.';
      firstInvalid.focus();
      return;
    }

    const studentData = Object.fromEntries(new FormData(form).entries());
    const submitBtn = document.querySelector('#submitBtn');
    if (submitBtn) submitBtn.disabled = true;

    try {
      let res, json;
      if (editingId) {
        res = await fetch(`${API_BASE}/students/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(studentData),
        });
      } else {
        res = await fetch(`${API_BASE}/students`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(studentData),
        });
      }

      json = await res.json();

      if (json.success) {
        showToast(
          editingId ? 'Record updated in PostgreSQL' : 'Student saved to PostgreSQL',
          'The student profile and credentials were persisted to PostgreSQL.'
        );
        setTimeout(() => {
          window.location.href = 'dashboard.html';
        }, 1200);
      } else {
        const msg = document.querySelector('#formMessage');
        if (msg) msg.textContent = `Error: ${json.error || 'Failed to save to PostgreSQL'}`;
        if (submitBtn) submitBtn.disabled = false;
      }
    } catch (err) {
      const msg = document.querySelector('#formMessage');
      if (msg) msg.textContent = `Server connection error: ${err.message}`;
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  form.addEventListener('input', event => {
    event.target.classList.remove('invalid');
    const msg = document.querySelector('#formMessage');
    if (msg) msg.textContent = '';
  });
}

// Handle Form Edit Mode pre-fill if ?edit=ID is in URL
async function initFormEditMode() {
  const params = new URLSearchParams(window.location.search);
  const editId = params.get('edit');
  if (!editId || !form) return;

  editingId = editId;
  const formTitle = document.querySelector('#formTitle');
  const pageHeading = document.querySelector('#pageHeading');
  const submitText = document.querySelector('#submitText');
  const cancelEdit = document.querySelector('#cancelEdit');

  if (formTitle) formTitle.textContent = 'Edit student profile';
  if (pageHeading) pageHeading.innerHTML = 'Edit <em>Student Record</em>';
  if (submitText) submitText.textContent = 'Update student in PostgreSQL';
  if (cancelEdit) cancelEdit.classList.remove('hidden');

  try {
    const res = await fetch(`${API_BASE}/students/${editId}`);
    const json = await res.json();
    if (json.success && json.data) {
      const student = json.data;
      Object.entries(student).forEach(([key, value]) => {
        const input = form.querySelector(`[name="${key}"][value="${CSS.escape(value || '')}"]`) || form.querySelector(`[name="${key}"]`);
        if (input) {
          if (input.type === 'radio') {
            input.checked = true;
          } else {
            input.value = value || '';
          }
        }
      });
    }
  } catch (err) {
    console.error('Failed to load student for editing:', err);
  }
}

// Search input listener
if (searchInput) {
  searchInput.addEventListener('input', () => renderStudents(searchInput.value));
}

// Export CSV button listener
const exportBtn = document.querySelector('#exportBtn');
if (exportBtn) {
  exportBtn.addEventListener('click', () => {
    if (!students.length) return showToast('Nothing to export', 'No student records available.');
    const columns = ['firstName','fatherName','familyName','username','password','school','address','origin','phone','major','status','language','campus','email'];
    const csv = [columns.join(','), ...students.map(s => columns.map(key => `"${String(s[key] || '').replaceAll('"','""')}"`).join(','))].join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], {type:'text/csv'}));
    link.download = 'postgresql-student-records.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  });
}

// Page Initialization
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
  checkDbConnection();
  fetchStudents();
  initFormEditMode();
  // Periodically re-verify DB connection status
  setInterval(checkDbConnection, 15000);
});
