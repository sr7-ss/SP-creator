import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const [, , email, password] = process.argv;
if (!email || !password) {
  console.error('Usage: node scripts/reset-password.mjs <email> <password>');
  process.exit(1);
}

const prisma = new PrismaClient();
const passwordHash = await bcrypt.hash(password, 12);
const user = await prisma.user.update({
  where: { email },
  data: { passwordHash },
});
console.log(`Updated password for ${user.email} (id=${user.id})`);
await prisma.$disconnect();
