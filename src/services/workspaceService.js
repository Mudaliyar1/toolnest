const crypto = require('crypto');
const Workspace = require('../models/Workspace');
const File = require('../models/File');
const env = require('../config/env');
const { decrypt, encrypt, sign, verifySignedValue } = require('../utils/cookies');

const WORKSPACE_COOKIE = 'tn_ws';
const SESSION_COOKIE = 'tn_sess';
const SECURE_COOKIE = 'tn_secure';

function createToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function createWorkspacePayload(workspaceId, token, issuedAt) {
  return JSON.stringify({ workspaceId, token, issuedAt });
}

function createCookieBundle(workspaceId, token) {
  const issuedAt = new Date().toISOString();
  const signedWorkspace = sign(workspaceId, env.cookieSecret);
  const signedSession = sign(token, env.sessionSecret);
  const securePayload = encrypt(createWorkspacePayload(workspaceId, token, issuedAt), env.cookieEncryptionKey);

  return {
    signedWorkspace,
    signedSession,
    securePayload
  };
}

async function persistWorkspaceCookies(res, workspaceId, token) {
  const bundle = createCookieBundle(workspaceId, token);
  const baseOptions = {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.env === 'production',
    path: '/',
    maxAge: env.workspaceTtlMinutes * 60 * 1000
  };

  res.cookie(WORKSPACE_COOKIE, bundle.signedWorkspace, baseOptions);
  res.cookie(SESSION_COOKIE, bundle.signedSession, baseOptions);
  res.cookie(SECURE_COOKIE, bundle.securePayload, baseOptions);
}

async function createWorkspaceDocument() {
  const workspaceId = `ws_${crypto.randomUUID()}`;
  const token = createToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + env.workspaceTtlMinutes * 60 * 1000);

  const workspace = await Workspace.create({
    workspaceId,
    tokenHash: hashToken(token),
    createdAt: now,
    expiresAt,
    lastActivity: now
  });

  return { workspace, token };
}

async function resolveWorkspaceFromCookies(req) {
  const signedWorkspace = req.signedCookies[WORKSPACE_COOKIE];
  const signedSession = req.signedCookies[SESSION_COOKIE];
  const secureCookie = req.cookies[SECURE_COOKIE];

  if (!signedWorkspace || !signedSession || !secureCookie) {
    return null;
  }

  const workspaceId = verifySignedValue(signedWorkspace, env.cookieSecret);
  const token = verifySignedValue(signedSession, env.sessionSecret);

  if (!workspaceId || !token) {
    return null;
  }

  try {
    const payload = JSON.parse(decrypt(secureCookie, env.cookieEncryptionKey));
    if (payload.workspaceId !== workspaceId || payload.token !== token) {
      return null;
    }
  } catch (error) {
    return null;
  }

  const workspace = await Workspace.findOne({ workspaceId, tokenHash: hashToken(token) }).lean();
  if (!workspace || workspace.expiresAt <= new Date()) {
    return null;
  }

  return { workspace, token };
}

async function ensureWorkspaceContext(req, res, next) {
  try {
    const existing = await resolveWorkspaceFromCookies(req);
    let workspaceData = existing;

    if (!workspaceData) {
      const created = await createWorkspaceDocument();
      await persistWorkspaceCookies(res, created.workspace.workspaceId, created.token);
      req.workspaceCreated = true;
      workspaceData = {
        workspace: created.workspace.toObject(),
        token: created.token
      };
    } else {
      await Workspace.updateOne(
        { workspaceId: workspaceData.workspace.workspaceId },
        { $set: { lastActivity: new Date() } }
      );
      await persistWorkspaceCookies(res, workspaceData.workspace.workspaceId, workspaceData.token);
      req.workspaceCreated = false;
    }

    const remainingMinutes = Math.max(
      0,
      Math.ceil((new Date(workspaceData.workspace.expiresAt).getTime() - Date.now()) / 60000)
    );

    req.workspace = {
      workspaceId: workspaceData.workspace.workspaceId,
      expiresAt: workspaceData.workspace.expiresAt,
      lastActivity: workspaceData.workspace.lastActivity,
      remainingMinutes
    };

    req.workspaceToken = workspaceData.token;
    req.workspaceFiles = await File.find({ workspaceId: req.workspace.workspaceId })
      .sort({ uploadTime: -1 })
      .lean();

    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  SECURE_COOKIE,
  SESSION_COOKIE,
  WORKSPACE_COOKIE,
  ensureWorkspaceContext,
  createWorkspaceDocument,
  hashToken,
  persistWorkspaceCookies,
  resolveWorkspaceFromCookies
};
