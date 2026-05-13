import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const result = await prisma.knowledge.deleteMany({ where: { category: 'packaging' } });
console.log('Deleted', result.count, 'rows from Knowledge table');
const remaining = await prisma.knowledge.count();
console.log('Remaining rows:', remaining);
await prisma.$disconnect();
