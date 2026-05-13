import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const total = await prisma.knowledge.count();
const packagingCount = await prisma.knowledge.count({ where: { category: 'packaging' } });
const allCats = await prisma.knowledge.groupBy({ by: ['category'], _count: true });
console.log({ totalRows: total, packagingRows: packagingCount, byCategory: allCats });
await prisma.$disconnect();
