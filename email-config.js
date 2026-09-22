// Email & Group Links Configuration Page Controller
(() => {
  const API_BASE = window.API_BASE || (window.location.protocol === 'file:' ? 'http://localhost:3000/api' : '/api');

  function getAuthToken() {
    return localStorage.getItem('hub_token') || '';
  }

  const PROVIDER_PRESETS = {
  gmail: {
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    help: 'For Gmail, use Port 465 (SSL/TLS) and enter your 16-character App Password (generated at: myaccount.google.com/apppasswords).'
  },
  outlook: {
    host: 'smtp-mail.outlook.com',
    port: 587,
    secure: false,
    help: 'For Microsoft 365 or Outlook, use your full email address and Microsoft App Password. (Note: Port 465 SSL/TLS is recommended on Cloudflare Workers).'
  },
  sendgrid: {
    host: 'smtp.sendgrid.net',
    port: 465,
    secure: true,
    user: 'apikey',
    help: 'For SendGrid, use Port 465 (SSL/TLS), username "apikey", and your SendGrid API key as password.'
  },
  mailgun: {
    host: 'smtp.mailgun.org',
    port: 465,
    secure: true,
    help: 'For Mailgun, use Port 465 (SSL/TLS) and enter your domain SMTP credentials.'
  },
  ethereal: {
    host: '',
    port: 465,
    secure: true,
    help: 'Development test mode: Generates instant clickable preview links with zero external setup needed.'
  },
  custom: {
    help: 'Enter your custom outgoing SMTP server host, port, and credentials. (Tip: For Cloudflare Workers, use Port 465 with SSL/TLS).'
  }
};

let previewDebounce = null;

async function loadConfiguration() {
  const token = localStorage.getItem('hub_token') || '';
  if (!token) {
    window.location.href = 'login.html';
    return;
  }

  const badge = document.querySelector('#smtpStatusBadge');
  if (badge) badge.textContent = 'Loading…';

  try {
    const res = await fetch(`${API_BASE}/email/settings`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (res.status === 403) {
      showToast('Access Restricted', 'Email configuration is only accessible to administrators.');
      setTimeout(() => { window.location.href = 'dashboard.html'; }, 1200);
      return;
    }

    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Could not load configuration');

    const s = data.settings || {};

    // Populate SMTP fields
    const hostEl = document.querySelector('#cfgSmtpHost');
    const portEl = document.querySelector('#cfgSmtpPort');
    const secureEl = document.querySelector('#cfgSmtpSecure');
    const userEl = document.querySelector('#cfgSmtpUser');
    const passEl = document.querySelector('#cfgSmtpPass');
    const fromEl = document.querySelector('#cfgEmailFrom');
    const pwHelpEl = document.querySelector('#pwHelpText');

    if (hostEl) hostEl.value = s.smtpHost || '';
    if (portEl) portEl.value = s.smtpPort || 465;
    if (secureEl) secureEl.value = (s.smtpSecure !== undefined ? s.smtpSecure : (s.smtpPort === 465 || !s.smtpPort)) ? 'true' : 'false';
    if (userEl) userEl.value = s.smtpUser || '';
    if (passEl) passEl.value = '';
    if (fromEl) fromEl.value = s.emailFrom || '"ULFS2 Student Affairs" <noreply@student-os.com>';

    if (pwHelpEl) {
      pwHelpEl.textContent = s.smtpPassSet
        ? '✓ Current password is securely stored. Leave blank to keep it unchanged.'
        : 'No password currently saved. Please enter your SMTP password or App Password.';
    }

    // Determine provider preset matching
    const presetSelect = document.querySelector('#providerPresetSelect');
    if (presetSelect) {
      const h = (s.smtpHost || '').toLowerCase();
      if (h.includes('gmail')) presetSelect.value = 'gmail';
      else if (h.includes('outlook') || h.includes('office365')) presetSelect.value = 'outlook';
      else if (h.includes('sendgrid')) presetSelect.value = 'sendgrid';
      else if (h.includes('mailgun')) presetSelect.value = 'mailgun';
      else if (!h && !s.configured) presetSelect.value = 'ethereal';
      else presetSelect.value = 'custom';
    }

    // Populate Group links
    const gl = s.groupLinks || {};
    const linkGen = document.querySelector('#linkGeneral');
    const linkA = document.querySelector('#linkGrpA');
    const linkB = document.querySelector('#linkGrpB');
    const linkCD = document.querySelector('#linkGrpCD');
    const linkE1 = document.querySelector('#linkGrpE1');
    const linkE2 = document.querySelector('#linkGrpE2');
    const linkAmchit = document.querySelector('#linkAmchit');
    const noteEl = document.querySelector('#cfgDefaultNote');

    if (linkGen) linkGen.value = gl.general || '';
    if (linkA) linkA.value = gl['Grp A'] || '';
    if (linkB) linkB.value = gl['Grp B'] || '';
    if (linkCD) linkCD.value = gl['Grp C,D'] || '';
    if (linkE1) linkE1.value = gl['Grp E1'] || '';
    if (linkE2) linkE2.value = gl['Grp E2'] || '';
    if (linkAmchit) linkAmchit.value = gl['Amchit'] || '';
    if (noteEl) noteEl.value = s.defaultCustomNote || '';
    const bcastNoteEl = document.querySelector('#bcastCustomNote');
    if (bcastNoteEl && !bcastNoteEl.value && s.defaultCustomNote) {
      bcastNoteEl.value = s.defaultCustomNote;
    }
    if (badge) {
      if (s.configured) {
        badge.className = 'config-status-badge is-connected';
        badge.textContent = 'Active (SMTP)';
      } else {
        badge.className = 'config-status-badge is-test';
        badge.textContent = 'Test Mode (Simulated)';
      }
    }

    updateConfigLivePreview();
  } catch (err) {
    if (badge) {
      badge.className = 'config-status-badge is-error';
      badge.textContent = 'Unavailable';
    }
    console.error('Could not load email configuration:', err);
  }
}

function updateConfigLivePreview() {
  clearTimeout(previewDebounce);
  previewDebounce = setTimeout(async () => {
    const frame = document.querySelector('#cfgLivePreviewFrame');
    if (!frame) return;

    const fromEl = document.querySelector('#cfgEmailFrom');
    const linkGen = document.querySelector('#linkGeneral');
    const linkA = document.querySelector('#linkGrpA');
    const noteEl = document.querySelector('#cfgDefaultNote');

    const sampleStudent = {
      firstName: 'Carla',
      fatherName: 'Joseph',
      familyName: 'Khoury',
      major: 'Informatics',
      section: 'mispce',
      assignedGroup: 'Grp A',
      campus: 'Fanar',
      status: 'New',
      language: 'French',
      email: 'carla.khoury@example.com'
    };

    const payload = {
      student: sampleStudent,
      groupName: 'ULFS2 Informatics (MISPCE) — Grp A',
      joinUrl: linkA?.value?.trim() || linkGen?.value?.trim() || 'https://chat.whatsapp.com/SAMPLE_INVITE',
      customMessage: noteEl?.value?.trim() || 'Please join your class group for ULFS2.',
      senderName: fromEl?.value?.split('<')[0]?.replace(/"/g, '').trim() || 'ULFS2 Student Affairs'
    };

    try {
      const res = await fetch(`${API_BASE}/email/preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAuthToken()}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success && data.html) {
        frame.srcdoc = data.html;
      }
    } catch (e) {
      console.warn('Could not render live template preview:', e);
    }
  }, 150);
}

async function handleSaveSettings() {
  const btn = document.querySelector('#btnSaveConfig');
  const btnText = document.querySelector('#btnSaveConfigText');
  const spinner = btn?.querySelector('.button-spinner');

  const btnSmtp = document.querySelector('#btnSaveSmtpOnly');
  const btnSmtpText = document.querySelector('#btnSaveSmtpText');
  const spinnerSmtp = btnSmtp?.querySelector('.button-spinner');

  const host = document.querySelector('#cfgSmtpHost')?.value?.trim() || '';
  const port = parseInt(document.querySelector('#cfgSmtpPort')?.value || '465', 10);
  const secure = document.querySelector('#cfgSmtpSecure')?.value === 'true';
  const user = document.querySelector('#cfgSmtpUser')?.value?.trim() || '';
  const pass = document.querySelector('#cfgSmtpPass')?.value || '';
  const from = document.querySelector('#cfgEmailFrom')?.value?.trim() || '';

  const groupLinks = {
    general: document.querySelector('#linkGeneral')?.value?.trim() || '',
    'Grp A': document.querySelector('#linkGrpA')?.value?.trim() || '',
    'Grp B': document.querySelector('#linkGrpB')?.value?.trim() || '',
    'Grp C,D': document.querySelector('#linkGrpCD')?.value?.trim() || '',
    'Grp E1': document.querySelector('#linkGrpE1')?.value?.trim() || '',
    'Grp E2': document.querySelector('#linkGrpE2')?.value?.trim() || '',
    'Amchit': document.querySelector('#linkAmchit')?.value?.trim() || ''
  };

  const defaultCustomNote = document.querySelector('#cfgDefaultNote')?.value?.trim() || '';

  if (btn) btn.disabled = true;
  if (spinner) spinner.style.display = 'inline-block';
  if (btnText) btnText.textContent = 'Saving…';

  if (btnSmtp) btnSmtp.disabled = true;
  if (spinnerSmtp) spinnerSmtp.style.display = 'inline-block';
  if (btnSmtpText) btnSmtpText.textContent = 'Saving…';

  try {
    const res = await fetch(`${API_BASE}/email/settings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getAuthToken()}`
      },
      body: JSON.stringify({
        smtpHost: host,
        smtpPort: port,
        smtpSecure: secure,
        smtpUser: user,
        smtpPass: pass,
        emailFrom: from,
        groupLinks,
        defaultCustomNote
      })
    });

    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to save settings');

    // Also update local storage so the dashboard modal gets updated immediately
    try {
      localStorage.setItem('ulfs2_email_preset_links', JSON.stringify(groupLinks));
      if (groupLinks.general) localStorage.setItem('ulfs2_email_last_link', groupLinks.general);
      if (defaultCustomNote) localStorage.setItem('ulfs2_email_last_note', defaultCustomNote);
    } catch {}

    showToast('Configuration Saved', 'SMTP credentials and group links have been updated.');
    await loadConfiguration();
  } catch (err) {
    showPopup({
      title: 'Configuration Error',
      message: err.message,
      danger: true
    });
  } finally {
    if (btn) btn.disabled = false;
    if (spinner) spinner.style.display = 'none';
    if (btnText) btnText.textContent = 'Save All Settings';

    if (btnSmtp) btnSmtp.disabled = false;
    if (spinnerSmtp) spinnerSmtp.style.display = 'none';
    if (btnSmtpText) btnSmtpText.textContent = '💾 Save SMTP Credentials';
  }
}

async function handleSendTestEmail() {
  const testInput = document.querySelector('#cfgTestEmail');
  const testEmail = (testInput?.value || '').trim();
  const feedback = document.querySelector('#testResultFeedback');
  const btn = document.querySelector('#btnSendTestEmail');
  const btnText = document.querySelector('#btnSendTestText');
  const spinner = btn?.querySelector('.button-spinner');

  if (!testEmail || !testEmail.includes('@')) {
    testInput?.focus();
    if (feedback) {
      feedback.style.display = 'block';
      feedback.className = 'test-result-feedback is-error';
      feedback.textContent = 'Please enter a valid recipient email address above.';
    }
    return;
  }

  if (btn) btn.disabled = true;
  if (spinner) spinner.style.display = 'inline-block';
  if (btnText) btnText.textContent = 'Sending…';
  if (feedback) {
    feedback.style.display = 'block';
    feedback.className = 'test-result-feedback';
    feedback.textContent = `Testing SMTP connection and sending to ${testEmail}…`;
  }

  const host = document.querySelector('#cfgSmtpHost')?.value?.trim() || '';
  const port = parseInt(document.querySelector('#cfgSmtpPort')?.value || '465', 10);
  const secure = document.querySelector('#cfgSmtpSecure')?.value === 'true';
  const user = document.querySelector('#cfgSmtpUser')?.value?.trim() || '';
  const pass = document.querySelector('#cfgSmtpPass')?.value || '';
  const from = document.querySelector('#cfgEmailFrom')?.value?.trim() || '';

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);

  try {
    const res = await fetch(`${API_BASE}/email/test-connection`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getAuthToken()}`
      },
      body: JSON.stringify({
        testEmail,
        smtpHost: host,
        smtpPort: port,
        smtpSecure: secure,
        smtpUser: user,
        smtpPass: pass,
        emailFrom: from
      })
    });
    clearTimeout(timeoutId);

    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Test email failed');

    if (feedback) {
      feedback.className = 'test-result-feedback is-success';
      feedback.innerHTML = `<strong>✓ Connection Verified!</strong> ${escapeHtml(data.message)}`;
      if (data.previewUrl) {
        feedback.innerHTML += `<br><a href="${data.previewUrl}" target="_blank" rel="noopener noreferrer" style="color:#2563eb;font-weight:700;text-decoration:underline;">View test message on Ethereal →</a>`;
      }
    }
    showToast('Test Email Sent', data.message);
  } catch (err) {
    clearTimeout(timeoutId);
    const isTimeout = err.name === 'AbortError' || /timeout/i.test(err.message);
    const errMsg = isTimeout ? 'Request timed out after 25 seconds. Outgoing connection took too long.' : err.message;
    if (feedback) {
      feedback.className = 'test-result-feedback is-error';
      feedback.innerHTML = `<strong>✗ Connection Failed:</strong> ${escapeHtml(errMsg)}`;
      if (/BadCredentials|535|Username and Password not accepted/i.test(errMsg)) {
        feedback.innerHTML += `<div style="margin-top:8px;font-size:12px;line-height:1.5;color:#b91c1c;">
          <strong>Gmail Authentication Tip:</strong> Google requires a 16-character <em>App Password</em> instead of your regular Google password.<br>
          1. Go to <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer" style="text-decoration:underline;color:#1d4ed8;font-weight:600;">Google App Passwords</a>.<br>
          2. Generate a new App Password named "StudentOS", copy the 16 characters, paste it into the <strong>SMTP Password</strong> field above, and click Send Test Email again.
        </div>`;
      } else if (/TLS|handshake|587/i.test(errMsg)) {
        feedback.innerHTML += `<div style="margin-top:10px;"><button type="button" id="btnAutoFixTls" class="btn-primary" style="padding:6px 14px;font-size:12px;cursor:pointer;">⚡ Switch to Port 465 (SSL/TLS) &amp; Retry</button></div>`;
        setTimeout(() => {
          const autoFixBtn = document.querySelector('#btnAutoFixTls');
          if (autoFixBtn) {
            autoFixBtn.onclick = () => {
              const portEl = document.querySelector('#cfgSmtpPort');
              const secEl = document.querySelector('#cfgSmtpSecure');
              if (portEl) portEl.value = '465';
              if (secEl) secEl.value = 'true';
              handleSendTestEmail();
            };
          }
        }, 50);
      }
    }
  } finally {
    if (btn) btn.disabled = false;
    if (spinner) spinner.style.display = 'none';
    if (btnText) btnText.textContent = 'Send Test Email';
  }
}

function initEmailConfigPage() {
  const saveBtn = document.querySelector('#btnSaveConfig');
  if (saveBtn) saveBtn.addEventListener('click', handleSaveSettings);

  const saveSmtpOnlyBtn = document.querySelector('#btnSaveSmtpOnly');
  if (saveSmtpOnlyBtn) saveSmtpOnlyBtn.addEventListener('click', handleSaveSettings);

  const testBtn = document.querySelector('#btnSendTestEmail');
  if (testBtn) testBtn.addEventListener('click', handleSendTestEmail);

  // Auto-sync Port and Security dropdowns
  const portInput = document.querySelector('#cfgSmtpPort');
  const secureSelect = document.querySelector('#cfgSmtpSecure');
  if (portInput && secureSelect) {
    portInput.addEventListener('input', () => {
      const p = parseInt(portInput.value, 10);
      if (p === 465) secureSelect.value = 'true';
      else if (p === 587) secureSelect.value = 'false';
    });
    secureSelect.addEventListener('change', () => {
      if (secureSelect.value === 'true' && portInput.value === '587') {
        portInput.value = '465';
      } else if (secureSelect.value === 'false' && portInput.value === '465') {
        portInput.value = '587';
      }
    });
  }

  // Toggle password visibility
  const togglePwBtn = document.querySelector('#togglePwBtn');
  const pwInput = document.querySelector('#cfgSmtpPass');
  if (togglePwBtn && pwInput) {
    togglePwBtn.addEventListener('click', () => {
      const isPw = pwInput.type === 'password';
      pwInput.type = isPw ? 'text' : 'password';
      togglePwBtn.textContent = isPw ? '🔒' : '👁';
    });
  }

  // Provider preset selection
  const presetSelect = document.querySelector('#providerPresetSelect');
  if (presetSelect) {
    presetSelect.addEventListener('change', () => {
      const p = PROVIDER_PRESETS[presetSelect.value];
      if (!p) return;

      const hostEl = document.querySelector('#cfgSmtpHost');
      const portEl = document.querySelector('#cfgSmtpPort');
      const secureEl = document.querySelector('#cfgSmtpSecure');
      const userEl = document.querySelector('#cfgSmtpUser');

      if (p.host !== undefined && hostEl) hostEl.value = p.host;
      if (p.port !== undefined && portEl) portEl.value = p.port;
      if (p.secure !== undefined && secureEl) secureEl.value = String(p.secure);
      if (p.user !== undefined && userEl) userEl.value = p.user;

      const feedback = document.querySelector('#testResultFeedback');
      if (feedback && p.help) {
        feedback.style.display = 'block';
        feedback.className = 'test-result-feedback';
        feedback.textContent = p.help;
      }
      updateConfigLivePreview();
    });
  }

  // Reset to defaults
  const resetBtn = document.querySelector('#btnResetSettings');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (window.confirm('Reset all fields to standard defaults?')) {
        document.querySelector('#cfgSmtpHost').value = 'smtp.gmail.com';
        document.querySelector('#cfgSmtpPort').value = '587';
        document.querySelector('#cfgSmtpSecure').value = 'false';
        document.querySelector('#cfgEmailFrom').value = '"ULFS2 Student Affairs" <noreply@student-os.com>';
        document.querySelector('#cfgDefaultNote').value = '';
        updateConfigLivePreview();
      }
    });
  }

  // Desktop / Mobile preview toggle
  const desktopBtn = document.querySelector('#cfgPreviewDesktop');
  const mobileBtn = document.querySelector('#cfgPreviewMobile');
  const wrap = document.querySelector('#cfgPreviewFrameWrap');
  if (desktopBtn && mobileBtn && wrap) {
    desktopBtn.addEventListener('click', () => {
      desktopBtn.classList.add('is-active');
      mobileBtn.classList.remove('is-active');
      wrap.classList.remove('is-mobile');
    });
    mobileBtn.addEventListener('click', () => {
      mobileBtn.classList.add('is-active');
      desktopBtn.classList.remove('is-active');
      wrap.classList.add('is-mobile');
    });
  }

  // Live preview input listeners
  const previewInputs = [
    '#cfgEmailFrom',
    '#linkGeneral',
    '#linkGrpA',
    '#linkGrpB',
    '#linkGrpCD',
    '#linkGrpE1',
    '#linkGrpE2',
    '#linkAmchit',
    '#cfgDefaultNote'
  ];
  previewInputs.forEach(sel => {
    const el = document.querySelector(sel);
    if (el) el.addEventListener('input', updateConfigLivePreview);
  });
  loadConfiguration();
  initBroadcastSection();
}

