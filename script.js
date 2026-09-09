const API_BASE = window.location.protocol === 'file:'
  ? 'http://localhost:3000/api'
  : '/api';

// Shared light/dark appearance
const savedTheme = localStorage.getItem('student_os_theme');
const preferredTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
document.documentElement.dataset.theme = savedTheme || preferredTheme;

function setupThemeToggle() {
  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'themeToggle';
  button.className = 'theme-toggle';

  const updateButton = () => {
    const dark = document.documentElement.dataset.theme === 'dark';
    button.innerHTML = `<span aria-hidden="true">${dark ? '☀' : '☾'}</span><b>${dark ? 'Light' : 'Dark'}</b>`;
    button.setAttribute('aria-label', `Switch to ${dark ? 'light' : 'dark'} mode`);
    button.title = `Switch to ${dark ? 'light' : 'dark'} mode`;
  };

  button.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('student_os_theme', next);
    updateButton();
  });

  updateButton();
  const headerRight = document.querySelector('.header-right');
  if (headerRight) headerRight.appendChild(button);
  else document.body.appendChild(button);
}

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
const signupForm = document.querySelector('#signupForm');
const pendingUsers = document.querySelector('#pendingUsers');
const allUsersList = document.querySelector('#allUsersList');
const recordsGrid = document.querySelector('#recordsGrid');
const emptyState = document.querySelector('#emptyState');
const recordCount = document.querySelector('#recordCount');
const searchInput = document.querySelector('#searchInput');
const statusFilter = document.querySelector('#statusFilter');
const majorFilter = document.querySelector('#majorFilter');
const campusFilter = document.querySelector('#campusFilter');
const languageFilter = document.querySelector('#languageFilter');
const groupFilter = document.querySelector('#groupFilter');
const clearFilters = document.querySelector('#clearFilters');
const toast = document.querySelector('#toast');
const dbStatusPill = document.querySelector('#dbStatusPill');
const dbStatusText = document.querySelector('#dbStatusText');
const logoutBtn = document.querySelector('#logoutBtn');
const userNameDisplay = document.querySelector('#userNameDisplay');
const backupStatus = document.querySelector('#backupStatus');

let students = [];
let editingId = null;
let currentPoliticalGroup = 'all';

function getStudentAssignedGroup(student) {
  const norm = (student?.assignedGroup || '').trim().toLowerCase();
  if (norm === 'grp a,b' || norm === 'a,b') return 'Grp A,B';
  if (norm === 'grp c,d' || norm === 'c,d') return 'Grp C,D';
  if (norm === 'grp e1' || norm === 'e1') return 'Grp E1';
  if (norm === 'grp e2' || norm === 'e2') return 'Grp E2';
  return '';
}
let systemUsers = [];

const escapeHtml = (value = '') => String(value || '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[char]));

// Academic Section Configuration
const MISPCE_MAJORS_LIST = ['Mathematics', 'Informatics', 'Statistics', 'Physics', 'Chemistry', 'Electronics'];
const CSVT_MAJORS_LIST = ['Biology', 'Biochemistry', 'Chemistry'];

function inferSectionFromMajor(major = '') {
  const norm = String(major || '').trim().toLowerCase();
  if (['biology', 'bio', 'biologie', 'biochemistry', 'biochimie', 'ciochimie'].includes(norm)) {
    return 'csvt';
  }
  return 'mispce';
}

function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem('hub_user') || '{}');
  } catch {
    return {};
  }
}

// Authentication Protection
function getCurrentUserRole() {
  const user = getCurrentUser();
  return (user.role || 'deleg').toLowerCase();
}

function getCurrentUserSection() {
  const user = getCurrentUser();
  const role = (user.role || 'deleg').toLowerCase();
  if (role === 'superadmin') return 'all';
  return (user.section || 'mispce').toLowerCase();
}

function isCurrentUserDeleg() {
  const role = getCurrentUserRole();
  return role !== 'admin' && role !== 'superadmin';
}

function checkAuth() {
  const currentPage = document.body.dataset.page;
  const userJson = localStorage.getItem('hub_user');

  if (currentPage === 'login') {
    if (userJson) {
      window.location.replace('dashboard.html');
      return false;
    }
    return true;
  }

  if (currentPage === 'signup') return true;

  if (!userJson) {
    window.location.replace('login.html');
    return false;
  }

  try {
    const user = JSON.parse(userJson);
    const role = (user.role || 'deleg').toLowerCase();
    const isSuperAdmin = role === 'superadmin';
    const isAdmin = role === 'admin' || isSuperAdmin;
    const isDeleg = !isAdmin;
    const userSec = (user.section || (isSuperAdmin ? 'all' : 'mispce')).toLowerCase();

    if (userNameDisplay) {
      let roleLabel = 'Deleg';
      if (isSuperAdmin) {
        roleLabel = 'Superadmin';
      } else if (role === 'admin') {
        roleLabel = userSec !== 'all' ? `Admin - ${userSec.toUpperCase()}` : 'Admin';
      } else {
        roleLabel = `Deleg - ${userSec.toUpperCase()}`;
      }
      userNameDisplay.textContent = `${user.fullName || user.username || 'User'} (${roleLabel})`;
      userNameDisplay.title = `Signed in as ${user.username} (${roleLabel})`;
    }

    if (isDeleg) {
      document.body.classList.add('role-deleg');

      // Hide restricted nav links (Kazaa, Users)
      document.querySelectorAll('.topbar .nav-links a[href*="kazaa"], .topbar .nav-links a[href*="users"]').forEach(el => {
        el.style.display = 'none';
      });

      // Hide export button on dashboard
      const exportBtn = document.querySelector('#exportBtn');
      if (exportBtn) exportBtn.style.display = 'none';

      // Hide section distribution and political cards on dashboard
      const classInsightCard = document.querySelector('.class-insight-card');
      if (classInsightCard) classInsightCard.style.display = 'none';

      const politicalStatsCard = document.querySelector('.political-stats-card');
      if (politicalStatsCard) politicalStatsCard.style.display = 'none';

      // Deleg is restricted from: users, kazaa, kazaa-export, backup, and form.html in EDIT mode
      const restrictedPages = ['users', 'kazaa', 'kazaa-export', 'backup'];
      if (restrictedPages.includes(currentPage)) {
        window.location.replace('dashboard.html');
        return false;
      }
      if (currentPage === 'form' && new URLSearchParams(window.location.search).has('edit')) {
        window.location.replace('dashboard.html');
        return false;
      }
    }
  } catch (err) {
    localStorage.removeItem('hub_user');
    localStorage.removeItem('hub_token');
    window.location.replace('login.html');
    return false;
  }

  return true;
}

