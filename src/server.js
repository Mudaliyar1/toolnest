const app = require('./app');
const env = require('./config/env');
const { connectDb } = require('./config/db');
const { startCleanupScheduler } = require('./jobs/cleanupScheduler');

async function bootstrap() {
  await connectDb();
  startCleanupScheduler();

  app.listen(env.port, () => {
    console.log(`ToolNest listening on port ${env.port}`);
  });
}

bootstrap().catch((error) => {
  console.error('Failed to bootstrap ToolNest', error.message);
  process.exitCode = 1;
});
