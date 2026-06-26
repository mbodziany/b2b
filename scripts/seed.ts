import 'reflect-metadata';
import { randomBytes } from 'crypto';
import * as argon2 from 'argon2';
import { PrismaClient, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

function generateTemporaryPassword(): string {
  return `${randomBytes(9).toString('base64')}A1`;
}

async function main(): Promise<void> {
  const existingAdmin = await prisma.user.findFirst({ where: { role: UserRole.INTERNAL_ADMIN } });
  if (existingAdmin) {
    console.log(`Konto administratora już istnieje (${existingAdmin.email}) - pomijam tworzenie.`);
    return;
  }

  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com';
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await argon2.hash(temporaryPassword, { type: argon2.argon2id });

  const admin = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      fullName: 'Administrator',
      role: UserRole.INTERNAL_ADMIN,
      passwordHash,
      mustChangePassword: true,
    },
  });

  console.log('Utworzono pierwsze konto administratora:');
  console.log(`  e-mail:              ${admin.email}`);
  console.log(`  hasło tymczasowe:    ${temporaryPassword}`);
  console.log('Zaloguj się i natychmiast zmień hasło - logowanie wymusi to automatycznie.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