// Logout handler
if (logoutBtn) {
  logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('hub_user');
    showToast('Logged out', 'You have been signed out successfully.');
    setTimeout(() => {
      window.location.replace('login.html');
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
        localStorage.setItem('hub_token', json.token);
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

if (signupForm) {
  signupForm.addEventListener('submit', async event => {
    event.preventDefault();
    const message = document.querySelector('#signupMessage');
    const button = document.querySelector('#signupSubmitBtn');
    const values = Object.fromEntries(new FormData(signupForm).entries());
    if (values.password !== values.confirmPassword) {
      message.textContent = 'The passwords do not match.';
      return;
    }
    button.disabled = true;
    message.textContent = '';
    delete values.confirmPassword;
    try {
      const response = await fetch(`${API_BASE}/signup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
      const json = await parseApiResponse(response);
      if (!json.success) throw new Error(json.error || 'Could not submit request');
      signupForm.reset();
      message.classList.add('success-message');
      message.textContent = 'Request sent. You can sign in after an administrator approves your account.';
    } catch (error) {
      message.classList.remove('success-message');
      message.textContent = error.message;
      button.disabled = false;
    }
  });
}

async function loadPendingUsers() {
  if (!pendingUsers) return;
  const count = document.querySelector('#pendingCount');
  try {
    const response = await fetch(`${API_BASE}/users/pending`, { headers: { Authorization: `Bearer ${localStorage.getItem('hub_token') || ''}` } });
    const json = await parseApiResponse(response);
    if (!json.success) throw new Error(json.error || 'Could not load requests');
    count.textContent = `${json.data.length} pending`;
    pendingUsers.innerHTML = json.data.length ? json.data.map(user => `
      <article class="pending-user">
        <div>
          <strong>${escapeHtml(user.fullName)}</strong>
          <span>@${escapeHtml(user.username)}</span>
          <small>Requested ${new Date(user.createdAt).toLocaleDateString()} • Section: ${escapeHtml((user.section || 'mispce').toUpperCase())}</small>
        </div>
        <div class="pending-actions"><button type="button" class="approve-user" onclick="reviewUser('${user.id}', true)">Approve</button><button type="button" class="reject-user" onclick="reviewUser('${user.id}', false)">Reject</button></div>
      </article>`).join('') : '<p class="no-pending">No pending account requests.</p>';
  } catch (error) {
    count.textContent = 'Unavailable';
    pendingUsers.innerHTML = `<p class="no-pending error-text">${escapeHtml(error.message)}</p>`;
  }
}

async function reviewUser(id, approved) {
  try {
    const response = await fetch(`${API_BASE}/users/${id}/approval`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('hub_token') || ''}` },
      body: JSON.stringify({ approved })
    });
    const json = await parseApiResponse(response);
    if (!json.success) throw new Error(json.error || 'Could not update request');
    showToast(approved ? 'Account approved' : 'Request rejected', approved ? 'The user can now sign in.' : 'The request was removed.');
    loadPendingUsers();
    loadAllUsers();
  } catch (error) {
    await showPopup({ title: 'Could not review account', message: error.message, danger: true });
  }
}

async function loadAllUsers() {
  if (!allUsersList) return;
  const count = document.querySelector('#allUsersCount');
  try {
    const response = await fetch(`${API_BASE}/users/all`, { headers: { Authorization: `Bearer ${localStorage.getItem('hub_token') || ''}` } });
    const json = await parseApiResponse(response);
    if (!json.success) throw new Error(json.error || 'Could not load users');
    count.textContent = `${json.data.length} user${json.data.length === 1 ? '' : 's'}`;
    systemUsers = json.data;

    let currentUser = null;
    try { currentUser = JSON.parse(localStorage.getItem('hub_user') || '{}'); } catch { currentUser = {}; }
    const currentRole = (currentUser.role || '').toLowerCase();
    const isCurrentSuperAdmin = currentRole === 'superadmin';

    allUsersList.innerHTML = json.data.length ? json.data.map(user => {
      const uRole = (user.role || 'deleg').toLowerCase();
      const uSection = (user.section || (uRole === 'superadmin' ? 'all' : 'mispce')).toLowerCase();
      let roleLabel = 'Deleg';
      let roleClass = 'role-deleg';
      if (uRole === 'superadmin') {
        roleLabel = 'Superadmin';
        roleClass = 'role-superadmin';
      } else if (uRole === 'admin') {
        roleLabel = uSection && uSection !== 'all' ? `Admin • ${uSection.toUpperCase()}` : 'Admin';
        roleClass = 'role-admin';
      } else {
        roleLabel = `Deleg • ${uSection.toUpperCase()}`;
        roleClass = 'role-deleg';
      }
      const isTargetSuperAdmin = uRole === 'superadmin';
      const canEdit = isCurrentSuperAdmin || !isTargetSuperAdmin;
      const canDelete = (isCurrentSuperAdmin || !isTargetSuperAdmin) && currentUser.id !== user.id;

      return `
      <article class="system-user">
        <div class="system-user-avatar">${escapeHtml(`${user.fullName?.[0] || user.username?.[0] || 'U'}`.toUpperCase())}</div>
        <div class="system-user-identity"><strong>${escapeHtml(user.fullName || user.username)}</strong><span>@${escapeHtml(user.username)}</span></div>
        <span class="user-role ${roleClass}">${escapeHtml(roleLabel)}</span>
        <span class="user-status ${user.approved ? 'approved' : 'pending'}">${user.approved ? 'Approved' : 'Pending'}</span>
        <small>${new Date(user.createdAt).toLocaleDateString()}</small>
        <div class="system-user-actions">
          ${canEdit ? `<button type="button" class="edit-user" onclick="openUserEditor('${user.id}')">Edit</button>` : ''}
          ${canDelete ? `<button type="button" class="delete-user" onclick="deleteSystemUser('${user.id}')">Delete</button>` : ''}
        </div>
      </article>`;
    }).join('') : '<p class="no-pending">No user accounts found.</p>';
  } catch (error) {
    count.textContent = 'Unavailable';
    allUsersList.innerHTML = `<p class="no-pending error-text">${escapeHtml(error.message)}</p>`;
  }
}

function openUserEditor(id) {
  const user = systemUsers.find(item => item.id === id);
  const overlay = document.querySelector('#userEditorOverlay');
  const editor = document.querySelector('#userEditorForm');
  if (!user || !overlay || !editor) return;
  editor.elements.id.value = user.id;
  editor.elements.fullName.value = user.fullName || '';
  editor.elements.username.value = user.username || '';
  const normalizedRole = user.role === 'staff' ? 'deleg' : (user.role || 'deleg');
  editor.elements.role.value = normalizedRole;
  if (editor.elements.section) {
    editor.elements.section.value = user.section || (normalizedRole === 'superadmin' ? 'all' : 'mispce');
    editor.elements.section._syncCustomSelect?.();
  }
  editor.elements.approved.value = String(user.approved);
  editor.elements.password.value = '';
  document.querySelector('#userEditorMessage').textContent = '';
  overlay.classList.add('show');
  overlay.setAttribute('aria-hidden', 'false');
  editor.elements.fullName.focus();
}

function closeUserEditor() {
  const overlay = document.querySelector('#userEditorOverlay');
  if (overlay) { overlay.classList.remove('show'); overlay.setAttribute('aria-hidden', 'true'); }
}

const userEditorForm = document.querySelector('#userEditorForm');
if (userEditorForm) {
  userEditorForm.addEventListener('submit', async event => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(userEditorForm).entries());
    const id = values.id;
    values.approved = values.approved === 'true';
    delete values.id;
    if (!values.password) delete values.password;
    const message = document.querySelector('#userEditorMessage');
    const submit = userEditorForm.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      const response = await fetch(`${API_BASE}/users/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('hub_token') || ''}` }, body: JSON.stringify(values) });
      const json = await parseApiResponse(response);
      if (!json.success) throw new Error(json.error || 'Could not update user');
      closeUserEditor();
      showToast('User updated', 'The account changes were saved.');
      loadAllUsers();
      loadPendingUsers();
    } catch (error) { message.textContent = error.message; }
    finally { submit.disabled = false; }
  });
  document.querySelector('#userEditorClose').addEventListener('click', closeUserEditor);
  document.querySelector('#userEditorCancel').addEventListener('click', closeUserEditor);
  document.querySelector('#userEditorOverlay').addEventListener('click', event => { if (event.target.id === 'userEditorOverlay') closeUserEditor(); });
}

async function deleteSystemUser(id) {
  const user = systemUsers.find(item => item.id === id);
  const name = user?.fullName || user?.username || 'This user';
  const confirmed = await showPopup({ title: 'Delete user account?', message: `${name} will permanently lose access to student-os.com.`, confirmLabel: 'Delete user', showCancel: true, danger: true });
  if (!confirmed) return;
  try {
    const response = await fetch(`${API_BASE}/users/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${localStorage.getItem('hub_token') || ''}` } });
    const json = await parseApiResponse(response);
    if (!json.success) throw new Error(json.error || 'Could not delete user');
    showToast('User deleted', 'The account was permanently removed.');
    loadAllUsers();
    loadPendingUsers();
  } catch (error) { await showPopup({ title: 'Could not delete user', message: error.message, danger: true }); }
}

