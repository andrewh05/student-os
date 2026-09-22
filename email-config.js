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
    const noteEl = document.querySelector('#cfgDefaultNote');

    if (linkGen) linkGen.value = gl.general || '';
    if (linkA) linkA.value = gl['Grp A'] || '';
    if (linkB) linkB.value = gl['Grp B'] || '';
    if (linkCD) linkCD.value = gl['Grp C,D'] || '';
    if (linkE1) linkE1.value = gl['Grp E1'] || '';
    if (linkE2) linkE2.value = gl['Grp E2'] || '';
    if (noteEl) noteEl.value = s.defaultCustomNote || '';

    // Update status badge
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

  const host = document.querySelector('#cfgSmtpHost')?.value?.trim() || '';
  const port = parseInt(document.querySelector('#cfgSmtpPort')?.value || '587', 10);
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
    'Grp E2': document.querySelector('#linkGrpE2')?.value?.trim() || ''
  };

  const defaultCustomNote = document.querySelector('#cfgDefaultNote')?.value?.trim() || '';

  if (btn) btn.disabled = true;
  if (spinner) spinner.style.display = 'inline-block';
  if (btnText) btnText.textContent = 'Saving…';

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
    '#cfgDefaultNote'
  ];
  previewInputs.forEach(sel => {
    const el = document.querySelector(sel);
    if (el) el.addEventListener('input', updateConfigLivePreview);
  });

  loadConfiguration();
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

