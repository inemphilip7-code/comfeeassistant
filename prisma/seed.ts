import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

function requiredValue(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} must be set before creating the initial clinician account.`);
  return value;
}

async function seed() {
  const email = requiredValue('SEED_CLINICIAN_EMAIL').toLowerCase();
  const password = requiredValue('SEED_CLINICIAN_PASSWORD');
  const fullName = requiredValue('SEED_CLINICIAN_NAME');
  const organisationName = process.env.SEED_ORGANISATION_NAME?.trim() || 'Vabatim Clinical Service';
  const organisationCode = process.env.SEED_ORGANISATION_CODE?.trim() || 'VABATIM-CLINIC';

  if (!email.includes('@')) throw new Error('SEED_CLINICIAN_EMAIL must be a valid email address.');
  if (password.length < 12) throw new Error('SEED_CLINICIAN_PASSWORD must be at least 12 characters.');

  const organisation = await prisma.organisation.upsert({
    where: { code: organisationCode },
    update: {},
    create: { name: organisationName, code: organisationCode }
  });

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      passwordHash,
      fullName,
      role: UserRole.CLINICIAN,
      organisationId: organisation.id
    }
  });

  console.log('Initial clinician account is ready. No demo patient or meeting was created.');
}

seed()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Database seed failed:', message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
