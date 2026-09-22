const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
let cryptoHelpers = null;
try {
  cryptoHelpers = require('./crypto');
} catch {}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Format academic section for display
 */
function formatSection(sec) {
  if (!sec) return 'MISPCE';
  return String(sec).trim().toUpperCase();
}

/**
 * Build the beautiful HTML email template
 */
function renderEmailTemplate({
  student = {},
  groupName = '',
  joinUrl = '',
  customMessage = '',
  senderName = 'ULFS2 Student Affairs & Delegation'
}) {
  const firstName = student.firstName || 'Student';
  const fatherName = student.fatherName || '';
  const familyName = student.familyName || '';
  const fullName = [firstName, fatherName, familyName].filter(Boolean).join(' ') || firstName;
  const major = student.major || 'Faculty of Sciences II';
  const section = formatSection(student.section || (student.major && /math|info|stat|phys|chem|elec/i.test(student.major) ? 'MISPCE' : 'CSVT'));
  const assignedGroup = student.assignedGroup || 'General Section';
  const campus = student.campus || 'Fanar / Amshit';
  const status = student.status || 'Student';
  const language = student.language || 'French / English';
  const targetGroupTitle = groupName || `ULFS2 ${major} (${section}) — ${assignedGroup}`;
  const effectiveJoinUrl = joinUrl || 'https://chat.whatsapp.com/';

  const subject = `Official Invitation: Join Your Class Group — ${targetGroupTitle}`;

  // Plain text fallback
  const text = `
Hello ${fullName},

You are officially invited to join your academic class group for ${major} (${section} - ${assignedGroup}) at Lebanese University, Faculty of Sciences II.

To join your cohort group, please click the link below:
${effectiveJoinUrl}

--- Academic Track Details ---
• Student: ${fullName}
• Major: ${major}
• Academic Section: ${section}
• Assigned Group: ${assignedGroup}
• Campus: ${campus}
• Status: ${status}
• Language Track: ${language}

${customMessage ? `Note from your delegates:\n${customMessage}\n\n` : ''}
Important Instructions:
1. Please ensure your WhatsApp/messaging display name matches your university registered name (${fullName}) so group administrators can verify and accept your request promptly.
2. Official announcements, lecture notes, hall assignments, and exam schedules are coordinated inside this group.
3. If you have questions or need assistance, contact your class delegates.

Best regards,
${senderName}
Lebanese University — Faculty of Sciences II
student-os.com
`.trim();

  // Modern, high-conversion, responsive HTML template
  const html = `<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <title>${escapeHtml(subject)}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
    body {
      margin: 0 !important;
      padding: 0 !important;
      width: 100% !important;
      background-color: #f4efe9;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #331f14;
      line-height: 1.6;
    }
    .wrapper {
      width: 100%;
      table-layout: fixed;
      background-color: #f4efe9;
      padding: 40px 16px;
    }
    .main-card {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 20px;
      border: 1px solid #ebd9c8;
      overflow: hidden;
      box-shadow: 0 12px 36px rgba(124, 45, 18, 0.08);
    }
    .hero-header {
      background: linear-gradient(135deg, #ea580c 0%, #c2410c 100%);
      padding: 36px 32px 30px;
      text-align: center;
      color: #ffffff;
    }
    .brand-badge {
      display: inline-block;
      background: rgba(255, 255, 255, 0.2);
      border: 1px solid rgba(255, 255, 255, 0.35);
      border-radius: 30px;
      padding: 5px 16px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      color: #ffffff;
      margin-bottom: 14px;
    }
    .hero-title {
      margin: 0 0 8px;
      font-size: 24px;
      font-weight: 800;
      line-height: 1.25;
      letter-spacing: -0.5px;
      color: #ffffff;
    }
    .hero-subtitle {
      margin: 0;
      font-size: 14px;
      color: rgba(255, 255, 255, 0.9);
      font-weight: 500;
    }
    .content-body {
      padding: 36px 32px;
      color: #431407;
    }
    .greeting {
      font-size: 18px;
      font-weight: 700;
      color: #431407;
      margin: 0 0 14px;
    }
    .welcome-text {
      font-size: 15px;
      line-height: 1.65;
      color: #5c3826;
      margin: 0 0 24px;
    }
    .academic-card {
      background: #faf5f0;
      border: 1px solid #eddcd0;
      border-radius: 14px;
      padding: 20px 22px;
      margin: 0 0 28px;
    }
    .academic-header {
      font-size: 12px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #ea580c;
      margin-bottom: 14px;
      display: block;
    }
    .info-table {
      width: 100%;
      border-collapse: collapse;
    }
    .info-table td {
      padding: 6px 0;
      font-size: 14px;
      vertical-align: top;
    }
    .info-label {
      width: 42%;
      color: #8c6a58;
      font-weight: 500;
    }
    .info-value {
      width: 58%;
      color: #431407;
      font-weight: 700;
      text-align: right;
    }
    .cta-container {
      text-align: center;
      margin: 32px 0 26px;
    }
    .cta-btn {
      display: inline-block;
      background: linear-gradient(135deg, #ea580c 0%, #c2410c 100%);
      color: #ffffff !important;
      text-decoration: none !important;
      font-size: 16px;
      font-weight: 700;
      padding: 16px 36px;
      border-radius: 12px;
      box-shadow: 0 6px 18px rgba(234, 88, 12, 0.35);
      letter-spacing: 0.3px;
      transition: all 0.2s ease;
    }
    .cta-hint {
      display: block;
      font-size: 12px;
      color: #927565;
      margin-top: 10px;
    }
    .link-fallback {
      background: #fdfaf7;
      border: 1px dashed #e4cfbd;
      border-radius: 10px;
      padding: 12px 16px;
      margin-bottom: 26px;
      font-size: 12px;
      color: #7c5c49;
      word-break: break-all;
    }
    .link-fallback a {
      color: #ea580c;
      font-weight: 600;
      text-decoration: underline;
    }
    .custom-note-box {
      background: #fff8f1;
      border-left: 4px solid #ea580c;
      border-radius: 0 10px 10px 0;
      padding: 14px 18px;
      margin-bottom: 24px;
      font-size: 14px;
      color: #63331b;
    }
    .custom-note-title {
      font-weight: 700;
      color: #c2410c;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 6px;
    }
    .instructions-card {
      background: #ffffff;
      border: 1px solid #ebd9c8;
      border-radius: 12px;
      padding: 18px 20px;
      margin-bottom: 24px;
    }
    .instructions-title {
      font-size: 13px;
      font-weight: 700;
      color: #431407;
      margin: 0 0 10px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .instructions-list {
      margin: 0;
      padding-left: 20px;
      font-size: 13px;
      color: #6d4b38;
      line-height: 1.6;
    }
    .instructions-list li {
      margin-bottom: 6px;
    }
    .footer {
      background-color: #faf5f0;
      border-top: 1px solid #ebd9c8;
      padding: 24px 32px;
      text-align: center;
      font-size: 12px;
      color: #8c6a58;
      line-height: 1.5;
    }
    .footer-logo {
      font-weight: 800;
      font-size: 13px;
      color: #431407;
      margin-bottom: 4px;
    }
    .footer-links a {
      color: #ea580c;
      text-decoration: none;
      margin: 0 6px;
      font-weight: 600;
    }
    @media only screen and (max-width: 600px) {
      .wrapper { padding: 12px 6px !important; }
      .main-card { border-radius: 14px !important; }
      .hero-header { padding: 28px 20px !important; }
      .hero-title { font-size: 20px !important; }
      .content-body { padding: 24px 18px !important; }
      .academic-card { padding: 16px 14px !important; }
      .cta-btn { width: 100% !important; box-sizing: border-box !important; padding: 16px 20px !important; }
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <table role="presentation" class="main-card" align="center" width="100%" cellpadding="0" cellspacing="0">
      <!-- HEADER -->
      <tr>
        <td class="hero-header">
          <div class="brand-badge">Lebanese University • ULFS2</div>
          <h1 class="hero-title">Official Class Group Invitation</h1>
          <p class="hero-subtitle">${escapeHtml(targetGroupTitle)}</p>
        </td>
      </tr>

      <!-- BODY CONTENT -->
      <tr>
        <td class="content-body">
          <div class="greeting">Hello ${escapeHtml(fullName)},</div>
          <p class="welcome-text">
            Welcome to the academic term! To make sure you never miss critical lecture schedules, classroom assignments, exam announcements, and course resources, please join your official student cohort group.
          </p>

          <!-- ACADEMIC PROFILE SUMMARY -->
          <div class="academic-card">
            <span class="academic-header">Student Enrollment Track</span>
            <table role="presentation" class="info-table" cellpadding="0" cellspacing="0">
              <tr>
                <td class="info-label">Major</td>
                <td class="info-value">${escapeHtml(major)}</td>
              </tr>
              <tr>
                <td class="info-label">Academic Section</td>
                <td class="info-value">${escapeHtml(section)}</td>
              </tr>
              <tr>
                <td class="info-label">Assigned Group</td>
                <td class="info-value"><span style="color:#ea580c;">${escapeHtml(assignedGroup)}</span></td>
              </tr>
              <tr>
                <td class="info-label">Campus</td>
                <td class="info-value">${escapeHtml(campus)}</td>
              </tr>
              <tr>
                <td class="info-label">Language Track</td>
                <td class="info-value">${escapeHtml(language)}</td>
              </tr>
              <tr>
                <td class="info-label">Student Status</td>
                <td class="info-value">${escapeHtml(status)}</td>
              </tr>
            </table>
          </div>

          <!-- OPTIONAL CUSTOM NOTE -->
          ${customMessage ? `
          <div class="custom-note-box">
            <div class="custom-note-title">Note from Delegation</div>
            <div>${escapeHtml(customMessage)}</div>
          </div>
          ` : ''}

          <!-- PRIMARY CALL TO ACTION BUTTON -->
          <div class="cta-container">
            <!--[if mso]>
            <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${escapeHtml(effectiveJoinUrl)}" style="height:52px;v-text-anchor:middle;width:280px;" arcsize="24%" stroke="f" fillcolor="#ea580c">
              <w:anchorlock/>
              <center style="color:#ffffff;font-family:sans-serif;font-size:16px;font-weight:bold;">Join Class Group Now</center>
            </v:roundrect>
            <![endif]-->
            <!--[if !mso]><!-->
            <a href="${escapeHtml(effectiveJoinUrl)}" target="_blank" rel="noopener noreferrer" class="cta-btn">
              📲 Join Class Group Now
            </a>
            <!--<![endif]-->
            <span class="cta-hint">Direct link to WhatsApp / Community Group</span>
          </div>

          <!-- FALLBACK DIRECT LINK -->
          <div class="link-fallback">
            <strong>Having trouble with the button?</strong> Copy and paste this link into your browser:<br>
            <a href="${escapeHtml(effectiveJoinUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(effectiveJoinUrl)}</a>
          </div>

          <!-- IMPORTANT INSTRUCTIONS -->
          <div class="instructions-card">
            <div class="instructions-title">
              <span>📌</span> Important Instructions for Joining:
            </div>
            <ol class="instructions-list">
              <li>Set your messaging display name to your official university name (<strong>${escapeHtml(fullName)}</strong>) so group administrators can verify and accept your request.</li>
              <li>Official timetable changes, exam rooms, lecture notes, and syllabus materials are pinned in this group.</li>
              <li>Please keep discussions respectful and academic-focused.</li>
            </ol>
          </div>
        </td>
      </tr>

      <!-- FOOTER -->
      <tr>
        <td class="footer">
          <div class="footer-logo">Faculty of Sciences II — Fanar &amp; Amshit</div>
          <p style="margin: 0 0 10px;">
            Sent by ${escapeHtml(senderName)} via <strong style="color:#431407;">student-os.com</strong>
          </p>
          <div class="footer-links">
            <a href="https://student-os.com" target="_blank" rel="noopener noreferrer">student-os.com</a> •
            <a href="mailto:support@student-os.com">Contact Delegation</a>
          </div>
        </td>
      </tr>
    </table>
  </div>
</body>
</html>`;

  return { subject, html, text };
}

