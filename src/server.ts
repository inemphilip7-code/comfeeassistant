import app from './app';
import { env } from './config/env';
import { execSync } from 'child_process';

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Process] Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[Process] Uncaught Exception:', err);
});

const PORT = env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

function initializeDatabaseBeforeServing(): void {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return;

  let directUrl = process.env.DIRECT_URL || databaseUrl;
  if (directUrl.includes(':6543')) {
    directUrl = directUrl.replace(':6543', ':5432').replace('?pgbouncer=true', '').replace('&pgbouncer=true', '');
  }

  const databaseEnvironment = {
    ...process.env,
    DIRECT_URL: directUrl,
    DATABASE_URL: directUrl
  };

  // The free Render demo blueprint has no separate migration command. Complete its explicitly
  // enabled schema sync before opening the port, rather than accepting requests while a
  // background sync races login and transcript processing.
  if (env.AUTO_DB_SYNC === 'true') {
    console.log('[Database setup] Synchronising schema before accepting requests...');
    execSync('npx prisma db push --skip-generate', {
      stdio: 'inherit',
      env: databaseEnvironment
    });
  }

  const seedVariableNames = [
    'SEED_CLINICIAN_EMAIL',
    'SEED_CLINICIAN_PASSWORD',
    'SEED_CLINICIAN_NAME'
  ];
  const hasSeedValues = seedVariableNames.some((name) => Boolean(process.env[name]?.trim()));
  if (hasSeedValues) {
    console.log('[Database setup] Creating the configured initial clinician account...');
    execSync('npx ts-node prisma/seed.ts', {
      stdio: 'inherit',
      env: databaseEnvironment
    });
  }
}

try {
  initializeDatabaseBeforeServing();
  app.listen(PORT, HOST, () => {
    console.log('=======================================================');
    console.log(` Vabatim Backend API running on http://${HOST}:${PORT}`);
    console.log(` Environment: ${env.NODE_ENV}`);
    console.log(` Speech Provider: ${env.SPEECH_PROVIDER}`);
    console.log(` Storage Provider: ${env.STORAGE_PROVIDER}`);
    console.log('=======================================================');
  });
} catch (error: any) {
  console.error('[Database setup] API startup stopped before serving requests:', error?.message ?? error);
  process.exit(1);
}
