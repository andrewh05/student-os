const crypto = require('crypto');

const ENCRYPTED_PREFIX = 'enc:v1:';
const PASSWORD_PREFIX = 'scrypt:v1:';

function getEncryptionKey() {
  const encoded = process.env.DATA_ENCRYPTION_KEY || '';
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32) {
    throw new Error('DATA_ENCRYPTION_KEY must be a base64-encoded 32-byte key');
  }
  return key;
}

function encryptValue(value, field = '') {
  if (value === null || value === undefined || value === '') return value ?? '';
  const plaintext = String(value);
  if (plaintext.startsWith(ENCRYPTED_PREFIX)) return plaintext;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  cipher.setAAD(Buffer.from(field));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENCRYPTED_PREFIX}${Buffer.concat([iv, tag, ciphertext]).toString('base64')}`;
}

function decryptValue(value, field = '') {
  if (value === null || value === undefined || value === '') return value ?? '';
  const encoded = String(value);
  if (!encoded.startsWith(ENCRYPTED_PREFIX)) return encoded;
  const payload = Buffer.from(encoded.slice(ENCRYPTED_PREFIX.length), 'base64');
  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const ciphertext = payload.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), iv);
  decipher.setAAD(Buffer.from(field));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

function hashPassword(password) {
  if (String(password).startsWith(PASSWORD_PREFIX)) return String(password);
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, 64);
  return `${PASSWORD_PREFIX}${salt.toString('base64')}:${hash.toString('base64')}`;
}

function verifyPassword(password, stored) {
  const encoded = String(stored || '');
  if (!encoded.startsWith(PASSWORD_PREFIX)) {
    const supplied = Buffer.from(String(password));
    const existing = Buffer.from(encoded);
    return supplied.length === existing.length && crypto.timingSafeEqual(supplied, existing);
  }
  const [, , salt64, hash64] = encoded.split(':');
  const expected = Buffer.from(hash64, 'base64');
  const actual = crypto.scryptSync(String(password), Buffer.from(salt64, 'base64'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

function signSession(user) {
  const payload = Buffer.from(JSON.stringify({ id: user.id, role: user.role, exp: Date.now() + 12 * 60 * 60 * 1000 })).toString('base64url');
  const signature = crypto.createHmac('sha256', getEncryptionKey()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function verifySession(token) {
  try {
    const [payload, signature] = String(token || '').split('.');
    const expected = crypto.createHmac('sha256', getEncryptionKey()).update(payload).digest('base64url');
    if (!signature || signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return session.exp > Date.now() ? session : null;
  } catch {
    return null;
  }
}

module.exports = { encryptValue, decryptValue, hashPassword, verifyPassword, signSession, verifySession };