/**
 * Configure or obtain the nodemailer transporter
 */
let cachedTransporter = null;
let etherealAccount = null;

const baseDirectory = typeof __dirname !== 'undefined'
  ? __dirname
  : (typeof process !== 'undefined' && typeof process.cwd === 'function' ? process.cwd() : null);

const CONFIG_FILE = baseDirectory ? path.join(baseDirectory, 'email_settings.json') : null;
let inMemorySettings = null;

function loadSavedSettings() {
  if (inMemorySettings) return inMemorySettings;
  try {
    if (CONFIG_FILE && fs && typeof fs.existsSync === 'function' && fs.existsSync(CONFIG_FILE)) {
      const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
      const data = JSON.parse(raw);
      if (data && typeof data === 'object') {
        let pass = data.smtpPass || '';
        if (pass && cryptoHelpers && typeof cryptoHelpers.decryptValue === 'function') {
          try {
            pass = cryptoHelpers.decryptValue(pass, 'email_settings.smtp_pass');
          } catch {}
        }
        inMemorySettings = { ...data, smtpPass: pass };
        return inMemorySettings;
      }
    }
  } catch (err) {
    console.warn('Could not read email_settings.json:', err.message);
  }
  return inMemorySettings;
}

function getSmtpConfig() {
  const saved = loadSavedSettings() || {};
  const host = saved.smtpHost !== undefined ? saved.smtpHost : (process.env.SMTP_HOST || '');
  const port = saved.smtpPort ? parseInt(saved.smtpPort, 10) : parseInt(process.env.SMTP_PORT || '465', 10);
  const user = saved.smtpUser !== undefined ? saved.smtpUser : (process.env.SMTP_USER || process.env.SMTP_USERNAME || '');
  const pass = saved.smtpPass !== undefined ? saved.smtpPass : (process.env.SMTP_PASS || process.env.SMTP_PASSWORD || '');
  const isPort465 = port === 465;
  const secure = isPort465 ? true : (saved.smtpSecure !== undefined ? Boolean(saved.smtpSecure) : (process.env.SMTP_SECURE === 'true'));
  const from = saved.emailFrom || process.env.EMAIL_FROM || process.env.SMTP_FROM || 'ULFS2 Student Affairs <noreply@student-os.com>';

  const isConfigured = Boolean(host && user);
  return { host, port, user, pass, secure, from, isConfigured };
}

