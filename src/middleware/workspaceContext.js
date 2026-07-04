const { ensureWorkspaceContext } = require('../services/workspaceService');

module.exports = function workspaceContext(req, res, next) {
  return ensureWorkspaceContext(req, res, next);
};
