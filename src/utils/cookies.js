const crypto = require('crypto');

function deriveKey(secret) {
  return crypto.createHash('sha256').update(String(secret)).digest();
}

function encrypt(value, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(key), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64url');
}

function decrypt(payload, key) {
  const raw = Buffer.from(payload, 'base64url');
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(key), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

function sign(value, secret) {
  const signature = crypto.createHmac('sha256', String(secret)).update(String(value)).digest('base64url');
  return `${value}.${signature}`;
}

function verifySignedValue(payload, secret) {
  const separatorIndex = String(payload).lastIndexOf('.');
  if (separatorIndex <= 0) {
    return null;
  }

  const value = payload.slice(0, separatorIndex);
  const signature = payload.slice(separatorIndex + 1);
  const expected = crypto.createHmac('sha256', String(secret)).update(value).digest('base64url');

  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (signatureBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null;
  }

  return value;
}

module.exports = {
  decrypt,
  encrypt,
  sign,
  verifySignedValue
};