function saveEmailSettings(settings) {
  const current = loadSavedSettings() || {};
  let passwordToStore = settings.smtpPass !== undefined && settings.smtpPass !== ''
    ? settings.smtpPass
    : (current.smtpPass || process.env.SMTP_PASS || '');

  // Update process.env runtime
  if (settings.smtpHost !== undefined) process.env.SMTP_HOST = settings.smtpHost;
  if (settings.smtpPort !== undefined) process.env.SMTP_PORT = String(settings.smtpPort);
  if (settings.smtpSecure !== undefined) process.env.SMTP_SECURE = String(Boolean(settings.smtpSecure));
  if (settings.smtpUser !== undefined) process.env.SMTP_USER = settings.smtpUser;
  if (passwordToStore) process.env.SMTP_PASS = passwordToStore;
  if (settings.emailFrom !== undefined) process.env.EMAIL_FROM = settings.emailFrom;

  // Invalidate transporter cache
  cachedTransporter = null;

  // Encrypt password if possible
  let storedPass = passwordToStore;
  if (storedPass && cryptoHelpers && typeof cryptoHelpers.encryptValue === 'function') {
    try {
      storedPass = cryptoHelpers.encryptValue(storedPass, 'email_settings.smtp_pass');
    } catch {}
  }

  const payload = {
    smtpHost: settings.smtpHost !== undefined ? settings.smtpHost : (current.smtpHost || process.env.SMTP_HOST || ''),
    smtpPort: settings.smtpPort !== undefined ? Number(settings.smtpPort) : (current.smtpPort || Number(process.env.SMTP_PORT || '465')),
    smtpSecure: settings.smtpSecure !== undefined ? Boolean(settings.smtpSecure) : (current.smtpSecure !== undefined ? current.smtpSecure : (process.env.SMTP_SECURE === 'true')),
    smtpUser: settings.smtpUser !== undefined ? settings.smtpUser : (current.smtpUser || process.env.SMTP_USER || ''),
    smtpPass: storedPass || '',
    emailFrom: settings.emailFrom !== undefined ? settings.emailFrom : (current.emailFrom || process.env.EMAIL_FROM || 'ULFS2 Student Affairs <noreply@student-os.com>'),
    groupLinks: settings.groupLinks !== undefined ? settings.groupLinks : (current.groupLinks || {
      general: '',
      'Grp A': '',
      'Grp B': '',
      'Grp C,D': '',
      'Grp E1': '',
      'Grp E2': ''
    }),
    defaultCustomNote: settings.defaultCustomNote !== undefined ? settings.defaultCustomNote : (current.defaultCustomNote || '')
  };

  inMemorySettings = payload;

  if (CONFIG_FILE && fs && typeof fs.writeFileSync === 'function') {
    try {
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(payload, null, 2), 'utf8');
    } catch (err) {
      console.warn('Could not write email_settings.json:', err.message);
    }
  }

  // Also sync to .env file if it exists (not in test mode)
  const envPath = baseDirectory ? path.join(baseDirectory, '.env') : null;
  if (envPath && process.env.NODE_ENV !== 'test' && fs && typeof fs.existsSync === 'function' && fs.existsSync(envPath)) {
    try {
      let content = fs.readFileSync(envPath, 'utf8');
      const envUpdates = {
        SMTP_HOST: payload.smtpHost,
        SMTP_PORT: payload.smtpPort,
        SMTP_SECURE: payload.smtpSecure,
        SMTP_USER: payload.smtpUser,
        SMTP_PASS: passwordToStore || '',
        EMAIL_FROM: payload.emailFrom
      };
      for (const [key, val] of Object.entries(envUpdates)) {
        if (val === undefined || val === null) continue;
        const regex = new RegExp(`^${key}=.*$`, 'm');
        const formatted = String(val).includes(' ') ? `"${val}"` : val;
        if (regex.test(content)) {
          content = content.replace(regex, `${key}=${formatted}`);
        } else {
          content = `${content.trim()}\n${key}=${formatted}\n`;
        }
      }
      fs.writeFileSync(envPath, content, 'utf8');
    } catch (e) {
      console.warn('Could not sync .env:', e.message);
    }
  }

  return getEffectiveSettings();
}

