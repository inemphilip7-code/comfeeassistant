import app from './app';
import { env } from './config/env';
import { prisma } from './db';
import { execSync } from 'child_process';
import bcrypt from 'bcrypt';
import { UserRole } from '@prisma/client';

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Process] Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[Process] Uncaught Exception:', err);
});

const PORT = env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

async function seedInitialClinician(): Promise<void> {
  const email = process.env.SEED_CLINICIAN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_CLINICIAN_PASSWORD?.trim();
  const fullName = process.env.SEED_CLINICIAN_NAME?.trim() || 'Clinician';
  const organisationName = process.env.SEED_ORGANISATION_NAME?.trim() || 'Vabatim Clinical Service';
  const organisationCode = process.env.SEED_ORGANISATION_CODE?.trim() || 'VABATIM-CLINIC';

  if (!email || !password || password.length < 12) {
    return;
  }

  try {
    const organisation = await prisma.organisation.upsert({
      where: { code: organisationCode },
      update: {},
      create: { name: organisationName, code: organisationCode }
    });

    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.upsert({
      where: { email },
      update: { passwordHash, fullName, role: UserRole.CLINICIAN },
      create: {
        email,
        passwordHash,
        fullName,
        role: UserRole.CLINICIAN,
        organisationId: organisation.id
      }
    });

    console.log(`[Database setup] Seed clinician account ready: ${email}`);
  } catch (error: any) {
    console.warn('[Database setup] Could not seed clinician account:', error?.message ?? error);
  }
}

async function ensureSchemaTables(): Promise<void> {
  try {
    console.log('[Database setup] Ensuring required tables and columns exist...');

    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        CREATE TYPE "ProcessingJobState" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Meeting" ADD COLUMN IF NOT EXISTS "frozenTranscript" TEXT;
      ALTER TABLE "Meeting" ADD COLUMN IF NOT EXISTS "frozenAt" TIMESTAMP(3);
      ALTER TABLE "Meeting" ADD COLUMN IF NOT EXISTS "templateType" TEXT DEFAULT 'INITIAL_ASSESSMENT';
      ALTER TABLE "Meeting" ADD COLUMN IF NOT EXISTS "sessionFormat" TEXT DEFAULT 'FACE_TO_FACE';
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ProcessingJob" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "meetingId" TEXT NOT NULL,
        "organisationId" TEXT NOT NULL,
        "state" "ProcessingJobState" NOT NULL DEFAULT 'PENDING',
        "stage" TEXT NOT NULL DEFAULT 'Queued',
        "progress" INTEGER NOT NULL DEFAULT 0,
        "attempts" INTEGER NOT NULL DEFAULT 0,
        "lastError" TEXT,
        "clinicalNoteId" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "startedAt" TIMESTAMP(3),
        "finishedAt" TIMESTAMP(3),
        CONSTRAINT "ProcessingJob_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE RESTRICT ON UPDATE CASCADE
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "ProcessingJob_meetingId_idx" ON "ProcessingJob"("meetingId");
    `);

    console.log('[Database setup] Schema check and migration complete.');
  } catch (error: any) {
    console.warn('[Database setup] Schema check non-fatal error:', error?.message ?? error);
  }
}

async function initializeDatabaseBeforeServing(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return;

  await ensureSchemaTables();

  if (env.AUTO_DB_SYNC === 'true') {
    let directUrl = process.env.DIRECT_URL || databaseUrl;
    if (directUrl.includes(':6543')) {
      directUrl = directUrl.replace(':6543', ':5432').replace('?pgbouncer=true', '').replace('&pgbouncer=true', '');
    }
    if (directUrl.startsWith('postgres') && !directUrl.includes('sslmode=')) {
      directUrl += (directUrl.includes('?') ? '&' : '?') + 'sslmode=require';
    }

    const databaseEnvironment = {
      ...process.env,
      DIRECT_URL: directUrl,
      DATABASE_URL: directUrl
    };

    console.log('[Database setup] Synchronising schema before accepting requests...');
    try {
      execSync('npx prisma db push --skip-generate --accept-data-loss', {
        stdio: 'inherit',
        env: databaseEnvironment
      });
      console.log('[Database setup] Schema synchronization complete.');
    } catch (err: any) {
      console.warn('[Database setup] Schema synchronization warning:', err?.message ?? err);
    }
  }

  await seedInitialClinician();
}

async function startServer() {
  try {
    await initializeDatabaseBeforeServing();
  } catch (err: any) {
    console.warn('[Database setup] Initialization non-fatal warning:', err?.message ?? err);
  }

  app.listen(PORT, HOST, () => {
    console.log('=======================================================');
    console.log(` Vabatim Backend API running on http://${HOST}:${PORT}`);
    console.log(` Environment: ${env.NODE_ENV}`);
    console.log(` Speech Provider: ${env.SPEECH_PROVIDER}`);
    console.log(` Storage Provider: ${env.STORAGE_PROVIDER}`);
    console.log('=======================================================');
  });
}

void startServer();