async function loadBackupStatus() {
  if (!backupStatus) return;
  const message = document.querySelector('#backupMessage');
  try {
    const response = await fetch(`${API_BASE}/backup/status`, { headers: { Authorization: `Bearer ${localStorage.getItem('hub_token') || ''}` } });
    const json = await parseApiResponse(response);
    if (!json.success) throw new Error(json.error);
    backupStatus.textContent = json.connected ? 'Google Drive connected' : (json.configured ? 'Ready to connect' : 'Google OAuth setup required');
    backupStatus.classList.toggle('connected', json.connected);
    document.querySelector('#retentionDays').value = String(json.retentionDays);
    document.querySelector('#backupEnabled').value = String(json.enabled);
    document.querySelector('#lastBackup').textContent = json.lastBackupAt ? `${new Date(json.lastBackupAt).toLocaleString()} — ${json.lastBackupName}` : 'Never';
    document.querySelector('#runBackupNow').disabled = !json.connected;
    if (json.lastError) message.textContent = json.lastError;
  } catch (error) { backupStatus.textContent = 'Unavailable'; message.textContent = error.message; }
}

const connectDrive = document.querySelector('#connectDrive');
if (connectDrive) connectDrive.addEventListener('click', async () => {
  try {
    const response = await fetch(`${API_BASE}/backup/connect`, { headers: { Authorization: `Bearer ${localStorage.getItem('hub_token') || ''}` } });
    const json = await parseApiResponse(response);
    if (!json.success) throw new Error(json.error);
    window.location.href = json.url;
  } catch (error) { document.querySelector('#backupMessage').textContent = error.message; }
});

const runBackupNow = document.querySelector('#runBackupNow');
if (runBackupNow) runBackupNow.addEventListener('click', async () => {
  const backupCard = document.querySelector('#backupCard');
  const backupProgress = document.querySelector('#backupProgress');
  const backupLabel = document.querySelector('#runBackupLabel');
  const backupMessage = document.querySelector('#backupMessage');
  runBackupNow.disabled = true;
  runBackupNow.classList.add('is-loading');
  if (backupCard) backupCard.setAttribute('aria-busy', 'true');
  if (backupProgress) backupProgress.hidden = false;
  if (backupLabel) backupLabel.textContent = 'Backing up…';
  if (backupMessage) backupMessage.textContent = '';
  try {
    const response = await fetch(`${API_BASE}/backup/run`, { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('hub_token') || ''}` } });
    const json = await parseApiResponse(response);
    if (!json.success) throw new Error(json.error);
    showToast('Backup complete', `${json.data.name} was saved to Google Drive.`);
    await loadBackupStatus();
  } catch (error) {
    if (backupMessage) backupMessage.textContent = error.message;
  } finally {
    runBackupNow.classList.remove('is-loading');
    runBackupNow.disabled = false;
    if (backupCard) backupCard.removeAttribute('aria-busy');
    if (backupProgress) backupProgress.hidden = true;
    if (backupLabel) backupLabel.textContent = 'Back up now';
  }
});

const saveBackupSettings = document.querySelector('#saveBackupSettings');
if (saveBackupSettings) saveBackupSettings.addEventListener('click', async () => {
  try {
    const response = await fetch(`${API_BASE}/backup/settings`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('hub_token') || ''}` }, body: JSON.stringify({ retentionDays: Number(document.querySelector('#retentionDays').value), enabled: document.querySelector('#backupEnabled').value === 'true' }) });
    const json = await parseApiResponse(response);
    if (!json.success) throw new Error(json.error);
    showToast('Settings saved', 'Your daily backup preferences were updated.');
  } catch (error) { document.querySelector('#backupMessage').textContent = error.message; }
});

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
    if (values.approved !== undefined) {
      values.approved = values.approved === 'true';
    }
    try {
      const token = localStorage.getItem('hub_token');
      const response = await fetch(`${API_BASE}/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(values)
      });
      const json = await parseApiResponse(response);
      if (!json.success) throw new Error(json.error || 'Could not create user');
      userForm.reset();
      if (json.data?.approved) {
        showToast('User created', `${values.fullName} is approved and can now sign in.`);
      } else {
        showToast('Account requested', `${values.fullName} requires administrator approval before sign-in.`);
      }
      loadPendingUsers();
      loadAllUsers();
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

// Check student-os.com system connection status
async function checkDbConnection() {
  if (!dbStatusPill || !dbStatusText) return;
  try {
    const res = await fetch(`${API_BASE}/db-status`);
    const data = await parseApiResponse(res);
    if (data.connected) {
      dbStatusPill.classList.remove('disconnected');
      dbStatusPill.classList.add('connected');
      dbStatusText.textContent = 'student-os.com Online';
      dbStatusPill.title = `Secure system online (${data.count} records stored)`;
    } else {
      dbStatusPill.classList.remove('connected');
      dbStatusPill.classList.add('disconnected');
      dbStatusText.textContent = `System Offline`;
      dbStatusPill.title = `System error: ${data.message || 'Could not connect to the system'}`;
    }
  } catch (err) {
    dbStatusPill.classList.remove('connected');
    dbStatusPill.classList.add('disconnected');
    dbStatusText.textContent = `System Offline`;
    dbStatusPill.title = `Connection error: ${err.message}`;
  }
}

let currentDashboardSection = 'all';
let allStudentsMaster = [];

function applySectionFilter() {
  const userRole = getCurrentUserRole();
  const userSec = getCurrentUserSection();
  const isSuper = userRole === 'superadmin' || userSec === 'all';

  if (!isSuper) {
    const assignedSec = (userSec || 'mispce').toLowerCase();
    students = allStudentsMaster.filter(s => (s.section || (typeof inferSectionFromMajor === 'function' ? inferSectionFromMajor(s.major) : '') || '').toLowerCase() === assignedSec);
  } else if (currentDashboardSection && currentDashboardSection !== 'all') {
    students = allStudentsMaster.filter(s => (s.section || (typeof inferSectionFromMajor === 'function' ? inferSectionFromMajor(s.major) : '') || '').toLowerCase() === currentDashboardSection);
  } else {
    students = [...allStudentsMaster];
  }
  updateStats();
  renderStudents(searchInput ? searchInput.value : '');
}

// Fetch all students from backend
async function fetchStudents() {
  try {
    const url = `${API_BASE}/students`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${localStorage.getItem('hub_token') || ''}` }
    });
    const json = await parseApiResponse(res);
    if (json.success) {
      allStudentsMaster = json.data || [];
      applySectionFilter();
    } else {
      console.error('Failed to fetch students:', json.error);
    }
  } catch (err) {
    console.error('Error connecting to backend:', err);
  }
}

let renderStudentsRaf = null;
function scheduleRenderStudents(query = '') {
  if (renderStudentsRaf) cancelAnimationFrame(renderStudentsRaf);
  renderStudentsRaf = requestAnimationFrame(() => {
    renderStudents(query);
    renderStudentsRaf = null;
  });
}