function getEffectiveSettings() {
  const saved = loadSavedSettings() || {};
  const host = saved.smtpHost !== undefined ? saved.smtpHost : (process.env.SMTP_HOST || '');
  const port = saved.smtpPort ? parseInt(saved.smtpPort, 10) : parseInt(process.env.SMTP_PORT || '465', 10);
  const secure = saved.smtpSecure !== undefined ? saved.smtpSecure : (process.env.SMTP_SECURE === 'true' || port === 465);
  const user = saved.smtpUser !== undefined ? saved.smtpUser : (process.env.SMTP_USER || process.env.SMTP_USERNAME || '');
  const pass = saved.smtpPass !== undefined ? saved.smtpPass : (process.env.SMTP_PASS || process.env.SMTP_PASSWORD || '');
  const from = saved.emailFrom || process.env.EMAIL_FROM || 'ULFS2 Student Affairs <noreply@student-os.com>';

  const groupLinks = saved.groupLinks || {
    general: '',
    'Grp A': '',
    'Grp B': '',
    'Grp C,D': '',
    'Grp E1': '',
    'Grp E2': ''
  };

  const defaultCustomNote = saved.defaultCustomNote || '';

  return {
    smtpHost: host,
    smtpPort: port,
    smtpSecure: secure,
    smtpUser: user,
    smtpPass: '', // never return raw password to client
    smtpPassSet: Boolean(pass),
    emailFrom: from,
    configured: Boolean(host && user),
    groupLinks,
    defaultCustomNote
  };
}

