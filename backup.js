const { createClient } = require('@supabase/supabase-js');
const { encryptValue, decryptValue } = require('./crypto');

const REDIRECT_URI = 'https://student-os.com/api/google-drive/callback';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

const client = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

async function getSettings() {
  const { data, error } = await client().from('backup_settings').select('*').eq('id', 1).maybeSingle();
  if (error) throw error;
  return data;
}

async function getAccessToken(refreshToken) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, refresh_token: refreshToken, grant_type: 'refresh_token' })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error_description || 'Could not refresh Google access');
  return data.access_token;
}

async function driveRequest(url, accessToken, options = {}) {
  const response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${accessToken}`, ...(options.headers || {}) } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || 'Google Drive request failed');
  return data;
}

async function createFolder(accessToken) {
  return driveRequest('https://www.googleapis.com/drive/v3/files', accessToken, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'student-os-backups', mimeType: 'application/vnd.google-apps.folder' }) });
}

async function uploadBackup(accessToken, folderId, backup) {
  const boundary = `student_os_${crypto.randomUUID()}`;
  const name = `student-os-backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, parents: [folderId] })}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(backup)}\r\n--${boundary}--`;
  return driveRequest('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,createdTime', accessToken, { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body });
}

async function cleanupOldBackups(accessToken, folderId, retentionDays) {
  const cutoff = new Date(Date.now() - retentionDays * 86400000).toISOString();
  const query = encodeURIComponent(`'${folderId}' in parents and trashed = false and createdTime < '${cutoff}'`);
  const list = await driveRequest(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)`, accessToken);
  await Promise.all((list.files || []).map(file => fetch(`https://www.googleapis.com/drive/v3/files/${file.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } })));
}

async function runGoogleDriveBackup() {
  const settings = await getSettings();
  if (!settings?.enabled || !settings.refresh_token) throw new Error('Google Drive backup is not connected');
  const refreshToken = decryptValue(settings.refresh_token, 'backup_settings.refresh_token');
  const accessToken = await getAccessToken(refreshToken);
  const supabase = client();
  const [{ data: students, error: studentsError }, { data: users, error: usersError }] = await Promise.all([supabase.from('students').select('*'), supabase.from('users').select('*')]);
  if (studentsError) throw studentsError;
  if (usersError) throw usersError;
  const file = await uploadBackup(accessToken, settings.folder_id, { version: 1, createdAt: new Date().toISOString(), encrypted: true, tables: { students, users } });
  await cleanupOldBackups(accessToken, settings.folder_id, settings.retention_days || 30);
  await supabase.from('backup_settings').update({ last_backup_at: new Date().toISOString(), last_backup_name: file.name, last_error: null }).eq('id', 1);
  return file;
}

async function exchangeGoogleCode(code) {
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, redirect_uri: REDIRECT_URI, grant_type: 'authorization_code' }) });
  const tokens = await response.json();
  if (!response.ok || !tokens.refresh_token) throw new Error(tokens.error_description || 'Google did not return offline access. Revoke access and connect again.');
  const folder = await createFolder(tokens.access_token);
  const { error } = await client().from('backup_settings').upsert({ id: 1, refresh_token: encryptValue(tokens.refresh_token, 'backup_settings.refresh_token'), folder_id: folder.id, enabled: true, retention_days: 30, connected_at: new Date().toISOString(), last_error: null });
  if (error) throw error;
}

function googleAuthorizationUrl(state) {
  return `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: REDIRECT_URI, response_type: 'code', scope: DRIVE_SCOPE, access_type: 'offline', prompt: 'consent', state })}`;
}

module.exports = { getSettings, runGoogleDriveBackup, exchangeGoogleCode, googleAuthorizationUrl };