// Render student grid and stats (for dashboard)
function renderStudents(query = '') {
  if (!recordsGrid) return;
  const needle = query.trim().toLowerCase();
  const tokens = needle ? needle.split(/\s+/).filter(Boolean) : [];
  const numericNeedle = /^[\s()+.-]*\d[\d\s()+.-]*$/.test(needle)
    ? needle.replace(/\D/g, '')
    : '';
  const filtered = students.filter(student => {
    const nameCombinations = [
      `${student.firstName || ''} ${student.familyName || ''}`,
      `${student.firstName || ''} ${student.fatherName || ''} ${student.familyName || ''}`,
      `${student.familyName || ''} ${student.firstName || ''}`
    ];
    const fullSearchText = [...nameCombinations, ...Object.values(student)]
      .map(v => String(v || '').toLowerCase())
      .join(' ');
    const matchesFormattedText = tokens.every(token => fullSearchText.includes(token));
    const matchesUnformattedNumber = numericNeedle && Object.values(student).some(value =>
      String(value || '').replace(/\D/g, '').includes(numericNeedle)
    );
    const matchesSearch = !tokens.length || matchesFormattedText || matchesUnformattedNumber;
    const matchesStatus = !statusFilter?.value || student.status === statusFilter.value;
    const matchesMajor = !majorFilter?.value || student.major === majorFilter.value;
    const matchesCampus = !campusFilter?.value || student.campus === campusFilter.value;
    const matchesLanguage = !languageFilter?.value || student.language === languageFilter.value;
    const assignedGroup = getStudentAssignedGroup(student);
    const matchesGroup = !groupFilter?.value
      || (groupFilter.value === 'in' ? (student.inGroup && !student.leftGroup)
        : groupFilter.value === 'out' ? (!student.inGroup && !student.leftGroup)
        : groupFilter.value === 'left' ? Boolean(student.leftGroup)
        : groupFilter.value === 'unassigned' ? (!assignedGroup && !student.leftGroup)
        : groupFilter.value === assignedGroup);
    return matchesSearch && matchesStatus && matchesMajor && matchesCampus && matchesLanguage && matchesGroup;
  });

  if (recordCount) recordCount.textContent = students.length;
  const directorySummary = document.querySelector('#directorySummary');
  if (directorySummary) {
    const filtering = needle || statusFilter?.value || majorFilter?.value || campusFilter?.value || languageFilter?.value || groupFilter?.value;
    directorySummary.textContent = filtering
      ? `${filtered.length} of ${students.length} students`
      : `${students.length} student${students.length === 1 ? '' : 's'}`;
  }

  if (emptyState) {
    emptyState.style.display = filtered.length ? 'none' : 'block';
  }

  const isDeleg = isCurrentUserDeleg();

  recordsGrid.innerHTML = filtered.map(student => {
    const fullName = `${student.firstName} ${student.fatherName} ${student.familyName}`;
    const initials = `${student.firstName?.[0] || ''}${student.familyName?.[0] || ''}`.toUpperCase();
    const lang = (student.language || '').trim().toLowerCase();
    const isFrench = lang.includes('french');
    const isEnglish = lang.includes('english');
    const isLeft = Boolean(student.leftGroup);
    const groupDisabledAttr = isLeft ? 'disabled title="This student left the group"' : '';

    let groupButtonsHtml = '';
    const assigned = getStudentAssignedGroup(student);
    if (isFrench) {
      const isAB = assigned === 'Grp A,B';
      const isCD = assigned === 'Grp C,D';
      groupButtonsHtml = `
          <div class="group-section-actions">
            <button type="button"
              class="btn-action group-section-btn ${isAB ? 'is-active' : ''}"
              onclick="setStudentAssignedGroup('${student.id}', 'Grp A,B', this)"
              aria-pressed="${isAB ? 'true' : 'false'}"
              ${groupDisabledAttr}>
              ${isAB ? '✓ Grp A,B' : 'Grp A,B'}
            </button>
            <button type="button"
              class="btn-action group-section-btn ${isCD ? 'is-active' : ''}"
              onclick="setStudentAssignedGroup('${student.id}', 'Grp C,D', this)"
              aria-pressed="${isCD ? 'true' : 'false'}"
              ${groupDisabledAttr}>
              ${isCD ? '✓ Grp C,D' : 'Grp C,D'}
            </button>
          </div>
      `;
    } else if (isEnglish) {
      const isE1 = assigned === 'Grp E1';
      const isE2 = assigned === 'Grp E2';
      groupButtonsHtml = `
          <div class="group-section-actions">
            <button type="button"
              class="btn-action group-section-btn ${isE1 ? 'is-active' : ''}"
              onclick="setStudentAssignedGroup('${student.id}', 'Grp E1', this)"
              aria-pressed="${isE1 ? 'true' : 'false'}"
              ${groupDisabledAttr}>
              ${isE1 ? '✓ Grp E1' : 'Grp E1'}
            </button>
            <button type="button"
              class="btn-action group-section-btn ${isE2 ? 'is-active' : ''}"
              onclick="setStudentAssignedGroup('${student.id}', 'Grp E2', this)"
              aria-pressed="${isE2 ? 'true' : 'false'}"
              ${groupDisabledAttr}>
              ${isE2 ? '✓ Grp E2' : 'Grp E2'}
            </button>
          </div>
      `;
    }

    const studentSec = (student.section || inferSectionFromMajor(student.major) || 'mispce').toLowerCase();

    return `
      <article class="student-card">
        <span class="tag">${escapeHtml(student.status)}</span>
        <div class="student-top">
          <div class="avatar">${escapeHtml(initials)}</div>
          <div>
            <h3>${escapeHtml(fullName)}</h3>
            <p>${escapeHtml(student.major)} • ${escapeHtml(studentSec.toUpperCase())}</p>
          </div>
        </div>
        <div class="student-details">
          <div class="detail"><small>Major</small><span title="${escapeHtml(student.major)}">${escapeHtml(student.major)}</span></div>
          <div class="detail"><small>Section</small><span>${escapeHtml(studentSec.toUpperCase())}</span></div>
          <div class="detail"><small>School</small><span title="${escapeHtml(student.school)}">${escapeHtml(student.school)}</span></div>
          <div class="detail"><small>Campus</small><span>${escapeHtml(student.campus)}</span></div>
          <div class="detail"><small>Language</small><span>${escapeHtml(student.language)}</span></div>
          <div class="detail"><small>Phone</small><span>${escapeHtml(student.phone)}</span></div>
          <div class="detail"><small>Email</small><span title="${escapeHtml(student.email)}">${escapeHtml(student.email)}</span></div>
          <div class="detail"><small>Origin</small><span>${escapeHtml(student.origin || 'N/A')}</span></div>
          ${!isDeleg ? `
          <div class="detail political-detail">
            <small>Political affiliation</small>
            ${student.politicalAffiliation ? `
              <span class="political-value" aria-live="polite">••••••••</span>
              <button type="button" class="reveal-affiliation" data-student-id="${escapeHtml(student.id)}" aria-expanded="false">Show affiliation</button>
            ` : '<span>Not provided</span>'}
          </div>` : ''}
        </div>
        ${!isDeleg && student.note ? `<div class="student-note"><strong>Note</strong><p>${escapeHtml(student.note)}</p></div>` : ''}
        <div class="card-actions">
          <button type="button"
            class="btn-action group-toggle ${student.inGroup ? 'is-in-group' : ''}"
            onclick="toggleGroupMembership('${student.id}', ${!student.inGroup}, this)"
            aria-pressed="${student.inGroup ? 'true' : 'false'}"
            ${student.leftGroup ? 'disabled title="This student left the group"' : ''}>
            ${student.leftGroup ? 'In group (disabled)' : (student.inGroup ? (student.assignedGroup ? `✓ In group (${escapeHtml(student.assignedGroup)})` : '✓ In group') : '+ Add to group')}
          </button>
          ${student.inGroup && !student.leftGroup ? `
            <button type="button" class="btn-action left-group"
              onclick="markStudentLeftGroup('${student.id}', this)">Left group</button>
          ` : student.leftGroup ? '<span class="left-group-status">Left group</span>' : ''}
          ${groupButtonsHtml}
          ${!isDeleg ? `
          <div class="record-edit-actions">
          <a class="btn-action edit" href="form.html?edit=${student.id}">Edit record</a>
          <button type="button" class="btn-action student-note-button" data-student-id="${escapeHtml(student.id)}">${student.note ? 'Edit Note' : 'Add Note'}</button>
          <button type="button" class="btn-action delete" onclick="deleteStudentRecord('${student.id}')">Delete</button>
          </div>` : ''}
        </div>
      </article>
    `;
  }).join('');
}

function togglePoliticalAffiliation(id, button) {
  const student = students.find(item => String(item.id) === String(id));
  const value = button?.closest('.political-detail')?.querySelector('.political-value');
  if (!student || !value || !button) return;

  const revealing = button.getAttribute('aria-expanded') !== 'true';
  value.textContent = revealing ? (student.politicalAffiliation || 'Not provided') : '••••••••';
  value.title = revealing ? (student.politicalAffiliation || '') : '';
  button.textContent = revealing ? 'Hide affiliation' : 'Show affiliation';
  button.setAttribute('aria-expanded', String(revealing));
}

document.addEventListener('click', event => {
  const revealButton = event.target.closest('.reveal-affiliation');
  if (revealButton) togglePoliticalAffiliation(revealButton.dataset.studentId, revealButton);
});

