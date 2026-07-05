const app = require('./app');
const env = require('./config/env');
const { connectDb } = require('./config/db');
const { startCleanupScheduler } = require('./jobs/cleanupScheduler');

async function bootstrap() {
  await connectDb();
  startCleanupScheduler();

  const server = app.listen(env.port, () => {
    console.log(`ToolNest listening on port ${env.port}`);
  });

  server.timeout = 10 * 60 * 1000; // 10 minutes
  server.keepAliveTimeout = 10 * 60 * 1000;
  server.headersTimeout = 10 * 60 * 1000 + 5000;
}

bootstrap().catch((error) => {
  console.error('Failed to bootstrap ToolNest', error.message);
  process.exitCode = 1;
});
