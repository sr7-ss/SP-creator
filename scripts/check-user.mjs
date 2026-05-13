import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const email = process.argv[2] || 'sergiohongx@gmail.com';

const user = await prisma.user.findUnique({
  where: { email },
  select: {
    id: true,
    email: true,
    name: true,
    passwordHash: true,
    plan: true,
    credits: true,
    createdAt: true,
    accounts: { select: { provider: true } },
  },
});

if (!user) {
  console.log(`NOT FOUND: ${email}`);
  const total = await prisma.user.count();
  console.log(`User table has ${total} rows total.`);
  if (total > 0 && total < 20) {
    const all = await prisma.user.findMany({ select: { email: true, createdAt: true }, take: 20 });
    console.log('Existing emails:', all);
  }
} else {
  console.log({
    ...user,
    passwordHash: user.passwordHash ? `[set, ${user.passwordHash.length} chars]` : null,
  });
}

await prisma.$disconnect();