/* ==========================================================================
   Mass Broadcast & Delivery Logs Controller
   ========================================================================== */

let broadcastState = {
  isRunning: false,
  isPaused: false,
  abortRequested: false,
  recipientsData: { counts: {}, recipients: [] },
  activeFilter: 'all',
  searchQuery: '',
  logs: [],
  sessionStats: {
    target: 0,
    sent: 0,
    failed: 0,
    skipped: 0
  }
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatLogTimestamp(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return isoStr;
  }
}

async function loadBroadcastRecipients() {
  const token = getAuthToken();
  if (!token) return;

  try {
    const res = await fetch(`${API_BASE}/email/recipients`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return;
    const data = await res.json();
    if (!data.success) return;

    broadcastState.recipientsData = data;
    renderBroadcastStats(data.counts);
    updateBroadcastButtonLabel();
  } catch (err) {
    console.warn('Could not fetch broadcast recipients:', err.message);
  }
}

function renderBroadcastStats(counts = {}) {
  const totalEl = document.querySelector('#statTotalStudents') || document.querySelector('#bcastTotalStudents');
  const validEl = document.querySelector('#statValidEmails') || document.querySelector('#bcastValidEmail');
  const uninvitedEl = document.querySelector('#bcastUninvited');
  const invitedEl = document.querySelector('#bcastInvited');
  const sectionSub = document.querySelector('#bcastSectionSub');

  if (totalEl) totalEl.textContent = counts.total ?? 0;
  if (validEl) validEl.textContent = counts.withEmail ?? 0;
  if (uninvitedEl) uninvitedEl.textContent = counts.uninvited ?? 0;
  if (invitedEl) invitedEl.textContent = counts.invited ?? 0;

  if (sectionSub && counts.bySection) {
    sectionSub.textContent = `MISPCE: ${counts.bySection.mispce || 0} • CSVT: ${counts.bySection.csvt || 0}`;
  }
}

function getFilteredTargetRecipients() {
  const audience = document.querySelector('#bcastAudienceSelect')?.value || 'uninvited';
  const all = broadcastState.recipientsData.recipients || [];

  return all.filter(student => {
    const sec = (student.section || '').toLowerCase();
    const camp = (student.campus || '').toLowerCase();
    const isInvited = Boolean(student.linkApproved || student.inClass);

    switch (audience) {
      case 'uninvited':
        return !isInvited;
      case 'all':
        return true;
      case 'mispce':
        return sec === 'mispce';
      case 'csvt':
        return sec === 'csvt';
      case 'amchit':
        return camp.includes('am');
      case 'fanar':
        return camp.includes('fan') || (!camp.includes('am') && camp !== '');
      default:
        return true;
    }
  });
}

function updateBroadcastButtonLabel() {
  const btnText = document.querySelector('#btnSendAllStudentsText') || document.querySelector('#btnStartBroadcastText');
  if (!btnText || broadcastState.isRunning) return;

  const targets = getFilteredTargetRecipients();
  const validCount = targets.filter(s => s.hasValidEmail).length;
  btnText.textContent = `Send Email to ${validCount} Student${validCount === 1 ? '' : 's'}`;
}

async function loadDeliveryLogs() {
  const token = getAuthToken();
  if (!token) return;

  try {
    const res = await fetch(`${API_BASE}/email/logs?limit=500`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return;
    const data = await res.json();
    if (!data.success) return;

    broadcastState.logs = data.logs || [];
    renderDeliveryLogs();
    updateLogTabBadges();
  } catch (err) {
    console.warn('Could not load email delivery logs:', err.message);
  }
}

function updateLiveNumberPills() {
  const targetEl = document.querySelector('#liveStatTarget');
  const sentEl = document.querySelector('#numSentStudents') || document.querySelector('#liveStatSent');
  const failedEl = document.querySelector('#numFailedStudents') || document.querySelector('#liveStatFailed');
  const skippedEl = document.querySelector('#liveStatSkipped');
  const rateEl = document.querySelector('#numSuccessRate');

  if (targetEl) targetEl.textContent = broadcastState.sessionStats.target;
  if (sentEl) sentEl.textContent = broadcastState.sessionStats.sent;
  if (failedEl) failedEl.textContent = broadcastState.sessionStats.failed;
  if (skippedEl) skippedEl.textContent = broadcastState.sessionStats.skipped;

  if (rateEl) {
    const attempted = broadcastState.sessionStats.sent + broadcastState.sessionStats.failed;
    if (attempted === 0) {
      rateEl.textContent = '100%';
    } else {
      const rate = Math.round((broadcastState.sessionStats.sent / attempted) * 100);
      rateEl.textContent = `${rate}%`;
    }
  }
}

function updateLogTabBadges() {
  const allLogs = broadcastState.logs || [];
  const sentCount = allLogs.filter(l => l.status === 'sent').length;
  const failedCount = allLogs.filter(l => l.status === 'failed').length;
  const skippedCount = allLogs.filter(l => l.status === 'skipped').length;

  const tabAll = document.querySelector('#logFilterAllCount');
  const tabSent = document.querySelector('#logFilterSentCount');
  const tabFailed = document.querySelector('#logFilterFailedCount');
  const tabSkipped = document.querySelector('#logFilterSkippedCount');

  if (tabAll) tabAll.textContent = allLogs.length;
  if (tabSent) tabSent.textContent = sentCount;
  if (tabFailed) tabFailed.textContent = failedCount;
  if (tabSkipped) tabSkipped.textContent = skippedCount;
}

function renderDeliveryLogs() {
  const tbody = document.querySelector('#deliveryLogsTable tbody') || document.querySelector('#broadcastLogsBody');
  if (!tbody) return;

  let list = broadcastState.logs || [];

  if (broadcastState.activeFilter !== 'all') {
    list = list.filter(item => item.status === broadcastState.activeFilter);
  }

  if (broadcastState.searchQuery) {
    const q = broadcastState.searchQuery.toLowerCase();
    list = list.filter(item =>
      (item.studentName && item.studentName.toLowerCase().includes(q)) ||
      (item.email && item.email.toLowerCase().includes(q)) ||
      (item.major && item.major.toLowerCase().includes(q)) ||
      (item.assignedGroup && item.assignedGroup.toLowerCase().includes(q)) ||
      (item.error && item.error.toLowerCase().includes(q))
    );
  }

  if (list.length === 0) {
    tbody.innerHTML = `
      <tr class="empty-log-row">
        <td colspan="9" style="text-align:center; padding: 28px; color: var(--muted);">
          ${broadcastState.logs.length === 0 ? 'No delivery logs yet. Click <strong>"Send Email to All Students"</strong> to begin.' : 'No logs match your active filter.'}
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = list.map((item, idx) => {
    const statusClass = item.status === 'sent' ? 'is-sent' : (item.status === 'failed' ? 'is-failed' : 'is-skipped');
    const statusIcon = item.status === 'sent' ? '✓ Sent' : (item.status === 'failed' ? '✗ Failed' : '⊘ Skipped');
    const timeStr = formatLogTimestamp(item.timestamp);
    const details = item.status === 'sent'
      ? (item.previewUrl ? `<a href="${item.previewUrl}" target="_blank" rel="noopener noreferrer" style="color:#2563eb;text-decoration:underline;">View Preview →</a>` : (item.isSimulated ? 'Simulated delivery (test mode)' : 'Delivered via SMTP'))
      : escapeHtml(item.error || 'Unknown error');

    const retryBtn = item.status === 'failed' && item.studentId
      ? `<button type="button" class="btn-retry-log" data-student-id="${escapeHtml(item.studentId)}" title="Retry sending email to this student">Retry</button>`
      : '';

    return `
      <tr>
        <td style="color: var(--muted); font-size: 11px;">${idx + 1}</td>
        <td style="color: var(--muted); font-size: 11px; white-space: nowrap;">${timeStr}</td>
        <td><strong>${escapeHtml(item.studentName || 'Student')}</strong></td>
        <td><span style="font-family: monospace; font-size: 11px;">${escapeHtml(item.email || '—')}</span></td>
        <td>${escapeHtml((item.major || '—') + (item.section ? ` (${item.section.toUpperCase()})` : ''))}</td>
        <td><span style="color: var(--orange-primary); font-weight: 600;">${escapeHtml(item.assignedGroup || item.groupKey || 'General')}</span></td>
        <td><span class="log-status-pill ${statusClass}">${statusIcon}</span></td>
        <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(details)}">${details}</td>
        <td style="text-align: right;">${retryBtn}</td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('.btn-retry-log').forEach(btn => {
    btn.addEventListener('click', () => handleRetrySingleStudent(btn.dataset.studentId, btn));
  });
}

async function handleRetrySingleStudent(studentId, btn) {
  if (!studentId) return;
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Retrying…';
  }

  const customNote = document.querySelector('#bcastCustomNote')?.value?.trim() || '';

  try {
    const res = await fetch(`${API_BASE}/email/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getAuthToken()}`
      },
      body: JSON.stringify({
        studentId,
        automatic: true,
        markApproved: true,
        customMessage: customNote
      })
    });

    const data = await res.json();
    if (data.success && data.sentCount > 0) {
      showToast('Email Sent', 'Invitation dispatched successfully on retry.');
      await loadDeliveryLogs();
      await loadBroadcastRecipients();
    } else {
      throw new Error(data.results?.[0]?.error || data.error || 'Retry failed');
    }
  } catch (err) {
    showToast('Retry Failed', err.message);
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Retry';
    }
  }
}

