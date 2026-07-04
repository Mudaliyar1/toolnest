const cron = require('node-cron');
const { removeExpiredFilesAndWorkspaces } = require('../services/cleanupService');

function startCleanupScheduler() {
  cron.schedule('* * * * *', async () => {
    try {
      await removeExpiredFilesAndWorkspaces();
    } catch (error) {
      console.error('Workspace cleanup failed', error.message);
    }
  });
}

module.exports = {
  startCleanupScheduler
};
