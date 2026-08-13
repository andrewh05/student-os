const API_BASE = window.location.protocol === 'file:'
  ? 'http://localhost:3000/api'
  : '/api';

async function parseApiResponse(response) {
  const body = await response.text();
  let data;
  try {
    data = body ? JSON.parse(body) : {};
  } catch {
    const detail = body.trim().slice(0, 160) || `HTTP ${response.status}`;
    throw new Error(`API returned ${response.status}: ${detail}`);
  }
  if (!response.ok && !data.error) {
    data.error = `Request failed with HTTP ${response.status}`;
  }
  return data;
}

const form = document.querySelector('#studentForm');
const loginForm = document.querySelector('#loginForm');
const userForm = document.querySelector('#userForm');
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
    window.location.href = 'index.html';
    return;
  }

  try {
    const user = JSON.parse(userJson);
    if (userNameDisplay) {
      userNameDisplay.textContent = user.fullName || user.username || 'Admin';
    }
  } catch (err) {
    localStorage.removeItem('hub_user');
    window.location.href = 'index.html';
  }
}

// Logout handler
if (logoutBtn) {
  logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('hub_user');
    showToast('Logged out', 'You have been signed out successfully.');
    setTimeout(() => {
      window.location.href = 'index.html';
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
      const json = await parseApiResponse(res);

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

if (userForm) {
  userForm.addEventListener('submit', async event => {
    event.preventDefault();
    const message = document.querySelector('#userFormMessage');
    const submitButton = document.querySelector('#userSubmitBtn');
    const values = Object.fromEntries(new FormData(userForm).entries());
    userForm.querySelectorAll('[required]').forEach(input => input.classList.toggle('invalid', !input.validity.valid));
    const invalid = userForm.querySelector(':invalid');
    if (invalid) {
      message.textContent = 'Please complete all required fields correctly.';
      invalid.focus();
      return;
    }
    if (values.password !== values.confirmPassword) {
      message.textContent = 'The passwords do not match.';
      userForm.elements.confirmPassword.classList.add('invalid');
      userForm.elements.confirmPassword.focus();
      return;
    }
    submitButton.disabled = true;
    message.textContent = '';
    delete values.confirmPassword;
    try {
      const response = await fetch(`${API_BASE}/users`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
      const json = await parseApiResponse(response);
      if (!json.success) throw new Error(json.error || 'Could not create user');
      userForm.reset();
      showToast('User created', `${values.fullName} can now sign in to the portal.`);
    } catch (error) {
      message.textContent = error.message;
    } finally {
      submitButton.disabled = false;
    }
  });
  userForm.addEventListener('input', event => {
    event.target.classList.remove('invalid');
    const message = document.querySelector('#userFormMessage');
    if (message) message.textContent = '';
  });
}

// Check Database (Supabase / PostgreSQL) Connection Status
async function checkDbConnection() {
  if (!dbStatusPill || !dbStatusText) return;
  try {
    const res = await fetch(`${API_BASE}/db-status`);
    const data = await parseApiResponse(res);
    if (data.connected) {
      dbStatusPill.classList.remove('disconnected');
      dbStatusPill.classList.add('connected');
      const providerLabel = data.provider || 'Supabase / PostgreSQL';
      dbStatusText.textContent = `${providerLabel} Connected`;
      dbStatusPill.title = `Connected to ${data.database} (${data.count} records stored)`;
    } else {
      dbStatusPill.classList.remove('connected');
      dbStatusPill.classList.add('disconnected');
      dbStatusText.textContent = `Database Offline`;
      dbStatusPill.title = `Database error: ${data.message || 'Could not connect to database'}`;
    }
  } catch (err) {
    dbStatusPill.classList.remove('connected');
    dbStatusPill.classList.add('disconnected');
    dbStatusText.textContent = `Database Offline`;
    dbStatusPill.title = `Connection error: ${err.message}`;
  }
}

// Fetch all students from backend
async function fetchStudents() {
  try {
    const res = await fetch(`${API_BASE}/students`);
    const json = await parseApiResponse(res);
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
          <div class="detail"><small>Major</small><span title="${escapeHtml(student.major)}">${escapeHtml(student.major)}</span></div>
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

  document.querySelectorAll('.major-stat').forEach(card => {
    const major = card.dataset.major;
    const majorCount = students.filter(student => (student.major || '').toLowerCase() === major.toLowerCase()).length;
    const majorPercent = percent(majorCount);
    card.querySelector('b').textContent = majorCount;
    card.querySelector('i').style.width = `${majorPercent}%`;
    card.querySelector('small').textContent = `${majorPercent}% of students`;
  });
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

function showPopup({ title, message, confirmLabel = 'OK', cancelLabel = 'Cancel', showCancel = false, danger = false }) {
  let overlay = document.querySelector('#popupOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'popupOverlay';
    overlay.className = 'popup-overlay';
    overlay.innerHTML = `
      <section class="popup-dialog" role="dialog" aria-modal="true" aria-labelledby="popupTitle" aria-describedby="popupMessage">
        <div class="popup-icon" id="popupIcon">!</div>
        <h2 id="popupTitle"></h2>
        <p id="popupMessage"></p>
        <div class="popup-actions">
          <button type="button" class="popup-cancel" id="popupCancel"></button>
          <button type="button" class="popup-confirm" id="popupConfirm"></button>
        </div>
      </section>`;
    document.body.appendChild(overlay);
  }

  const dialog = overlay.querySelector('.popup-dialog');
  const cancelButton = overlay.querySelector('#popupCancel');
  const confirmButton = overlay.querySelector('#popupConfirm');
  overlay.querySelector('#popupTitle').textContent = title;
  overlay.querySelector('#popupMessage').textContent = message;
  overlay.querySelector('#popupIcon').textContent = danger ? '!' : 'i';
  cancelButton.textContent = cancelLabel;
  cancelButton.hidden = !showCancel;
  confirmButton.textContent = confirmLabel;
  confirmButton.classList.toggle('danger', danger);
  dialog.classList.toggle('is-danger', danger);
  overlay.classList.add('show');

  return new Promise(resolve => {
    const close = result => {
      overlay.classList.remove('show');
      document.removeEventListener('keydown', onKeydown);
      resolve(result);
    };
    const onKeydown = event => {
      if (event.key === 'Escape') close(false);
    };
    confirmButton.onclick = () => close(true);
    cancelButton.onclick = () => close(false);
    overlay.onclick = event => { if (event.target === overlay) close(false); };
    document.addEventListener('keydown', onKeydown);
    requestAnimationFrame(() => confirmButton.focus());
  });
}

// Delete student record from backend
async function deleteStudentRecord(id) {
  const confirmed = await showPopup({
    title: 'Delete student record?',
    message: 'This student will be permanently removed. This action cannot be undone.',
    confirmLabel: 'Delete record',
    showCancel: true,
    danger: true
  });
  if (!confirmed) {
    return;
  }
  try {
    const res = await fetch(`${API_BASE}/students/${id}`, { method: 'DELETE' });
    const json = await parseApiResponse(res);
    if (json.success) {
      showToast('Record deleted', 'The student record was removed.');
      fetchStudents();
      checkDbConnection();
    } else {
      await showPopup({ title: 'Could not delete record', message: json.error || 'Please try again.', danger: true });
    }
  } catch (err) {
    await showPopup({ title: 'Something went wrong', message: err.message, danger: true });
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

      json = await parseApiResponse(res);

      if (json.success) {
        showToast(
          editingId ? 'Record updated in database' : 'Student saved to database',
          'The student profile and credentials were saved successfully.'
        );
        setTimeout(() => {
          window.location.href = 'dashboard.html';
        }, 1200);
      } else {
        const msg = document.querySelector('#formMessage');
        if (msg) msg.textContent = `Error: ${json.error || 'Failed to save to database'}`;
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
  if (submitText) submitText.textContent = 'Update student profile';
  if (cancelEdit) cancelEdit.classList.remove('hidden');

  try {
    const res = await fetch(`${API_BASE}/students/${editId}`);
    const json = await parseApiResponse(res);
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
    const columns = ['firstName','fatherName','familyName','school','address','origin','phone','major','status','language','campus','email'];
    const csv = [columns.join(','), ...students.map(s => columns.map(key => `"${String(s[key] || '').replaceAll('"','""')}"`).join(','))].join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], {type:'text/csv'}));
    link.download = 'student-records.csv';
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
