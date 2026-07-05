const crypto = require('crypto');
const Admin = require('../models/Admin');
const env = require('../config/env');
const { sign, verifySignedValue } = require('../utils/cookies');

const ADMIN_COOKIE = 'tn_admin';
const ADMIN_EMAIL = env.adminEmail || 'admin@toolnest.local';
const PASSWORD_ITERATIONS = 120000;

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const derived = crypto.pbkdf2Sync(String(password), salt, PASSWORD_ITERATIONS, 64, 'sha512').toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password, storedHash) {
  const [salt, hash] = String(storedHash).split(':');
  if (!salt || !hash) {
    return false;
  }

  const derived = crypto.pbkdf2Sync(String(password), salt, PASSWORD_ITERATIONS, 64, 'sha512').toString('hex');
  const left = Buffer.from(hash, 'hex');
  const right = Buffer.from(derived, 'hex');

  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

async function ensureDefaultAdmin() {
  const existing = await Admin.findOne({ email: ADMIN_EMAIL }).lean();
  if (existing) {
    return existing;
  }

  if (!env.adminPassword || env.adminPassword === 'change-me') {
    return null;
  }

  const passwordHash = hashPassword(env.adminPassword);
  return Admin.create({
    email: ADMIN_EMAIL,
    passwordHash,
    role: 'superadmin',
    permissions: ['dashboard:read', 'analytics:read', 'files:read', 'files:delete', 'settings:write', 'security:read']
  });
}

async function authenticateAdmin(email, password) {
  await ensureDefaultAdmin();

  const freshAdmin = await Admin.findOne({ email: String(email).toLowerCase().trim() });
  if (!freshAdmin) {
    return null;
  }

  if (verifyPassword(password, freshAdmin.passwordHash)) {
    return freshAdmin;
  }

  return null;
}

function createAdminSession(admin) {
  const payload = JSON.stringify({
    email: admin.email,
    role: admin.role,
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString()
  });

  return sign(payload, env.sessionSecret);
}

function verifyAdminSession(sessionValue) {
  const payload = verifySignedValue(sessionValue, env.sessionSecret);
  if (!payload) {
    return null;
  }

  try {
    const session = JSON.parse(payload);
    if (!session.expiresAt || new Date(session.expiresAt) < new Date()) {
      return null;
    }

    return session;
  } catch (error) {
    return null;
  }
}

function setAdminCookie(res, admin) {
  const session = createAdminSession(admin);
  res.cookie(ADMIN_COOKIE, session, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.env === 'production',
    path: '/',
    maxAge: 12 * 60 * 60 * 1000
  });
}

module.exports = {
  ADMIN_COOKIE,
  ADMIN_EMAIL,
  authenticateAdmin,
  createAdminSession,
  ensureDefaultAdmin,
  hashPassword,
  setAdminCookie,
  verifyAdminSession,
  verifyPassword
};