async function getTransporter(overrideConfig = null) {
  const baseConfig = getSmtpConfig();
  const config = overrideConfig ? {
    host: overrideConfig.host || baseConfig.host,
    port: overrideConfig.port ? parseInt(overrideConfig.port, 10) : baseConfig.port,
    user: overrideConfig.user || baseConfig.user,
    pass: overrideConfig.pass || baseConfig.pass,
    secure: (overrideConfig.secure !== undefined ? Boolean(overrideConfig.secure) : (overrideConfig.port === 465 || baseConfig.secure)),
    from: overrideConfig.from || baseConfig.from,
    isConfigured: Boolean((overrideConfig.host || baseConfig.host) && (overrideConfig.user || baseConfig.user))
  } : baseConfig;

  // Hermetic mock transporter for automated test runner
  if (process.env.NODE_ENV === 'test') {
    const mockTransporter = {
      sendMail: async (mailOptions) => ({
        messageId: `test-${Date.now()}@student-os.local`,
        response: '250 Mock email accepted',
        envelope: { from: mailOptions.from, to: [mailOptions.to] }
      }),
      _isMock: true
    };
    return { transporter: mockTransporter, config, isReal: false, isMock: true };
  }

  if (config.isConfigured) {
    const portNum = Number(config.port) || 465;
    const isDirectTls = portNum === 465 || Boolean(config.secure);

    const transportOpts = {
      host: config.host,
      port: portNum,
      secure: isDirectTls,
      auth: {
        user: config.user,
        pass: config.pass
      },
      tls: {
        rejectUnauthorized: false
      }
    };

    if (overrideConfig) {
      const customTransporter = nodemailer.createTransport(transportOpts);
      return { transporter: customTransporter, config, isReal: true };
    }

    if (!cachedTransporter || cachedTransporter._configHost !== config.host || cachedTransporter._configUser !== config.user || cachedTransporter._configPort !== portNum || cachedTransporter._configSecure !== isDirectTls) {
      cachedTransporter = nodemailer.createTransport(transportOpts);
      cachedTransporter._configHost = config.host;
      cachedTransporter._configUser = config.user;
      cachedTransporter._configPort = portNum;
      cachedTransporter._configSecure = isDirectTls;
      cachedTransporter._isRealSmtp = true;
    }
    return { transporter: cachedTransporter, config, isReal: true };
  }

  try {
    if (!etherealAccount) {
      etherealAccount = await nodemailer.createTestAccount();
    }
    const testTransporter = nodemailer.createTransport({
      host: etherealAccount.smtp.host,
      port: etherealAccount.smtp.port,
      secure: etherealAccount.smtp.secure,
      auth: {
        user: etherealAccount.user,
        pass: etherealAccount.pass
      }
    });
    return { transporter: testTransporter, config, isReal: false, isEthereal: true, etherealAccount };
  } catch (err) {
    // If network fails to reach Ethereal, use a graceful simulated sender
    const simulatedTransporter = {
      sendMail: async (mailOptions) => ({
        messageId: `simulated-${Date.now()}@student-os.local`,
        response: '250 Simulated local delivery (SMTP not configured in .env)',
        envelope: { from: mailOptions.from, to: [mailOptions.to] }
      }),
      _isSimulated: true
    };
    return { transporter: simulatedTransporter, config, isReal: false, isSimulated: true };
  }
}