const politicalFieldToggle = document.querySelector('#politicalFieldToggle');
const politicalField = document.querySelector('#politicalField');
if (politicalFieldToggle && politicalField) {
  politicalFieldToggle.addEventListener('click', () => {
    const showing = politicalField.hidden;
    politicalField.hidden = !showing;
    politicalFieldToggle.setAttribute('aria-expanded', String(showing));
    politicalFieldToggle.textContent = showing
      ? 'Hide political affiliation field'
      : 'Show political affiliation field';
    if (showing) politicalField.querySelector('select')?.focus();
  });
}

const politicalStatsToggle = document.querySelector('#politicalStatsToggle');
const politicalStatsPanel = document.querySelector('#politicalStatsPanel');
if (politicalStatsToggle && politicalStatsPanel) {
  politicalStatsToggle.addEventListener('click', () => {
    const showing = politicalStatsPanel.hidden;
    politicalStatsPanel.hidden = !showing;
    politicalStatsToggle.setAttribute('aria-expanded', String(showing));
    politicalStatsToggle.textContent = showing ? 'Hide political statistics' : 'Show political statistics';
  });
}

// Update dashboard metrics and charts
function updateStats() {
  const total = students.length;
  const count = (key, value) => students.filter(s => s[key] === value).length;
  const newCount = count('status', 'New');
  const returningCount = count('status', 'Mu3id');
  const groupCount = students.filter(student => student.inGroup).length;
  const leftGroupCount = students.filter(student => student.leftGroup).length;
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
  setText('#groupStudents', groupCount);
  setText('#groupPercentage', `${percent(groupCount)}% of total`);
  setText('#leftGroupStudents', leftGroupCount);
  setText('#leftGroupPercentage', `${percent(leftGroupCount)}% of total`);
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

  const userRole = getCurrentUserRole();
  const userSec = getCurrentUserSection();
  const isSuper = userRole === 'superadmin' || userSec === 'all';
  const activeSection = isSuper ? currentDashboardSection : userSec;

  let visibleMajors = ['Mathematics', 'Informatics', 'Statistics', 'Physics', 'Chemistry', 'Electronics', 'Biology', 'Biochemistry'];
  if (activeSection === 'mispce') {
    visibleMajors = MISPCE_MAJORS_LIST;
  } else if (activeSection === 'csvt') {
    visibleMajors = CSVT_MAJORS_LIST;
  }

  const majorCountBadge = document.querySelector('#majorCountBadge');
  if (majorCountBadge) {
    majorCountBadge.textContent = `${visibleMajors.length} majors`;
  }

  document.querySelectorAll('.major-stat').forEach(card => {
    const major = card.dataset.major;
    const isVisible = visibleMajors.some(m => m.toLowerCase() === major.toLowerCase());
    card.style.display = isVisible ? '' : 'none';
    if (isVisible) {
      const majorCount = students.filter(student => (student.major || '').toLowerCase() === major.toLowerCase()).length;
      const majorPercent = percent(majorCount);
      card.querySelector('b').textContent = majorCount;
      card.querySelector('i').style.width = `${majorPercent}%`;
      card.querySelector('small').textContent = `${majorPercent}% of students`;
    }
  });

  updateMajorFilterOptions(visibleMajors);

  const grpAB = students.filter(s => getStudentAssignedGroup(s) === 'Grp A,B').length;
  const grpCD = students.filter(s => getStudentAssignedGroup(s) === 'Grp C,D').length;
  const grpE1 = students.filter(s => getStudentAssignedGroup(s) === 'Grp E1').length;
  const grpE2 = students.filter(s => getStudentAssignedGroup(s) === 'Grp E2').length;
  const unassigned = students.filter(s => !getStudentAssignedGroup(s)).length;

  setText('#grpABCount', grpAB);
  setText('#grpCDCount', grpCD);
  setText('#grpE1Count', grpE1);
  setText('#grpE2Count', grpE2);
  setText('#unassignedCount', unassigned);

  setText('#grpABPercent', `${percent(grpAB)}% of students`);
  setText('#grpCDPercent', `${percent(grpCD)}% of students`);
  setText('#grpE1Percent', `${percent(grpE1)}% of students`);
  setText('#grpE2Percent', `${percent(grpE2)}% of students`);
  setText('#unassignedPercent', `${percent(unassigned)}% of students`);

  const grpABBar = document.querySelector('#grpABBar');
  const grpCDBar = document.querySelector('#grpCDBar');
  const grpE1Bar = document.querySelector('#grpE1Bar');
  const grpE2Bar = document.querySelector('#grpE2Bar');
  const unassignedBar = document.querySelector('#unassignedBar');

  if (grpABBar) grpABBar.style.width = `${percent(grpAB)}%`;
  if (grpCDBar) grpCDBar.style.width = `${percent(grpCD)}%`;
  if (grpE1Bar) grpE1Bar.style.width = `${percent(grpE1)}%`;
  if (grpE2Bar) grpE2Bar.style.width = `${percent(grpE2)}%`;
  if (unassignedBar) unassignedBar.style.width = `${percent(unassigned)}%`;

  if (!isCurrentUserDeleg()) {
    renderPoliticalStats();
  }
}