async function handleSendEmailToAllStudents() {
  if (broadcastState.isRunning) return;

  const targetStudents = getFilteredTargetRecipients();
  if (!targetStudents.length) {
    showPopup({
      title: 'No Matching Students',
      message: 'No students found matching your selected audience filter.',
      danger: false
    });
    return;
  }

  const studentsWithEmail = targetStudents.filter(s => s.hasValidEmail);
  const studentsWithoutEmail = targetStudents.filter(s => !s.hasValidEmail);

  if (!studentsWithEmail.length) {
    showPopup({
      title: 'No Valid Email Addresses',
      message: 'All matching students are missing an email address. Please update student records with valid emails first.',
      danger: false
    });
    return;
  }

  const paceSelect = document.querySelector('#broadcastPaceSelect') || document.querySelector('#bcastDelaySelect');
  const delayMs = parseInt(paceSelect?.value || '1500', 10);
  const estimatedSeconds = Math.ceil((studentsWithEmail.length * delayMs) / 1000);
  const estMinutes = Math.ceil(estimatedSeconds / 60);

  const confirmMsg = `Send official group invitation emails to ${studentsWithEmail.length} students?\n\n` +
    `• Anti-restriction pacing: ${delayMs / 1000}s delay between emails (~${estMinutes} minute${estMinutes === 1 ? '' : 's'} total).\n` +
    `• Missing emails (skipped): ${studentsWithoutEmail.length}\n` +
    `• Group links: Automatically assigned per student major and section.\n\n` +
    `You can pause or stop the broadcast at any time.`;

  if (!window.confirm(confirmMsg)) return;

  broadcastState.isRunning = true;
  broadcastState.isPaused = false;
  broadcastState.abortRequested = false;
  broadcastState.sessionStats = {
    target: targetStudents.length,
    sent: 0,
    failed: 0,
    skipped: 0
  };

  updateLiveNumberPills();

  const startBtn = document.querySelector('#btnSendAllStudents') || document.querySelector('#btnStartBroadcast');
  const pauseBtn = document.querySelector('#btnPauseBroadcast');
  const resumeBtn = document.querySelector('#btnResumeBroadcast');
  const stopBtn = document.querySelector('#btnStopBroadcast');
  const pauseBtnText = document.querySelector('#btnPauseBroadcastText');
  const progressPanel = document.querySelector('#broadcastProgressPanel');
  const progressBar = document.querySelector('#bcastProgressBar');
  const progressPercent = document.querySelector('#bcastProgressPercent');
  const progressRatio = document.querySelector('#bcastProgressRatio');
  const progressAction = document.querySelector('#bcastCurrentAction');
  const progressHeadline = document.querySelector('#bcastProgressHeadline');
  const etaText = document.querySelector('#bcastEtaText');
  const statusBadge = document.querySelector('#broadcastStatusBadge');

  if (startBtn) startBtn.disabled = true;
  if (pauseBtn) {
    pauseBtn.disabled = false;
    pauseBtn.style.display = 'inline-flex';
    if (pauseBtnText) pauseBtnText.textContent = '⏸ Pause';
  }
  if (resumeBtn) {
    resumeBtn.disabled = false;
    resumeBtn.style.display = 'none';
  }
  if (stopBtn) stopBtn.disabled = false;
  if (progressPanel) progressPanel.style.display = 'block';
  if (statusBadge) {
    statusBadge.className = 'config-status-badge is-test';
    statusBadge.textContent = 'Broadcasting…';
  }

  const broadcastId = `bcast-${Date.now()}`;
  const customNote = document.querySelector('#bcastCustomNote')?.value?.trim() || '';
  const startTime = Date.now();

  for (const s of studentsWithoutEmail) {
    broadcastState.sessionStats.skipped++;
    broadcastState.logs.unshift({
      id: `log-${Date.now()}-${s.id}`,
      timestamp: new Date().toISOString(),
      studentId: s.id,
      studentName: s.fullName,
      email: '',
      major: s.major,
      section: s.section,
      assignedGroup: s.assignedGroup,
      status: 'skipped',
      error: 'Missing email address'
    });
  }
  updateLiveNumberPills();

  for (let i = 0; i < studentsWithEmail.length; i++) {
    if (broadcastState.abortRequested) {
      if (progressAction) progressAction.textContent = 'Broadcast cancelled by administrator.';
      break;
    }

    while (broadcastState.isPaused && !broadcastState.abortRequested) {
      if (progressAction) progressAction.textContent = 'Broadcast paused. Click Resume to continue.';
      if (statusBadge) statusBadge.textContent = 'Paused';
      await sleep(300);
    }

    if (broadcastState.abortRequested) break;
    if (statusBadge) statusBadge.textContent = 'Broadcasting…';

    const student = studentsWithEmail[i];
    const currentProgress = Math.round(((i + 1) / studentsWithEmail.length) * 100);

    const elapsedSec = (Date.now() - startTime) / 1000;
    const remainingStudents = studentsWithEmail.length - (i + 1);
    const avgSecPerStudent = elapsedSec / (i + 1);
    const remainingSec = Math.round(remainingStudents * Math.max(avgSecPerStudent, delayMs / 1000));
    const etaMin = Math.ceil(remainingSec / 60);

    if (progressBar) progressBar.style.width = `${currentProgress}%`;
    if (progressPercent) progressPercent.textContent = `${currentProgress}%`;
    if (progressRatio) progressRatio.textContent = `${i + 1} / ${studentsWithEmail.length}`;
    if (progressAction) progressAction.textContent = `Sending to ${student.fullName} (${student.email})…`;
    if (etaText) etaText.textContent = remainingStudents > 0 ? `ETA: ~${etaMin} min` : 'Finishing…';

    try {
      const res = await fetch(`${API_BASE}/email/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAuthToken()}`
        },
        body: JSON.stringify({
          studentId: student.id,
          automatic: true,
          markApproved: true,
          customMessage: customNote,
          broadcastId
        })
      });

      const data = await res.json();
      const sendResult = data.results?.[0];

      if (data.success && data.sentCount === 1) {
        broadcastState.sessionStats.sent++;
        broadcastState.logs.unshift({
          id: `log-${Date.now()}`,
          timestamp: new Date().toISOString(),
          studentId: student.id,
          studentName: student.fullName,
          email: student.email,
          major: student.major,
          section: student.section,
          assignedGroup: student.assignedGroup,
          groupKey: sendResult?.groupKey,
          status: 'sent',
          previewUrl: sendResult?.previewUrl,
          isSimulated: sendResult?.isSimulated
        });
      } else {
        const isRateLimit = Boolean(sendResult?.isRateLimit || /rate limit|quota|421/i.test(data.error || sendResult?.error));
        broadcastState.sessionStats.failed++;
        broadcastState.logs.unshift({
          id: `log-${Date.now()}`,
          timestamp: new Date().toISOString(),
          studentId: student.id,
          studentName: student.fullName,
          email: student.email,
          major: student.major,
          section: student.section,
          assignedGroup: student.assignedGroup,
          status: 'failed',
          error: sendResult?.error || data.error || 'Sending failed',
          isRateLimit
        });

        if (isRateLimit) {
          handlePauseBroadcast();
          showPopup({
            title: '⚠️ Provider Rate Throttling Detected',
            message: 'Your email server signaled a temporary sending limit (e.g. Gmail 421 or burst quota). To prevent restrictions or account suspension, the broadcast has been safely paused.\n\nPlease wait 30–60 seconds, then click "Resume" to continue safely.',
            danger: true
          });
        }
      }
    } catch (netErr) {
      broadcastState.sessionStats.failed++;
      broadcastState.logs.unshift({
        id: `log-${Date.now()}`,
        timestamp: new Date().toISOString(),
        studentId: student.id,
        studentName: student.fullName,
        email: student.email,
        status: 'failed',
        error: netErr.message
      });
    }

    updateLiveNumberPills();
    renderDeliveryLogs();
    updateLogTabBadges();

    if (i < studentsWithEmail.length - 1 && delayMs > 0 && !broadcastState.abortRequested) {
      await sleep(delayMs);
    }
  }

  broadcastState.isRunning = false;
  broadcastState.isPaused = false;
  if (startBtn) startBtn.disabled = false;
  if (pauseBtn) {
    pauseBtn.disabled = true;
    pauseBtn.style.display = 'inline-flex';
  }
  if (resumeBtn) {
    resumeBtn.disabled = true;
    resumeBtn.style.display = 'none';
  }
  if (stopBtn) stopBtn.disabled = true;

  if (progressHeadline) progressHeadline.textContent = broadcastState.abortRequested ? 'Broadcast Stopped' : 'Broadcast Completed!';
  if (progressAction) progressAction.textContent = broadcastState.abortRequested
    ? `Stopped after sending ${broadcastState.sessionStats.sent} emails.`
    : `Completed: ${broadcastState.sessionStats.sent} sent, ${broadcastState.sessionStats.failed} failed, ${broadcastState.sessionStats.skipped} skipped.`;
  if (statusBadge) {
    statusBadge.className = 'config-status-badge is-connected';
    statusBadge.textContent = 'Finished';
  }

  showToast(
    'Broadcast Complete',
    `Sent: ${broadcastState.sessionStats.sent}, Failed: ${broadcastState.sessionStats.failed}, Skipped: ${broadcastState.sessionStats.skipped}`
  );

  await loadBroadcastRecipients();
  await loadDeliveryLogs();
}