/**
 * Send an invitation email to a single student
 */
async function sendInviteEmail({
  to,
  student,
  groupName,
  joinUrl,
  customMessage,
  senderName
}) {
  if (!to) {
    throw new Error('Recipient email address is required');
  }

  const { subject, html, text } = renderEmailTemplate({
    student,
    groupName,
    joinUrl,
    customMessage,
    senderName
  });

  const { transporter, config, isReal, isEthereal, isSimulated, isMock } = await getTransporter();

  const mailOptions = {
    from: config.from,
    to,
    subject,
    text,
    html
  };

  const info = await transporter.sendMail(mailOptions);
  let previewUrl = null;

  if (isEthereal && nodemailer.getTestMessageUrl) {
    previewUrl = nodemailer.getTestMessageUrl(info);
  }

  return {
    success: true,
    messageId: info.messageId,
    recipient: to,
    subject,
    previewUrl,
    isRealSmtp: Boolean(isReal),
    isSimulated: Boolean(isSimulated || isMock),
    note: isReal ? 'Sent via configured SMTP' : (previewUrl ? `Sent to Ethereal test inbox: ${previewUrl}` : 'Simulated (configure SMTP in .env for production delivery)')
  };
}

/**
 * Send a test email to verify SMTP configuration
 */
async function sendTestEmail({ to, senderName = 'ULFS2 Administrator', overrideConfig = null }) {
  if (!to || !to.includes('@')) {
    throw new Error('Please enter a valid recipient email address for testing.');
  }

  const sampleStudent = {
    firstName: 'Test',
    fatherName: 'Delivery',
    familyName: 'Recipient',
    major: 'Informatics',
    section: 'mispce',
    assignedGroup: 'Grp A',
    campus: 'Fanar',
    language: 'French',
    status: 'New',
    email: to
  };

  const { subject, html, text } = renderEmailTemplate({
    student: sampleStudent,
    groupName: 'ULFS2 Test Class Group',
    joinUrl: 'https://chat.whatsapp.com/TEST_CONNECTION',
    customMessage: 'This is an official verification email confirming that your SMTP server settings are correctly configured on student-os.com.',
    senderName
  });

  const { transporter, config, isReal, isEthereal, isSimulated, isMock } = await getTransporter(overrideConfig);

  const mailOptions = {
    from: config.from,
    to,
    subject: `[TEST] ${subject}`,
    text,
    html
  };

  const info = await transporter.sendMail(mailOptions);
  let previewUrl = null;
  if (isEthereal && nodemailer.getTestMessageUrl) {
    previewUrl = nodemailer.getTestMessageUrl(info);
  }

  return {
    success: true,
    messageId: info.messageId,
    recipient: to,
    previewUrl,
    isRealSmtp: Boolean(isReal),
    isSimulated: Boolean(isSimulated || isMock),
    note: isReal ? 'Test email dispatched successfully via configured SMTP server.' : 'Test email processed in test mode.'
  };
}

/**
 * Public status check for the email subsystem
 */
function getMailerStatus() {
  const config = getSmtpConfig();
  return {
    configured: config.isConfigured,
    host: config.host || null,
    port: config.port,
    secure: config.secure,
    from: config.from,
    testMode: !config.isConfigured
  };
}

module.exports = {
  renderEmailTemplate,
  sendInviteEmail,
  sendTestEmail,
  getMailerStatus,
  getSmtpConfig,
  saveEmailSettings,
  getEffectiveSettings,
  escapeHtml
};
