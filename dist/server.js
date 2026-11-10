"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = __importDefault(require("./app"));
const env_1 = require("./config/env");
const db_1 = require("./db");
const child_process_1 = require("child_process");
const bcrypt_1 = __importDefault(require("bcrypt"));
const client_1 = require("@prisma/client");
process.on('unhandledRejection', (reason, promise) => {
    console.error('[Process] Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (err) => {
    console.error('[Process] Uncaught Exception:', err);
});
const PORT = env_1.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
async function seedInitialClinician() {
    const email = process.env.SEED_CLINICIAN_EMAIL?.trim().toLowerCase();
    const password = process.env.SEED_CLINICIAN_PASSWORD?.trim();
    const fullName = process.env.SEED_CLINICIAN_NAME?.trim() || 'Clinician';
    const organisationName = process.env.SEED_ORGANISATION_NAME?.trim() || 'Vabatim Clinical Service';
    const organisationCode = process.env.SEED_ORGANISATION_CODE?.trim() || 'VABATIM-CLINIC';
    if (!email || !password || password.length < 12) {
        return;
    }
    try {
        const organisation = await db_1.prisma.organisation.upsert({
            where: { code: organisationCode },
            update: {},
            create: { name: organisationName, code: organisationCode }
        });
        const passwordHash = await bcrypt_1.default.hash(password, 12);
        await db_1.prisma.user.upsert({
            where: { email },
            update: { passwordHash, fullName, role: client_1.UserRole.CLINICIAN },
            create: {
                email,
                passwordHash,
                fullName,
                role: client_1.UserRole.CLINICIAN,
                organisationId: organisation.id
            }
        });
        console.log(`[Database setup] Seed clinician account ready: ${email}`);
    }
    catch (error) {
        console.warn('[Database setup] Could not seed clinician account:', error?.message ?? error);
    }
}
async function ensureSchemaTables() {
    try {
        console.log('[Database setup] Ensuring required tables and columns exist...');
        await db_1.prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        CREATE TYPE "ProcessingJobState" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
        await db_1.prisma.$executeRawUnsafe(`
      ALTER TABLE "Meeting" ADD COLUMN IF NOT EXISTS "frozenTranscript" TEXT;
      ALTER TABLE "Meeting" ADD COLUMN IF NOT EXISTS "frozenAt" TIMESTAMP(3);
      ALTER TABLE "Meeting" ADD COLUMN IF NOT EXISTS "templateType" TEXT DEFAULT 'INITIAL_ASSESSMENT';
      ALTER TABLE "Meeting" ADD COLUMN IF NOT EXISTS "sessionFormat" TEXT DEFAULT 'FACE_TO_FACE';
    `);
        await db_1.prisma.$executeRawUnsafe(`
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
        await db_1.prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "ProcessingJob_meetingId_idx" ON "ProcessingJob"("meetingId");
    `);
        console.log('[Database setup] Schema check and migration complete.');
    }
    catch (error) {
        console.warn('[Database setup] Schema check non-fatal error:', error?.message ?? error);
    }
}
async function initializeDatabaseBeforeServing() {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl)
        return;
    await ensureSchemaTables();
    if (env_1.env.AUTO_DB_SYNC === 'true') {
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
            (0, child_process_1.execSync)('npx prisma db push --skip-generate --accept-data-loss', {
                stdio: 'inherit',
                env: databaseEnvironment
            });
            console.log('[Database setup] Schema synchronization complete.');
        }
        catch (err) {
            console.warn('[Database setup] Schema synchronization warning:', err?.message ?? err);
        }
    }
    await seedInitialClinician();
}
async function startServer() {
    try {
        await initializeDatabaseBeforeServing();
    }
    catch (err) {
        console.warn('[Database setup] Initialization non-fatal warning:', err?.message ?? err);
    }
    app_1.default.listen(PORT, HOST, () => {
        console.log('=======================================================');
        console.log(` Vabatim Backend API running on http://${HOST}:${PORT}`);
        console.log(` Environment: ${env_1.env.NODE_ENV}`);
        console.log(` Speech Provider: ${env_1.env.SPEECH_PROVIDER}`);
        console.log(` Storage Provider: ${env_1.env.STORAGE_PROVIDER}`);
        console.log('=======================================================');
    });
}
void startServer();