const handleStartBroadcast = handleSendEmailToAllStudents;

function handlePauseBroadcast() {
  if (!broadcastState.isRunning) return;
  broadcastState.isPaused = true;
  const pauseBtn = document.querySelector('#btnPauseBroadcast');
  const resumeBtn = document.querySelector('#btnResumeBroadcast');
  const pauseBtnText = document.querySelector('#btnPauseBroadcastText');
  if (pauseBtn) pauseBtn.style.display = 'none';
  if (resumeBtn) resumeBtn.style.display = 'inline-flex';
  if (pauseBtnText) pauseBtnText.textContent = '⏸ Pause';
}

function handleResumeBroadcast() {
  if (!broadcastState.isRunning) return;
  broadcastState.isPaused = false;
  const pauseBtn = document.querySelector('#btnPauseBroadcast');
  const resumeBtn = document.querySelector('#btnResumeBroadcast');
  if (pauseBtn) pauseBtn.style.display = 'inline-flex';
  if (resumeBtn) resumeBtn.style.display = 'none';
}

function handlePauseResumeBroadcast() {
  if (broadcastState.isPaused) {
    handleResumeBroadcast();
  } else {
    handlePauseBroadcast();
  }
}

function handleStopBroadcast() {
  if (!broadcastState.isRunning) return;
  if (window.confirm('Are you sure you want to stop the ongoing broadcast? Any emails sent so far will remain delivered.')) {
    broadcastState.abortRequested = true;
    broadcastState.isPaused = false;
  }
}