function updateMajorFilterOptions(visibleMajors) {
  if (!majorFilter) return;
  const currentVal = majorFilter.value;
  const optionsHtml = [
    '<option value="">All majors</option>',
    ...visibleMajors.map(m => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`)
  ].join('');
  if (majorFilter.innerHTML !== optionsHtml) {
    majorFilter.innerHTML = optionsHtml;
    if (visibleMajors.some(m => m.toLowerCase() === currentVal.toLowerCase())) {
      majorFilter.value = currentVal;
    } else {
      majorFilter.value = '';
    }
    majorFilter._rebuildCustomSelect?.();
  }
}

function setupSectionSwitchTabs() {
  const switchTabs = document.querySelector('#sectionSwitchTabs');
  if (!switchTabs) return;

  const userRole = getCurrentUserRole();
  const userSec = getCurrentUserSection();
  const isSuper = userRole === 'superadmin' || userSec === 'all';

  if (isSuper) {
    switchTabs.style.display = 'inline-flex';
    switchTabs.querySelectorAll('.hero-section-btn').forEach(tab => {
      tab.addEventListener('click', () => {
        switchTabs.querySelectorAll('.hero-section-btn').forEach(t => t.classList.remove('is-active'));
        tab.classList.add('is-active');
        currentDashboardSection = tab.dataset.section || 'all';
        applySectionFilter();
      });
    });
  } else {
    switchTabs.style.display = 'none';
  }
}

function getStudentsForPoliticalGroup(groupKey) {
  if (groupKey === 'Grp A,B') return students.filter(s => getStudentAssignedGroup(s) === 'Grp A,B');
  if (groupKey === 'Grp C,D') return students.filter(s => getStudentAssignedGroup(s) === 'Grp C,D');
  if (groupKey === 'Grp E1') return students.filter(s => getStudentAssignedGroup(s) === 'Grp E1');
  if (groupKey === 'Grp E2') return students.filter(s => getStudentAssignedGroup(s) === 'Grp E2');
  if (groupKey === 'in_group') return students.filter(s => s.inGroup && !s.leftGroup);
  if (groupKey === 'not_in_group') return students.filter(s => !s.inGroup && !s.leftGroup);
  return students;
}

const POLITICAL_GROUP_LABELS = {
  all: 'All students',
  'Grp A,B': 'Grp A,B (French)',
  'Grp C,D': 'Grp C,D (French)',
  'Grp E1': 'Grp E1 (English)',
  'Grp E2': 'Grp E2 (English)',
  in_group: 'All in group',
  not_in_group: 'Not in group'
};

function renderPoliticalStats() {
  const politicalStatsGrid = document.querySelector('#politicalStatsGrid');
  const politicalGroupTitle = document.querySelector('#politicalGroupTitle');
  const politicalGroupSub = document.querySelector('#politicalGroupSub');
  const politicalByGroupGrid = document.querySelector('#politicalByGroupGrid');

  const activeSubset = getStudentsForPoliticalGroup(currentPoliticalGroup);
  const activeTotal = activeSubset.length;
  const overallTotal = students.length;

  if (politicalGroupTitle) {
    politicalGroupTitle.textContent = POLITICAL_GROUP_LABELS[currentPoliticalGroup] || currentPoliticalGroup;
  }
  if (politicalGroupSub) {
    const overallPct = overallTotal ? Math.round(activeTotal / overallTotal * 100) : 0;
    politicalGroupSub.textContent = currentPoliticalGroup === 'all'
      ? `${activeTotal} student${activeTotal === 1 ? '' : 's'}`
      : `${activeTotal} student${activeTotal === 1 ? '' : 's'} (${overallPct}% of total)`;
  }

  if (politicalStatsGrid) {
    const affiliationCounts = activeSubset.reduce((counts, student) => {
      const affiliation = (student.politicalAffiliation || '').trim() || 'Not provided';
      counts[affiliation] = (counts[affiliation] || 0) + 1;
      return counts;
    }, {});
    const rows = Object.entries(affiliationCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const subsetPercent = count => activeTotal ? Math.round(count / activeTotal * 100) : 0;
    politicalStatsGrid.innerHTML = rows.length ? rows.map(([affiliation, affiliationCount]) => {
      const affiliationPercent = subsetPercent(affiliationCount);
      return `
        <div class="political-stat-row">
          <div class="political-stat-copy"><span>${escapeHtml(affiliation)}</span><b>${affiliationCount} <small>(${affiliationPercent}%)</small></b></div>
          <div class="political-stat-progress" aria-hidden="true"><i style="width:${affiliationPercent}%"></i></div>
        </div>`;
    }).join('') : '<p class="political-stats-empty">No student records in this group.</p>';
  }

  if (politicalByGroupGrid) {
    const breakdownGroups = [
      { key: 'Grp A,B', label: 'Grp A,B (French)' },
      { key: 'Grp C,D', label: 'Grp C,D (French)' },
      { key: 'Grp E1', label: 'Grp E1 (English)' },
      { key: 'Grp E2', label: 'Grp E2 (English)' },
      { key: 'in_group', label: 'All in group' },
      { key: 'not_in_group', label: 'Not in group' }
    ];

    politicalByGroupGrid.innerHTML = breakdownGroups.map(grp => {
      const grpStudents = getStudentsForPoliticalGroup(grp.key);
      const grpTotal = grpStudents.length;
      const grpAffiliations = grpStudents.reduce((acc, student) => {
        const aff = (student.politicalAffiliation || '').trim() || 'Not provided';
        acc[aff] = (acc[aff] || 0) + 1;
        return acc;
      }, {});
      const sortedAffs = Object.entries(grpAffiliations).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

      const listHtml = sortedAffs.length ? sortedAffs.map(([aff, cnt]) => {
        const pct = grpTotal ? Math.round(cnt / grpTotal * 100) : 0;
        return `
          <div class="political-group-card-row">
            <span title="${escapeHtml(aff)}">${escapeHtml(aff)}</span>
            <b>${cnt} <small>(${pct}%)</small></b>
          </div>
        `;
      }).join('') : '<span class="political-group-empty">No students</span>';

      return `
        <div class="political-group-card">
          <div class="political-group-card-head">
            <strong>${escapeHtml(grp.label)}</strong>
            <span>${grpTotal} student${grpTotal === 1 ? '' : 's'}</span>
          </div>
          <div class="political-group-card-list">
            ${listHtml}
          </div>
        </div>
      `;
    }).join('');
  }
}

function setupPoliticalTabs() {
  if (isCurrentUserDeleg()) return;
  const container = document.querySelector('.political-group-selector');
  if (!container) return;
  container.addEventListener('click', event => {
    const tab = event.target.closest('.political-group-tab');
    if (!tab) return;
    container.querySelectorAll('.political-group-tab').forEach(t => t.classList.remove('is-active'));
    tab.classList.add('is-active');
    currentPoliticalGroup = tab.dataset.group || 'all';
    renderPoliticalStats();
  });
}

function setupClassStatClicks() {
  if (isCurrentUserDeleg()) return;
  document.querySelectorAll('.class-stat').forEach(card => {
    card.addEventListener('click', () => {
      const grp = card.dataset.group;
      if (!groupFilter) return;
      if (groupFilter.value === grp) {
        groupFilter.value = '';
      } else {
        groupFilter.value = grp;
      }
      groupFilter.dispatchEvent(new Event('change', { bubbles: true }));
      scheduleRenderStudents(searchInput ? searchInput.value : '');
      const recordsGrid = document.querySelector('#recordsGrid');
      if (recordsGrid) {
        recordsGrid.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
}

async function setStudentAssignedGroup(id, targetGroup, button) {
  const student = students.find(item => String(item.id) === String(id));
  if (!student) return;

  const currentNorm = (student.assignedGroup || '').trim().toLowerCase();
  const targetNorm = targetGroup.trim().toLowerCase();
  const isAlreadyInTarget = currentNorm === targetNorm || currentNorm === targetNorm.replace(/^grp\s*/, '');
  const nextGroup = isAlreadyInTarget ? '' : targetGroup;
  const nextInGroup = Boolean(nextGroup);

  if (button) button.disabled = true;
  try {
    const response = await fetch(`${API_BASE}/students/${id}/group`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inGroup: nextInGroup,
        assignedGroup: nextGroup,
        leftGroup: false
      })
    });
    const json = await parseApiResponse(response);
    if (!json.success) throw new Error(json.error || 'Could not update assigned group');

    student.inGroup = nextInGroup;
    student.assignedGroup = nextGroup;
    student.leftGroup = false;

    updateStats();
    scheduleRenderStudents(searchInput ? searchInput.value : '');
    showToast(
      nextGroup ? `Assigned to ${nextGroup}` : 'Group assignment removed',
      nextGroup ? `The student is now assigned to ${nextGroup}.` : 'The student has no assigned group section.'
    );
  } catch (err) {
    if (button) button.disabled = false;
    await showPopup({ title: 'Could not update group', message: err.message, danger: true });
  }
}

async function toggleGroupMembership(id, inGroup, button) {
  if (button) button.disabled = true;
  try {
    const response = await fetch(`${API_BASE}/students/${id}/group`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inGroup, assignedGroup: inGroup ? undefined : '' })
    });
    const json = await parseApiResponse(response);
    if (!json.success) throw new Error(json.error || 'Could not update group membership');

    const student = students.find(item => item.id === id);
    if (student) {
      student.inGroup = inGroup;
      if (!inGroup) student.assignedGroup = '';
    }
    updateStats();
    scheduleRenderStudents(searchInput ? searchInput.value : '');
    showToast(
      inGroup ? 'Added to group' : 'Removed from group',
      inGroup ? 'The student is now in the group.' : 'The student is no longer in the group.'
    );
  } catch (err) {
    if (button) button.disabled = false;
    await showPopup({ title: 'Could not update group', message: err.message, danger: true });
  }
}

async function markStudentLeftGroup(id, button) {
  if (button) button.disabled = true;
  try {
    const response = await fetch(`${API_BASE}/students/${id}/group`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inGroup: false, leftGroup: true, assignedGroup: '' })
    });
    const json = await parseApiResponse(response);
    if (!json.success) throw new Error(json.error || 'Could not mark the student as having left');

    const student = students.find(item => item.id === id);
    if (student) {
      student.inGroup = false;
      student.leftGroup = true;
      student.assignedGroup = '';
    }
    updateStats();
    scheduleRenderStudents(searchInput ? searchInput.value : '');
    showToast('Student left the group', 'The In group option is now disabled for this student.');
  } catch (err) {
    if (button) button.disabled = false;
    await showPopup({ title: 'Could not update group', message: err.message, danger: true });
  }
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
  if (isCurrentUserDeleg()) return;
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
    const res = await fetch(`${API_BASE}/students/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${localStorage.getItem('hub_token') || ''}` }
    });
    const json = await parseApiResponse(res);
    if (json.success) {
      showToast('Record deleted', 'The student record was removed.');
      allStudentsMaster = allStudentsMaster.filter(s => String(s.id) !== String(id));
      applySectionFilter();
      checkDbConnection();
    } else {
      await showPopup({ title: 'Could not delete record', message: json.error || 'Please try again.', danger: true });
    }
  } catch (err) {
    await showPopup({ title: 'Something went wrong', message: err.message, danger: true });
  }
}

function updateMajorSelectOptions(section, selectedMajor = '') {
  const majorSelect = document.querySelector('#studentMajorSelect');
  if (!majorSelect) return;
  const majors = (section === 'csvt') ? CSVT_MAJORS_LIST : MISPCE_MAJORS_LIST;
  const options = ['<option value="" disabled>Select a major</option>'];
  majors.forEach(m => {
    options.push(`<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`);
  });
  majorSelect.innerHTML = options.join('');
  if (selectedMajor && majors.some(m => m.toLowerCase() === selectedMajor.toLowerCase())) {
    majorSelect.value = selectedMajor;
  } else {
    majorSelect.selectedIndex = 0;
  }
  majorSelect._rebuildCustomSelect?.();
}

function initStudentForm() {
  if (!form) return;
  const userRole = getCurrentUserRole();
  const userSec = getCurrentUserSection();
  const isSuper = userRole === 'superadmin' || userSec === 'all';

  const sectionSelect = document.querySelector('#studentSectionSelect');
  const formBadge = document.querySelector('#formBadge');

  if (!isSuper) {
    const assignedSec = (userSec || 'mispce').toLowerCase();
    if (sectionSelect) {
      sectionSelect.innerHTML = `<option value="${assignedSec}" selected>${assignedSec.toUpperCase()}</option>`;
      sectionSelect.value = assignedSec;
      const sectionFieldLabel = document.querySelector('#sectionFieldLabel');
      if (sectionFieldLabel) {
        const titleSpan = sectionFieldLabel.querySelector('span');
        if (titleSpan) titleSpan.innerHTML = `Academic section <small style="color:var(--orange-primary);font-weight:700">(${assignedSec.toUpperCase()})</small>`;
      }
    }
    if (formBadge) {
      formBadge.textContent = `${assignedSec.toUpperCase()} SECTION`;
    }
    updateMajorSelectOptions(assignedSec);
  } else {
    if (sectionSelect) {
      sectionSelect.innerHTML = `
        <option value="mispce" selected>MISPCE</option>
        <option value="csvt">CSVT</option>
      `;
      sectionSelect.value = 'mispce';
      updateMajorSelectOptions('mispce');
      sectionSelect.addEventListener('change', () => {
        updateMajorSelectOptions(sectionSelect.value);
      });
    }
  }
  sectionSelect?._rebuildCustomSelect?.();
}

// Form logic (Add / Edit Student)
if (form) {
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const required = [...form.querySelectorAll('[required]')];
    required.forEach(input => input.classList.toggle('invalid', !input.validity.valid));
    form.querySelectorAll('.custom-select').forEach(cs => {
      const sel = cs.querySelector('select');
      const trig = cs.querySelector('.custom-select-trigger');
      if (sel && trig) trig.classList.toggle('invalid', !sel.validity.valid);
    });
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

    const token = localStorage.getItem('hub_token') || '';
    const authHeaders = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    };

    try {
      let res, json;
      if (editingId) {
        res = await fetch(`${API_BASE}/students/${editingId}`, {
          method: 'PUT',
          headers: authHeaders,
          body: JSON.stringify(studentData),
        });
      } else {
        res = await fetch(`${API_BASE}/students`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify(studentData),
        });
      }

      json = await parseApiResponse(res);

      if (json.success) {
        showToast(
          editingId ? 'Student record updated' : 'Student saved',
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
  if (submitText) submitText.textContent = 'Update Student';
  if (cancelEdit) cancelEdit.classList.remove('hidden');

  try {
    const res = await fetch(`${API_BASE}/students/${editId}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('hub_token') || ''}` }
    });
    const json = await parseApiResponse(res);
    if (json.success && json.data) {
      const student = json.data;
      const userRole = getCurrentUserRole();
      const userSec = getCurrentUserSection();
      const isSuper = userRole === 'superadmin' || userSec === 'all';
      const sec = (student.section || inferSectionFromMajor(student.major) || 'mispce').toLowerCase();
      const sectionSelect = document.querySelector('#studentSectionSelect');
      if (sectionSelect && isSuper) {
        sectionSelect.value = sec;
        sectionSelect._syncCustomSelect?.();
      }
      updateMajorSelectOptions(isSuper ? sec : (userSec || 'mispce'), student.major);

      Object.entries(student).forEach(([key, value]) => {
        if (key === 'section' || key === 'major') return;
        const input = form.querySelector(`[name="${key}"][value="${CSS.escape(value || '')}"]`) || form.querySelector(`[name="${key}"]`);
        if (input) {
          if (input.type === 'radio') {
            input.checked = true;
          } else {
            input.value = value || '';
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
      });
      const majorSelect = document.querySelector('#studentMajorSelect');
      if (majorSelect && student.major) {
        majorSelect.value = student.major;
        majorSelect._syncCustomSelect?.();
      }
    }
  } catch (err) {
    console.error('Failed to load student for editing:', err);
  }
}

// Search input listener
if (searchInput) {
  searchInput.addEventListener('input', () => scheduleRenderStudents(searchInput.value));
}

[statusFilter, majorFilter, campusFilter, languageFilter, groupFilter].forEach(filter => {
  if (filter) filter.addEventListener('change', () => scheduleRenderStudents(searchInput?.value || ''));
});

if (clearFilters) {
  clearFilters.addEventListener('click', () => {
    if (searchInput) searchInput.value = '';
    [statusFilter, majorFilter, campusFilter, languageFilter, groupFilter].forEach(filter => {
      if (filter) {
        filter.value = '';
        filter.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    scheduleRenderStudents('');
  });
}

// Export CSV button listener
const exportBtn = document.querySelector('#exportBtn');
if (exportBtn) {
  exportBtn.addEventListener('click', () => {
    if (isCurrentUserDeleg()) return;
    if (!students.length) return showToast('Nothing to export', 'No student records available.');
    const columns = ['firstName','fatherName','familyName','school','address','origin','phone','major','politicalAffiliation','status','language','campus','email','inGroup','assignedGroup'];
    const csv = [columns.join(','), ...students.map(s => columns.map(key => `"${String(s[key] || '').replaceAll('"','""')}"`).join(','))].join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], {type:'text/csv'}));
    link.download = 'student-os-records.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  });
}

// Each student has one editable note, persisted with their database record.
function setupNotes() {
  if (isCurrentUserDeleg()) return;
  const dialog = document.querySelector('#noteDialog');
  if (!dialog || !recordsGrid) return;
  const noteForm = document.querySelector('#noteForm');
  const input = document.querySelector('#noteText');
  const error = document.querySelector('#noteError');
  const saveButton = noteForm.querySelector('[type="submit"]');
  const cancelButton = document.querySelector('#cancelNoteBtn');
  let studentId = null;
  let saving = false;

  recordsGrid.addEventListener('click', event => {
    const button = event.target.closest('.student-note-button');
    if (!button) return;
    const student = students.find(item => String(item.id) === button.dataset.studentId);
    if (!student) return;
    studentId = student.id;
    input.value = student.note || '';
    error.textContent = '';
    document.querySelector('#noteDialogTitle').textContent = student.note ? 'Edit Note' : 'Add Note';
    document.querySelector('#noteStudentName').textContent = `${student.firstName} ${student.familyName}`;
    dialog.showModal();
    input.focus();
  });
  cancelButton.addEventListener('click', () => dialog.close());
  dialog.addEventListener('cancel', event => { if (saving) event.preventDefault(); });
  dialog.addEventListener('close', () => {
    const button = Array.from(recordsGrid.querySelectorAll('.student-note-button'))
      .find(item => item.dataset.studentId === String(studentId));
    if (button) button.focus();
  });
  noteForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (saving) return;
    saving = true;
    saveButton.disabled = cancelButton.disabled = input.disabled = true;
    saveButton.textContent = 'Saving…';
    error.textContent = '';
    try {
      const response = await fetch(`${API_BASE}/students/${encodeURIComponent(studentId)}/note`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('hub_token') || ''}` },
        body: JSON.stringify({ note: input.value.trim() })
      });
      const json = await parseApiResponse(response);
      if (!response.ok || !json.success) throw new Error(json.error || 'Could not save note.');
      const student = students.find(item => item.id === studentId);
      if (student) student.note = json.data.note;
      renderStudents(searchInput ? searchInput.value : '');
      dialog.close();
      showToast('Note saved', 'The note was saved to this student’s record.');
    } catch (err) {
      error.textContent = err.message;
    } finally {
      saving = false;
      saveButton.disabled = cancelButton.disabled = input.disabled = false;
      saveButton.textContent = 'Save Note';
    }
  });
}

// Modern Animated Custom Select Component
function initCustomSelects(scope = document) {
  const selects = scope.querySelectorAll('.form-card select, .student-filters select, select.custom-select-target');
  selects.forEach(select => {
    if (select.dataset.customized === 'true') return;
    select.dataset.customized = 'true';

    const wrapper = document.createElement('div');
    wrapper.className = 'custom-select';
    wrapper.dataset.selectName = select.name || select.id || '';

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'custom-select-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');

    const valueSpan = document.createElement('span');
    valueSpan.className = 'custom-select-value';

    const chevron = document.createElement('span');
    chevron.className = 'custom-select-chevron';
    chevron.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`;

    trigger.appendChild(valueSpan);
    trigger.appendChild(chevron);

    const dropdown = document.createElement('div');
    dropdown.className = 'custom-select-dropdown';
    dropdown.setAttribute('role', 'listbox');
    dropdown.setAttribute('tabindex', '-1');

    select.parentNode.insertBefore(wrapper, select);
    wrapper.appendChild(trigger);
    wrapper.appendChild(dropdown);
    wrapper.appendChild(select);
    select.classList.add('sr-only-select');

    let ignoreNextTriggerClick = false;

    function sync() {
      const idx = select.selectedIndex >= 0 ? select.selectedIndex : 0;
      const current = select.options[idx];
      if (current) {
        valueSpan.textContent = current.textContent;
        valueSpan.classList.toggle('is-placeholder', !current.value && current.disabled);
      }
      wrapper.classList.toggle('has-value', Boolean(select.value));
      dropdown.querySelectorAll('.custom-select-option').forEach(el => {
        const isSel = el.dataset.index === String(idx);
        el.classList.toggle('is-selected', isSel);
        el.setAttribute('aria-selected', String(isSel));
      });
      trigger.classList.toggle('invalid', select.classList.contains('invalid'));
    }

    function renderOptions() {
      dropdown.innerHTML = '';
      const selectedIndex = select.selectedIndex >= 0 ? select.selectedIndex : 0;
      const currentOption = select.options[selectedIndex];

      if (currentOption) {
        valueSpan.textContent = currentOption.textContent;
        valueSpan.classList.toggle('is-placeholder', !currentOption.value && currentOption.disabled);
      }
      wrapper.classList.toggle('has-value', Boolean(select.value));

      Array.from(select.options).forEach((opt, idx) => {
        const item = document.createElement('div');
        item.className = 'custom-select-option';
        item.dataset.value = opt.value;
        item.dataset.index = String(idx);
        item.setAttribute('role', 'option');

        if (opt.disabled) {
          item.classList.add('is-disabled');
          item.setAttribute('aria-disabled', 'true');
        }
        if (idx === selectedIndex) {
          item.classList.add('is-selected');
          item.setAttribute('aria-selected', 'true');
        }
        if (!opt.value && opt.disabled) {
          item.classList.add('is-placeholder');
        }

        const label = document.createElement('span');
        label.className = 'option-label';
        label.textContent = opt.textContent;
        item.appendChild(label);

        const check = document.createElement('span');
        check.className = 'option-check';
        check.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
        item.appendChild(check);

        item.addEventListener('mousedown', e => {
          e.preventDefault();
          e.stopPropagation();
        });

        item.addEventListener('click', e => {
          e.preventDefault();
          e.stopPropagation();
          if (opt.disabled) return;
          select.selectedIndex = idx;
          select.value = opt.value;
          select.classList.remove('invalid');
          trigger.classList.remove('invalid');
          select.dispatchEvent(new Event('change', { bubbles: true }));
          select.dispatchEvent(new Event('input', { bubbles: true }));
          sync();
          close(true);
          trigger.focus();
        });

        dropdown.appendChild(item);
      });
    }

    function open() {
      document.querySelectorAll('.custom-select.is-open').forEach(other => {
        if (other !== wrapper) {
          other.classList.remove('is-open');
          other.querySelector('.custom-select-trigger')?.setAttribute('aria-expanded', 'false');
        }
      });
      wrapper.classList.add('is-open');
      trigger.setAttribute('aria-expanded', 'true');
      const selected = dropdown.querySelector('.custom-select-option.is-selected');
      if (selected) {
        selected.scrollIntoView({ block: 'nearest' });
      }
    }

    function close(fromSelection = false) {
      wrapper.classList.remove('is-open');
      trigger.setAttribute('aria-expanded', 'false');
      if (fromSelection) {
        ignoreNextTriggerClick = true;
        setTimeout(() => { ignoreNextTriggerClick = false; }, 300);
      }
    }

    dropdown.addEventListener('mousedown', e => {
      e.stopPropagation();
    });

    dropdown.addEventListener('click', e => {
      e.stopPropagation();
    });

    trigger.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      if (ignoreNextTriggerClick) {
        ignoreNextTriggerClick = false;
        return;
      }
      if (wrapper.classList.contains('is-open')) {
        close();
      } else {
        open();
      }
    });

    trigger.addEventListener('keydown', e => {
      if (e.key === 'Tab') {
        close();
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!wrapper.classList.contains('is-open')) {
          open();
          return;
        }
        const delta = e.key === 'ArrowDown' ? 1 : -1;
        let nextIdx = select.selectedIndex + delta;
        while (nextIdx >= 0 && nextIdx < select.options.length && select.options[nextIdx].disabled) {
          nextIdx += delta;
        }
        if (nextIdx >= 0 && nextIdx < select.options.length) {
          select.selectedIndex = nextIdx;
          select.value = select.options[nextIdx].value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          select.dispatchEvent(new Event('input', { bubbles: true }));
          sync();
          const targetItem = dropdown.querySelector(`[data-index="${nextIdx}"]`);
          targetItem?.scrollIntoView({ block: 'nearest' });
        }
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (wrapper.classList.contains('is-open')) {
          close();
        } else {
          open();
        }
      } else if (e.key === 'Escape') {
        close();
      }
    });

    select.addEventListener('change', sync);
    select.addEventListener('input', sync);
    select.addEventListener('invalid', () => trigger.classList.add('invalid'));
    select.addEventListener('focus', () => trigger.focus());

    select._rebuildCustomSelect = renderOptions;
    select._syncCustomSelect = sync;

    renderOptions();
  });
}

document.addEventListener('click', e => {
  if (!e.target.closest('.custom-select')) {
    document.querySelectorAll('.custom-select.is-open').forEach(el => {
      el.classList.remove('is-open');
      el.querySelector('.custom-select-trigger')?.setAttribute('aria-expanded', 'false');
    });
  }
});

// Page Initialization
document.addEventListener('DOMContentLoaded', () => {
  setupThemeToggle();
  if (!checkAuth()) return;
  initStudentForm();
  initCustomSelects();
  setupNotes();
  setupPoliticalTabs();
  setupClassStatClicks();
  setupSectionSwitchTabs();
  if (document.body.dataset.page === 'login') return;
  checkDbConnection();
  if (document.body.dataset.page !== 'kazaa') fetchStudents();
  loadPendingUsers();
  loadAllUsers();
  loadBackupStatus();
  initFormEditMode();
  // Periodically re-verify DB connection status
  setInterval(checkDbConnection, 15000);
});