async function handleClearLogs() {
  if (!window.confirm('Clear all delivery logs from this page and database?')) return;
  const token = getAuthToken();
  if (!token) return;

  try {
    await fetch(`${API_BASE}/email/logs`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    broadcastState.logs = [];
    broadcastState.sessionStats = { target: 0, sent: 0, failed: 0, skipped: 0 };
    updateLiveNumberPills();
    renderDeliveryLogs();
    updateLogTabBadges();
    showToast('Logs Cleared', 'Email delivery log history has been cleared.');
  } catch (e) {
    console.warn('Could not clear logs:', e);
  }
}

function exportLogsToCsv() {
  const logs = broadcastState.logs || [];
  if (!logs.length) {
    showToast('No Logs', 'No delivery logs available to export.');
    return;
  }

  const headers = ['#', 'Timestamp', 'Student Name', 'Email', 'Major', 'Section', 'Assigned Group', 'Status', 'Details'];
  const rows = logs.map((l, i) => [
    i + 1,
    `"${l.timestamp || ''}"`,
    `"${(l.studentName || '').replace(/"/g, '""')}"`,
    `"${(l.email || '').replace(/"/g, '""')}"`,
    `"${(l.major || '').replace(/"/g, '""')}"`,
    `"${(l.section || '').replace(/"/g, '""')}"`,
    `"${(l.assignedGroup || l.groupKey || '').replace(/"/g, '""')}"`,
    `"${l.status || ''}"`,
    `"${(l.error || (l.status === 'sent' ? 'Delivered' : '')).replace(/"/g, '""')}"`
  ]);

  const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `ulfs2_email_broadcast_logs_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

const handleExportLogsCsv = exportLogsToCsv;

function initBroadcastSection() {
  const startBtn = document.querySelector('#btnSendAllStudents') || document.querySelector('#btnStartBroadcast');
  if (startBtn) startBtn.addEventListener('click', handleSendEmailToAllStudents);

  const pauseBtn = document.querySelector('#btnPauseBroadcast');
  if (pauseBtn) pauseBtn.addEventListener('click', handlePauseBroadcast);

  const resumeBtn = document.querySelector('#btnResumeBroadcast');
  if (resumeBtn) resumeBtn.addEventListener('click', handleResumeBroadcast);

  const stopBtn = document.querySelector('#btnStopBroadcast');
  if (stopBtn) stopBtn.addEventListener('click', handleStopBroadcast);

  const refreshBtn = document.querySelector('#btnRefreshBroadcastStats');
  if (refreshBtn) refreshBtn.addEventListener('click', async () => {
    await loadBroadcastRecipients();
    showToast('Refreshed', 'Recipient counts updated.');
  });

  const clearBtn = document.querySelector('#btnClearBroadcastLogs');
  if (clearBtn) clearBtn.addEventListener('click', handleClearLogs);

  const exportBtn = document.querySelector('#btnExportCsv') || document.querySelector('#btnExportBroadcastLogs');
  if (exportBtn) exportBtn.addEventListener('click', exportLogsToCsv);

  const audienceSelect = document.querySelector('#bcastAudienceSelect');
  if (audienceSelect) audienceSelect.addEventListener('change', updateBroadcastButtonLabel);

  document.querySelectorAll('.log-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.log-tab').forEach(t => t.classList.remove('is-active'));
      tab.classList.add('is-active');
      broadcastState.activeFilter = tab.dataset.filter || 'all';
      renderDeliveryLogs();
    });
  });

  const searchInput = document.querySelector('#logSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      broadcastState.searchQuery = (searchInput.value || '').trim();
      renderDeliveryLogs();
    });
  }

  loadBroadcastRecipients();
  loadDeliveryLogs();
}

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (document.body.dataset.page === 'email-config') {
        initEmailConfigPage();
      }
    });
  } else {
    if (document.body.dataset.page === 'email-config') {
      initEmailConfigPage();
    }
  }
})();

